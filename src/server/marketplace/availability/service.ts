import { randomUUID } from "node:crypto";
import { DestinationStatus, ExperienceStatus, Prisma, TourSlotStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { requireRole } from "../../auth/session";
import { ConflictError, NotFoundError, ValidationError } from "../shared/errors";
import { throwMappedSlotGenerationError } from "./conflicts";
import { evaluateExceptionForDeparture, isBlockedByException, specialDepartureCandidates, toCandidate } from "./exceptions";
import { guideScheduleAllowsSlot } from "./guide-schedule";
import { assertValidAvailabilityGenerationInput, configuredAvailabilityHorizonDays, validateAvailabilityDateRange, type GenerateAvailabilityInput } from "./schemas";
import { evaluateRecurringAvailability } from "./rules";
import { addCalendarDays, assertValidIanaTimezone, formatInstantInTimezone, utcSearchBounds } from "./time";
import type { AvailabilityException, DepartureCandidate, RecurringAvailabilityRule } from "./types";

const experienceGenerationSelect = {
  id: true,
  guideId: true,
  timezone: true,
  duration: true,
  groupLimit: true,
  status: true,
  destination: { select: { status: true } },
  guide: { select: { active: true, verified: true, verificationStatus: true } },
  eligibleGuides: { select: { guideId: true } },
  availabilityRules: { select: { id: true, dayOfWeek: true, startTimeLocal: true, endTimeLocal: true, durationMinutes: true, capacityOverride: true, seasonStartDate: true, seasonEndDate: true, active: true }, orderBy: { id: "asc" } },
  availabilityExceptions: { select: { id: true, type: true, date: true, startsAt: true, endsAt: true, capacityOverride: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
} satisfies Prisma.ExperienceSelect;

type ExperienceForGeneration = Prisma.ExperienceGetPayload<{ select: typeof experienceGenerationSelect }>;

function validateGuideForExperience(experience: ExperienceForGeneration, selectedGuideId: string | undefined): string {
  const guideId = selectedGuideId ?? experience.guideId;
  if (guideId !== experience.guideId && !experience.eligibleGuides.some((eligible) => eligible.guideId === guideId)) {
    throw new ValidationError("The assigned guide is not eligible for this experience.");
  }
  return guideId;
}

function capacityForCandidate(input: {
  requestedCapacity?: number;
  groupLimit: number | null;
  candidate: DepartureCandidate;
  exceptionCapacity: number | null;
}): number {
  const capacity = input.requestedCapacity ?? input.exceptionCapacity ?? input.candidate.exceptionCapacity ?? input.candidate.ruleCapacity ?? input.groupLimit;
  if (!Number.isInteger(capacity) || !capacity || capacity <= 0) {
    throw new ValidationError("A positive capacity must be supplied by the request, an exception, an availability rule, or Experience.groupLimit.");
  }
  return capacity;
}

function ensureUniqueCandidates(candidates: DepartureCandidate[], timezone: string): DepartureCandidate[] {
  const unique = new Map<number, DepartureCandidate>();
  for (const candidate of candidates) {
    const key = candidate.startsAt.getTime();
    const localTime = formatInstantInTimezone(candidate.startsAt, timezone).time;
    const existing = unique.get(key);
    if (!existing) {
      unique.set(key, candidate);
      continue;
    }
    if (existing.ruleId === null && candidate.ruleId === null) {
      if (existing.endsAt.getTime() !== candidate.endsAt.getTime() || existing.exceptionCapacity !== candidate.exceptionCapacity) {
        throw new ConflictError(`Special departures conflict for ${candidate.localDate} ${localTime}.`);
      }
      continue;
    }
    if (existing.ruleId !== null && candidate.ruleId === null) {
      unique.set(key, candidate);
      continue;
    }
    if (existing.ruleId === null) continue;
    if (existing.endsAt.getTime() !== candidate.endsAt.getTime() || existing.ruleCapacity !== candidate.ruleCapacity) {
      throw new ConflictError(`Availability sources conflict for ${candidate.localDate} ${localTime}.`);
    }
  }
  return [...unique.values()].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}

async function generateInsideTransaction(tx: Prisma.TransactionClient, input: GenerateAvailabilityInput, now: Date) {
  const experience = await tx.experience.findUnique({ where: { id: input.experienceId }, select: experienceGenerationSelect });
  if (!experience || experience.status !== ExperienceStatus.ACTIVE || experience.destination.status !== DestinationStatus.PUBLISHED) {
    throw new NotFoundError("Active experience not found.");
  }
  if (!experience.timezone) throw new ValidationError("The experience must have an IANA timezone before generating slots.");
  const timezone = assertValidIanaTimezone(experience.timezone);
  validateAvailabilityDateRange(input.dateFrom, input.dateTo, timezone, now);
  if (!Number.isInteger(experience.duration) || experience.duration <= 0) throw new ValidationError("The experience duration must be a positive number of minutes.");

  const guideId = validateGuideForExperience(experience, input.guideId);
  const guide = await tx.guideProfile.findUnique({
    where: { id: guideId },
    select: { id: true, timezone: true, active: true, verified: true, verificationStatus: true, scheduleRules: { select: { dayOfWeek: true, startTimeLocal: true, endTimeLocal: true, effectiveFrom: true, effectiveTo: true, active: true } }, unavailability: { select: { startsAt: true, endsAt: true } } },
  });
  if (!guide || !guide.active || !guide.verified || guide.verificationStatus !== VerificationStatus.APPROVED) {
    throw new ValidationError("The assigned guide must be active, verified, and approved.");
  }
  if (!guide.timezone) throw new ValidationError("The assigned guide must have an IANA timezone to evaluate their schedule.");
  const guideTimezone = assertValidIanaTimezone(guide.timezone);

  const rules = experience.availabilityRules as RecurringAvailabilityRule[];
  const exceptions = experience.availabilityExceptions as AvailabilityException[];
  const candidates: DepartureCandidate[] = [];
  let blockedCandidateCount = 0;

  for (let date = input.dateFrom; date < input.dateTo; date = addCalendarDays(date, 1)) {
    const dailyCandidates = evaluateRecurringAvailability({ date, timezone, durationMinutes: experience.duration, rules, now });
    for (const candidate of dailyCandidates) {
      const exception = evaluateExceptionForDeparture({ candidate, timezone, exceptions });
      if (exception.blocked) {
        blockedCandidateCount += 1;
        continue;
      }
      candidates.push({ ...candidate, exceptionCapacity: exception.capacityOverride });
    }
  }

  const specials = specialDepartureCandidates({ dateFrom: input.dateFrom, dateTo: input.dateTo, timezone, exceptions, now });
  for (const candidate of specials) {
    const exception = evaluateExceptionForDeparture({ candidate, timezone, exceptions });
    if (exception.blocked) {
      blockedCandidateCount += 1;
      continue;
    }
    candidates.push({ ...candidate, exceptionCapacity: exception.capacityOverride ?? candidate.exceptionCapacity });
  }

  const boundedRange = utcSearchBounds(input.dateFrom, input.dateTo);
  const existingSlots = await tx.tourSlot.findMany({
    where: { experienceId: experience.id, startsAt: { lt: boundedRange.upper }, endsAt: { gt: boundedRange.lower } },
    select: { id: true, startsAt: true, endsAt: true, status: true },
  });
  const blockedExistingIds = existingSlots
    .filter((slot) => {
      if (slot.status !== TourSlotStatus.OPEN || slot.startsAt <= now) return false;
      const localDate = formatInstantInTimezone(slot.startsAt, timezone).date;
      return localDate >= input.dateFrom && localDate < input.dateTo && isBlockedByException(toCandidate(slot, timezone), exceptions, timezone);
    })
    .map((slot) => slot.id);
  const closedCount = blockedExistingIds.length === 0 ? 0 : (await tx.tourSlot.updateMany({
    where: { id: { in: blockedExistingIds }, status: TourSlotStatus.OPEN },
    data: { status: TourSlotStatus.CLOSED, updatedAt: now },
  })).count;

  const existingStarts = new Set(existingSlots.map((slot) => slot.startsAt.getTime()));
  const uniqueCandidates = ensureUniqueCandidates(candidates, timezone);
  let existingCount = 0;
  let guideScheduleSkippedCount = 0;
  const slotData: Prisma.TourSlotCreateManyInput[] = [];

  for (const candidate of uniqueCandidates) {
    if (existingStarts.has(candidate.startsAt.getTime())) {
      existingCount += 1;
      continue;
    }
    if (!guideScheduleAllowsSlot({ startsAt: candidate.startsAt, endsAt: candidate.endsAt, timezone: guideTimezone, schedules: guide.scheduleRules, unavailability: guide.unavailability })) {
      guideScheduleSkippedCount += 1;
      continue;
    }
    slotData.push({
      experienceId: experience.id,
      guideId: guide.id,
      startsAt: candidate.startsAt,
      endsAt: candidate.endsAt,
      timezone,
      capacity: capacityForCandidate({ requestedCapacity: input.capacity, groupLimit: experience.groupLimit, candidate, exceptionCapacity: candidate.exceptionCapacity }),
      status: TourSlotStatus.OPEN,
    });
  }

  let createdCount = 0;
  for (let offset = 0; offset < slotData.length; offset += 500) {
    const values = slotData.slice(offset, offset + 500).map((slot) => Prisma.sql`(${randomUUID()}, ${slot.experienceId}, ${slot.guideId}, ${slot.startsAt}, ${slot.endsAt}, ${slot.timezone}, ${slot.capacity}, ${TourSlotStatus.OPEN}::"TourSlotStatus")`);
    createdCount += await tx.$executeRaw(Prisma.sql`
      INSERT INTO "TourSlot" ("id", "experienceId", "guideId", "startsAt", "endsAt", "timezone", "capacity", "status")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("experienceId", "startsAt") DO NOTHING
    `);
  }
  return {
    experienceId: experience.id,
    guideId: guide.id,
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    horizonDays: configuredAvailabilityHorizonDays(),
    candidateCount: uniqueCandidates.length,
    createdCount,
    existingCount: existingCount + slotData.length - createdCount,
    blockedCandidateCount,
    guideScheduleSkippedCount,
    closedCount,
  };
}

export async function generateExperienceSlots(input: unknown) {
  await requireRole("ADMIN");
  const parsed = assertValidAvailabilityGenerationInput(input);
  try {
    return await prisma.$transaction((tx) => generateInsideTransaction(tx, parsed, new Date()));
  } catch (error) {
    return throwMappedSlotGenerationError(error);
  }
}