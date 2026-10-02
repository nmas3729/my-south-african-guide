import type { AvailabilityExceptionType } from "@prisma/client";

/**
 * Recurring weekly template row from `AvailabilityRule`.
 * `dayOfWeek` follows the JS/PostgreSQL `getDay()` convention: 0 = Sunday .. 6 = Saturday.
 * `durationMinutes` is a retained compatibility column; it is never read as a competing
 * departure definition. See docs/availability.md.
 */
export type RecurringAvailabilityRule = {
  id: string;
  dayOfWeek: number;
  startTimeLocal: string;
  endTimeLocal: string;
  durationMinutes: number | null;
  capacityOverride: number | null;
  seasonStartDate: Date | null;
  seasonEndDate: Date | null;
  active: boolean;
};

/** Date/period specific override row from `AvailabilityException`. Instants are UTC. */
export type AvailabilityException = {
  id: string;
  type: AvailabilityExceptionType;
  date: Date | null;
  startsAt: Date | null;
  endsAt: Date | null;
  capacityOverride: number | null;
};

/**
 * A concrete departure produced by recurring availability or by an explicit special departure,
 * before guide, capacity and slot materialization are applied.
 */
export type DepartureCandidate = {
  startsAt: Date;
  endsAt: Date;
  localDate: string;
  ruleId: string | null;
  ruleCapacity: number | null;
  exceptionCapacity: number | null;
};