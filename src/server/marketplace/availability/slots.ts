import { DestinationStatus, ExperienceStatus, SlotReservationStatus, TourSlotStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { NotFoundError, ValidationError } from "../shared/errors";
import { isBlockedByException, toCandidate } from "./exceptions";
import { consumesCapacity } from "./reservation";
import { assertValidAvailabilityRange, validateAvailabilityDateRange, type AvailabilityRangeInput } from "./schemas";
import { assertValidIanaTimezone, formatInstantInTimezone, utcSearchBounds } from "./time";
import type { AvailabilityException } from "./types";

export type BookableSlot = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  capacity: number;
  /** Seats still available, derived from actual active reservations. Never from Experience.groupLimit. */
  remainingCapacity: number;
  guideId: string;
};

/**
 * Reads concrete, already-materialized departures. This never generates inventory: a departure
 * that was never materialized into a `TourSlot` is not bookable, no matter which recurring rule
 * would otherwise allow it.
 */
export async function listBookableSlots(experienceSlug: string, input: unknown): Promise<BookableSlot[]> {
  const range: AvailabilityRangeInput = assertValidAvailabilityRange(input);
  const experience = await prisma.experience.findFirst({
    where: {
      slug: experienceSlug,
      status: ExperienceStatus.ACTIVE,
      destination: { status: DestinationStatus.PUBLISHED },
      guide: { active: true, verified: true, verificationStatus: VerificationStatus.APPROVED },
    },
    select: {
      id: true,
      timezone: true,
      availabilityExceptions: { select: { id: true, type: true, date: true, startsAt: true, endsAt: true, capacityOverride: true } },
    },
  });
  if (!experience) throw new NotFoundError("Experience not found.");
  if (!experience.timezone) throw new ValidationError("The experience does not have a valid IANA timezone.");
  const timezone = assertValidIanaTimezone(experience.timezone);
  const now = new Date();
  validateAvailabilityDateRange(range.dateFrom, range.dateTo, timezone, now);

  const bounds = utcSearchBounds(range.dateFrom, range.dateTo);
  const slots = await prisma.tourSlot.findMany({
    where: {
      experienceId: experience.id,
      status: TourSlotStatus.OPEN,
      startsAt: { gt: now, lt: bounds.upper },
      endsAt: { gt: bounds.lower },
      guide: { active: true, verified: true, verificationStatus: VerificationStatus.APPROVED },
    },
    select: { id: true, startsAt: true, endsAt: true, timezone: true, capacity: true, guideId: true },
    orderBy: [{ startsAt: "asc" }, { id: "asc" }],
  });

  const exceptions = experience.availabilityExceptions as AvailabilityException[];
  const bookable = slots.filter((slot) => {
    const date = formatInstantInTimezone(slot.startsAt, timezone).date;
    return date >= range.dateFrom && date < range.dateTo && !isBlockedByException(toCandidate(slot, timezone), exceptions, timezone);
  });
  if (bookable.length === 0) return [];

  // Remaining capacity comes from the authoritative reservation rows for these concrete slots.
  // Stale HELD reservations are excluded, so a lapsed hold never suppresses availability.
  const reservations = await prisma.slotReservation.findMany({
    where: { slotId: { in: bookable.map((slot) => slot.id) }, status: { in: [SlotReservationStatus.HELD, SlotReservationStatus.CONFIRMED] } },
    select: { slotId: true, status: true, partySize: true, expiresAt: true },
  });
  const usedBySlot = new Map<string, number>();
  for (const row of reservations) {
    if (!consumesCapacity(row.status, row.expiresAt, now)) continue;
    usedBySlot.set(row.slotId, (usedBySlot.get(row.slotId) ?? 0) + row.partySize);
  }

  return bookable.map((slot) => ({ ...slot, remainingCapacity: Math.max(0, slot.capacity - (usedBySlot.get(slot.id) ?? 0)) }));
}