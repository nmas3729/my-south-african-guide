import { AvailabilityExceptionType } from "@prisma/client";
import { ConflictError, ValidationError } from "../shared/errors";
import { formatInstantInTimezone } from "./time";
import type { AvailabilityException, DepartureCandidate } from "./types";

export type { AvailabilityException, DepartureCandidate } from "./types";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function exceptionMatches(exception: AvailabilityException, candidate: DepartureCandidate, timezone: string): boolean {
  const localDate = formatInstantInTimezone(candidate.startsAt, timezone).date;
  if (exception.date && dateOnly(exception.date) !== localDate) return false;
  const hasStart = exception.startsAt !== null;
  const hasEnd = exception.endsAt !== null;
  if (hasStart !== hasEnd) throw new ValidationError(`Availability exception ${exception.id} must have both interval endpoints.`);
  if (!exception.date && !hasStart) throw new ValidationError(`Availability exception ${exception.id} must specify a date or interval.`);
  if (hasStart && hasEnd && !(exception.startsAt!.getTime() < candidate.endsAt.getTime() && exception.endsAt!.getTime() > candidate.startsAt.getTime())) return false;
  return true;
}

/**
 * Applies the approved precedence for a single departure: a blocking exception always wins,
 * otherwise at most one capacity override may apply. Matching exceptions are ordered by id so
 * the outcome does not depend on database row order.
 */
export function evaluateExceptionForDeparture(input: {
  candidate: DepartureCandidate;
  timezone: string;
  exceptions: AvailabilityException[];
}): { blocked: boolean; capacityOverride: number | null } {
  const matching = [...input.exceptions]
    .sort((left, right) => left.id.localeCompare(right.id))
    .filter((exception) => exceptionMatches(exception, input.candidate, input.timezone));

  if (matching.some((exception) => exception.type === AvailabilityExceptionType.BLOCKED)) return { blocked: true, capacityOverride: null };

  const overrides = matching
    .filter((exception) => exception.type === AvailabilityExceptionType.CAPACITY_OVERRIDE)
    .map((exception) => exception.capacityOverride);
  if (overrides.some((capacity) => capacity === null || !Number.isInteger(capacity) || capacity <= 0)) {
    throw new ValidationError("A matching capacity exception must have a positive capacity override.");
  }
  const distinctOverrides = [...new Set(overrides)];
  if (distinctOverrides.length > 1) throw new ConflictError("Matching availability exceptions specify conflicting capacities.");
  return { blocked: false, capacityOverride: distinctOverrides[0] ?? null };
}

/**
 * Explicit special departures are concrete by definition and therefore do not require a
 * matching recurring rule. They are still validated, bounded by the requested range, and must
 * be future instants.
 */
export function specialDepartureCandidates(input: {
  dateFrom: string;
  dateTo: string;
  timezone: string;
  exceptions: AvailabilityException[];
  now: Date;
}): DepartureCandidate[] {
  const specials = input.exceptions
    .filter((exception) => exception.type === AvailabilityExceptionType.SPECIAL_DEPARTURE)
    .sort((left, right) => left.id.localeCompare(right.id));
  const result: DepartureCandidate[] = [];

  for (const exception of specials) {
    if (!exception.startsAt || !exception.endsAt || exception.startsAt >= exception.endsAt) {
      throw new ValidationError(`Special departure ${exception.id} must have a valid start and end instant.`);
    }
    const localDate = formatInstantInTimezone(exception.startsAt, input.timezone).date;
    if (exception.date && dateOnly(exception.date) !== localDate) throw new ValidationError(`Special departure ${exception.id} date does not match its start instant.`);
    if (localDate < input.dateFrom || localDate >= input.dateTo || exception.startsAt <= input.now) continue;
    if (exception.capacityOverride !== null && (!Number.isInteger(exception.capacityOverride) || exception.capacityOverride <= 0)) {
      throw new ValidationError(`Special departure ${exception.id} has an invalid capacity override.`);
    }
    result.push({
      startsAt: exception.startsAt,
      endsAt: exception.endsAt,
      localDate,
      ruleId: null,
      ruleCapacity: null,
      exceptionCapacity: exception.capacityOverride,
    });
  }
  return result;
}

export function isBlockedByException(candidate: DepartureCandidate, exceptions: AvailabilityException[], timezone: string): boolean {
  return exceptions.some((exception) => exception.type === AvailabilityExceptionType.BLOCKED && exceptionMatches(exception, candidate, timezone));
}

/**
 * Projects an already-persisted concrete slot back into the candidate shape the exception
 * evaluators accept. Generation uses it to decide whether a stored slot must be closed, and slot
 * lookup uses it to hide a stored slot that a later exception now blocks. A persisted slot has no
 * originating rule or rule-level capacity, so those fields stay null.
 */
export function toCandidate(slot: { startsAt: Date; endsAt: Date }, timezone: string): DepartureCandidate {
  return {
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    localDate: formatInstantInTimezone(slot.startsAt, timezone).date,
    ruleId: null,
    ruleCapacity: null,
    exceptionCapacity: null,
  };
}