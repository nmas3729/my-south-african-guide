import { TourSlotStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { requireRole } from "../../auth/session";
import { AuthorizationError, ConflictError, NotFoundError } from "../shared/errors";
import { assertValidIanaTimezone } from "./time";
import { assertValidGuideScheduleRuleInput, assertValidGuideScheduleRuleUpdate, assertValidGuideUnavailabilityInput } from "./schemas";

export type GuideScheduleRuleDto = {
  id: string;
  dayOfWeek: number;
  startTimeLocal: string;
  endTimeLocal: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  active: boolean;
};

export type GuideUnavailabilityDto = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  reason: string | null;
};

const scheduleRuleSelect = { id: true, dayOfWeek: true, startTimeLocal: true, endTimeLocal: true, effectiveFrom: true, effectiveTo: true, active: true } as const;
const unavailabilitySelect = { id: true, startsAt: true, endsAt: true, allDay: true, reason: true } as const;

/**
 * Resolves the guide whose availability is being managed. The identifier always comes from the
 * authenticated session, never from the request body or URL.
 */
async function requireOwnGuideProfile(userId: string) {
  const guide = await prisma.guideProfile.findUnique({ where: { userId }, select: { id: true, timezone: true } });
  if (!guide) throw new NotFoundError("Guide profile not found.");
  return guide;
}

/** Resolves the caller's guide and requires a usable IANA timezone for wall-clock evaluation. */
async function requireOwnScheduleGuide() {
  const user = await requireRole("GUIDE");
  const guide = await requireOwnGuideProfile(user.id);
  if (!guide.timezone) throw new ConflictError("Your guide profile must have an IANA timezone before editing your schedule.");
  return { guide, timezone: assertValidIanaTimezone(guide.timezone) };
}

export async function listMyScheduleRules(): Promise<GuideScheduleRuleDto[]> {
  const { guide } = await requireOwnScheduleGuide();
  return prisma.guideScheduleRule.findMany({ where: { guideId: guide.id }, select: scheduleRuleSelect, orderBy: [{ dayOfWeek: "asc" }, { startTimeLocal: "asc" }, { id: "asc" }] });
}

export async function createMyScheduleRule(input: unknown): Promise<GuideScheduleRuleDto> {
  const { guide, timezone } = await requireOwnScheduleGuide();
  const data = assertValidGuideScheduleRuleInput(input, timezone);
  return prisma.guideScheduleRule.create({
    data: { guideId: guide.id, dayOfWeek: data.dayOfWeek, startTimeLocal: data.startTimeLocal, endTimeLocal: data.endTimeLocal, effectiveFrom: data.effectiveFrom ?? null, effectiveTo: data.effectiveTo ?? null },
    select: scheduleRuleSelect,
  });
}

export async function disableMyScheduleRule(ruleId: string): Promise<GuideScheduleRuleDto> {
  const { guide } = await requireOwnScheduleGuide();
  const updated = await prisma.guideScheduleRule.updateMany({ where: { id: ruleId, guideId: guide.id }, data: { active: false } });
  if (updated.count !== 1) throw new NotFoundError("Schedule rule not found.");
  const refreshed = await prisma.guideScheduleRule.findUnique({ where: { id: ruleId }, select: scheduleRuleSelect });
  if (!refreshed) throw new NotFoundError("Schedule rule not found.");
  return refreshed;
}
export async function updateMyScheduleRule(ruleId: string, input: unknown): Promise<GuideScheduleRuleDto> {
  const { guide, timezone } = await requireOwnScheduleGuide();
  const data = assertValidGuideScheduleRuleUpdate(input, timezone);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.guideScheduleRule.findUnique({ where: { id: ruleId }, select: { id: true, guideId: true, startTimeLocal: true, endTimeLocal: true, effectiveFrom: true, effectiveTo: true } });
    if (!existing || existing.guideId !== guide.id) throw new NotFoundError("Schedule rule not found.");

    // Re-validate the resulting window when only one endpoint is supplied.
    if (data.startTimeLocal !== undefined || data.endTimeLocal !== undefined) {
      assertValidGuideScheduleRuleInput({ dayOfWeek: 1, startTimeLocal: data.startTimeLocal ?? existing.startTimeLocal, endTimeLocal: data.endTimeLocal ?? existing.endTimeLocal }, timezone);
    }
    // A new bound must stay consistent with the bound it is compared against.
    const effectiveFrom = data.effectiveFrom !== undefined && data.effectiveFrom !== null ? new Date(`${data.effectiveFrom}T00:00:00.000Z`) : existing.effectiveFrom;
    const effectiveTo = data.effectiveTo !== undefined && data.effectiveTo !== null ? new Date(`${data.effectiveTo}T00:00:00.000Z`) : existing.effectiveTo;
    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) throw new ConflictError("effectiveFrom cannot be later than effectiveTo.");

    // Date columns receive instants, not the raw YYYY-MM-DD strings the schema parsed.
    const { effectiveFrom: _from, effectiveTo: _to, ...otherFields } = data;
    void _from;
    void _to;
    const patch = {
      ...otherFields,
      ...(effectiveFrom !== undefined ? { effectiveFrom } : {}),
      ...(effectiveTo !== undefined ? { effectiveTo } : {}),
    };

    // Ownership is enforced in the write itself, not only by the preceding read.
    const updated = await tx.guideScheduleRule.updateMany({ where: { id: ruleId, guideId: guide.id }, data: patch });
    if (updated.count !== 1) throw new AuthorizationError();

    const refreshed = await tx.guideScheduleRule.findUnique({ where: { id: ruleId }, select: scheduleRuleSelect });
    if (!refreshed) throw new NotFoundError("Schedule rule not found.");
    return refreshed;
  });
}

