import { ValidationError } from "../shared/errors";
import { assertValidIanaTimezone, assertValidLocalTime, formatInstantInTimezone, resolveLocalDateTime, weekdayForDate } from "./time";

export type GuideSchedule = {
  dayOfWeek: number;
  startTimeLocal: string;
  endTimeLocal: string;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  active: boolean;
};

export type GuideUnavailabilityWindow = { startsAt: Date; endsAt: Date };

function dateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function guideScheduleAllowsSlot(input: {
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  schedules: GuideSchedule[];
  unavailability: GuideUnavailabilityWindow[];
}): boolean {
  const timezone = assertValidIanaTimezone(input.timezone);
  if (input.startsAt >= input.endsAt) throw new ValidationError("A guide schedule check requires a valid time interval.");
  if (input.unavailability.some((window) => window.startsAt < input.endsAt && window.endsAt > input.startsAt)) return false;

  const localStart = formatInstantInTimezone(input.startsAt, timezone);
  const localEnd = formatInstantInTimezone(input.endsAt, timezone);
  if (localStart.date !== localEnd.date) return false;
  const startMinute = assertValidLocalTime(localStart.time);
  const endMinute = assertValidLocalTime(localEnd.time);
  if (startMinute >= endMinute) return false;

  const weekday = weekdayForDate(localStart.date);
  const matchingSchedules = input.schedules.filter((schedule) => {
    if (!schedule.active || schedule.dayOfWeek !== weekday) return false;
    const effectiveFrom = schedule.effectiveFrom ? dateOnly(schedule.effectiveFrom) : null;
    const effectiveTo = schedule.effectiveTo ? dateOnly(schedule.effectiveTo) : null;
    return !(effectiveFrom && localStart.date < effectiveFrom) && !(effectiveTo && localStart.date > effectiveTo);
  }).map((schedule) => {
    const scheduleStart = assertValidLocalTime(schedule.startTimeLocal);
    const scheduleEnd = assertValidLocalTime(schedule.endTimeLocal);
    if (scheduleStart >= scheduleEnd) throw new ValidationError("Guide schedule rules must end after they start.");
    resolveLocalDateTime(localStart.date, schedule.startTimeLocal, timezone);
    resolveLocalDateTime(localStart.date, schedule.endTimeLocal, timezone);
    return { schedule, scheduleStart, scheduleEnd };
  });

  return matchingSchedules.some(({ schedule, scheduleStart, scheduleEnd }) => {
    void schedule;
    return startMinute >= scheduleStart && endMinute <= scheduleEnd;
  });
}