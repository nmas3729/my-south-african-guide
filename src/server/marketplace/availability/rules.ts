import { ConflictError, ValidationError } from "../shared/errors";
import { assertValidLocalTime, resolveLocalDateTime, weekdayForDate } from "./time";
import type { DepartureCandidate, RecurringAvailabilityRule } from "./types";

export type { DepartureCandidate, RecurringAvailabilityRule } from "./types";

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/**
 * Validates a recurring template independently of the day being generated, so an unusable
 * rule fails deterministically instead of only on its own weekday.
 */
function assertUsableRule(rule: RecurringAvailabilityRule): { startMinute: number; endMinute: number } {
  if (!Number.isInteger(rule.dayOfWeek) || rule.dayOfWeek < 0 || rule.dayOfWeek > 6) {
    throw new ValidationError(`Availability rule ${rule.id} has an invalid day of week.`);
  }
  const startMinute = assertValidLocalTime(rule.startTimeLocal);
  const endMinute = assertValidLocalTime(rule.endTimeLocal);
  if (startMinute >= endMinute) throw new ValidationError(`Availability rule ${rule.id} must end after it starts.`);
  if (rule.capacityOverride !== null && (!Number.isInteger(rule.capacityOverride) || rule.capacityOverride <= 0)) {
    throw new ValidationError(`Availability rule ${rule.id} has an invalid capacity override.`);
  }
  return { startMinute, endMinute };
}

/**
 * Produces every concrete departure that the recurring weekly templates allow for a single
 * local calendar date. The departure length and stepping come from `Experience.duration`;
 * `AvailabilityRule.durationMinutes` is ignored so it cannot become a competing definition.
 */
export function evaluateRecurringAvailability(input: {
  date: string;
  timezone: string;
  durationMinutes: number;
  rules: RecurringAvailabilityRule[];
  now: Date;
}): DepartureCandidate[] {
  const ordered = [...input.rules].sort((left, right) => left.id.localeCompare(right.id));
  for (const rule of ordered) {
    if (rule.active) assertUsableRule(rule);
  }

  const weekday = weekdayForDate(input.date);
  const candidates = new Map<number, DepartureCandidate>();

  for (const rule of ordered) {
    if (!rule.active || rule.dayOfWeek !== weekday) continue;
    const { startMinute, endMinute } = assertUsableRule(rule);

    const seasonStart = rule.seasonStartDate ? dateOnly(rule.seasonStartDate) : null;
    const seasonEnd = rule.seasonEndDate ? dateOnly(rule.seasonEndDate) : null;
    if ((seasonStart && input.date < seasonStart) || (seasonEnd && input.date > seasonEnd)) continue;
    if (endMinute - startMinute < input.durationMinutes) continue;

    const rangeEnd = resolveLocalDateTime(input.date, rule.endTimeLocal, input.timezone);
    for (let startMinuteOfDay = startMinute; startMinuteOfDay + input.durationMinutes <= endMinute; startMinuteOfDay += input.durationMinutes) {
      const localTime = `${Math.floor(startMinuteOfDay / 60).toString().padStart(2, "0")}:${(startMinuteOfDay % 60).toString().padStart(2, "0")}`;
      const startsAt = resolveLocalDateTime(input.date, localTime, input.timezone);
      const endsAt = new Date(startsAt.getTime() + input.durationMinutes * 60_000);
      if (endsAt > rangeEnd || startsAt <= input.now) continue;

      const candidate: DepartureCandidate = {
        startsAt,
        endsAt,
        localDate: input.date,
        ruleId: rule.id,
        ruleCapacity: rule.capacityOverride,
        exceptionCapacity: null,
      };
      const existing = candidates.get(startsAt.getTime());
      if (existing && (existing.endsAt.getTime() !== endsAt.getTime() || existing.ruleCapacity !== candidate.ruleCapacity)) {
        throw new ConflictError(`Availability rules conflict for departure ${input.date} ${localTime}.`);
      }
      candidates.set(startsAt.getTime(), candidate);
    }
  }

  return [...candidates.values()].sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime());
}