export async function listMyUnavailability(): Promise<GuideUnavailabilityDto[]> {
  const { guide } = await requireOwnScheduleGuide();
  return prisma.guideUnavailability.findMany({ where: { guideId: guide.id }, select: unavailabilitySelect, orderBy: [{ startsAt: "asc" }, { id: "asc" }] });
}

export type CreatedUnavailabilityDto = GuideUnavailabilityDto & { closedSlotCount: number };

/**
 * Records a dated block on the guide's own calendar and takes the guide out of service for every
 * affected future departure in the SAME transaction.
 *
 * Recurring schedule edits deliberately do not reconcile materialized slots, and generation never
 * closes slots for guide unavailability. A dated unavailability window is therefore the only immediate
 * mechanism, and it is the only path that closes existing departures.
 *
 * Atomicity: the unavailability row and every slot closure commit together. If any affected slot
 * cannot be closed safely, the transaction rolls back and no unavailability row is persisted.
 */
export async function createMyUnavailability(input: unknown, now = new Date()): Promise<CreatedUnavailabilityDto> {
  const { guide } = await requireOwnScheduleGuide();
  const data = assertValidGuideUnavailabilityInput(input);

  return prisma.$transaction(async (tx): Promise<CreatedUnavailabilityDto> => {
    const created = await tx.guideUnavailability.create({
      data: { guideId: guide.id, startsAt: data.startsAt, endsAt: data.endsAt, allDay: data.allDay ?? false, reason: data.reason ?? null },
      select: unavailabilitySelect,
    });

    // Half-open overlap, matching the generator's own unavailability rule.
    const affected = await tx.tourSlot.findMany({
      where: { guideId: guide.id, status: TourSlotStatus.OPEN, startsAt: { gt: now, lt: data.endsAt }, endsAt: { gt: data.startsAt } },
      select: { id: true },
    });

    if (affected.length === 0) return { ...created, closedSlotCount: 0 };

    const affectedIds = affected.map((slot) => slot.id);
    const bookingCount = await tx.booking.count({ where: { slotId: { in: affectedIds } } });
    // Throwing here discards the unavailability row created above as well.
    if (bookingCount > 0) throw new ConflictError("One or more departures in this window have bookings. Cancel or move those bookings first.");

    const closed = await tx.tourSlot.updateMany({ where: { id: { in: affectedIds }, status: TourSlotStatus.OPEN }, data: { status: TourSlotStatus.CLOSED, updatedAt: now } });
    if (closed.count !== affectedIds.length) throw new ConflictError("This availability window could not be applied completely.");

    return { ...created, closedSlotCount: closed.count };
  });
}

/** Hard delete: `GuideUnavailability` has no soft-delete column. Removal never reopens slots. */
export async function removeMyUnavailability(unavailabilityId: string): Promise<void> {
  const { guide } = await requireOwnScheduleGuide();
  const deleted = await prisma.guideUnavailability.deleteMany({ where: { id: unavailabilityId, guideId: guide.id } });
  if (deleted.count !== 1) throw new NotFoundError("Unavailability window not found.");
}