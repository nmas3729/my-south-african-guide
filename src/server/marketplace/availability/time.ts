import { ValidationError } from "../shared/errors";

export type LocalDateTime = { date: string; time: string };

type LocalParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();
const offsetCache = new Map<string, number[]>();

function formatter(timezone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timezone);
  if (cached) return cached;

  const value = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timezone, value);
  return value;
}

function localParts(instant: Date, timezone: string): LocalParts {
  const values = Object.fromEntries(formatter(timezone).formatToParts(instant).map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function parseDate(date: string): { year: number; month: number; day: number } {
  const match = datePattern.exec(date);
  if (!match) throw new ValidationError("Dates must use YYYY-MM-DD format.");

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const normalized = new Date(Date.UTC(year, month - 1, day));
  if (year < 1000 || normalized.getUTCFullYear() !== year || normalized.getUTCMonth() + 1 !== month || normalized.getUTCDate() !== day) {
    throw new ValidationError("The supplied calendar date is invalid.");
  }
  return { year, month, day };
}

export function assertValidIanaTimezone(timezone: string): string {
  if (!timezone || timezone.trim() !== timezone) throw new ValidationError("A valid IANA timezone is required.");
  try {
    return formatter(timezone).resolvedOptions().timeZone;
  } catch (error) {
    throw new ValidationError("A valid IANA timezone is required.", { cause: error });
  }
}

export function assertValidLocalTime(time: string): number {
  const match = timePattern.exec(time);
  if (!match) throw new ValidationError("Local times must use 24-hour HH:mm format.");
  return Number(match[1]) * 60 + Number(match[2]);
}

export function assertValidIsoDate(date: string): string {
  parseDate(date);
  return date;
}

export function addCalendarDays(date: string, days: number): string {
  const { year, month, day } = parseDate(date);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return [result.getUTCFullYear().toString().padStart(4, "0"), (result.getUTCMonth() + 1).toString().padStart(2, "0"), result.getUTCDate().toString().padStart(2, "0")].join("-");
}

export function weekdayForDate(date: string): number {
  const { year, month, day } = parseDate(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function formatInstantInTimezone(instant: Date, timezone: string): LocalDateTime {
  const canonicalTimezone = assertValidIanaTimezone(timezone);
  const parts = localParts(instant, canonicalTimezone);
  return {
    date: `${parts.year.toString().padStart(4, "0")}-${parts.month.toString().padStart(2, "0")}-${parts.day.toString().padStart(2, "0")}`,
    time: `${parts.hour.toString().padStart(2, "0")}:${parts.minute.toString().padStart(2, "0")}`,
  };
}

/**
 * Converts an inclusive/exclusive local calendar range into a wider UTC search window. The padding
 * absorbs the offset difference between the experience timezone and UTC so a concrete departure that
 * belongs to the requested local range is never dropped by an instant comparison. The range itself
 * is always re-checked against the local date of each record.
 */
export function utcSearchBounds(dateFrom: string, dateTo: string): { lower: Date; upper: Date } {
  const lower = new Date(`${dateFrom}T00:00:00.000Z`);
  const upper = new Date(`${dateTo}T00:00:00.000Z`);
  lower.setUTCDate(lower.getUTCDate() - 2);
  upper.setUTCDate(upper.getUTCDate() + 2);
  return { lower, upper };
}

function offsetsForDate(date: string, timezone: string): number[] {
  const key = `${timezone}|${date}`;
  const cached = offsetCache.get(key);
  if (cached) return cached;

  const { year, month, day } = parseDate(date);
  const noonUtc = Date.UTC(year, month - 1, day, 12);
  const offsets = new Set<number>();

  for (let deltaHours = -72; deltaHours <= 72; deltaHours += 6) {
    const probe = noonUtc + deltaHours * 60 * 60 * 1000;
    const parts = localParts(new Date(probe), timezone);
    const renderedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    offsets.add((renderedAsUtc - probe) / 60_000);
  }

  const result = [...offsets];
  offsetCache.set(key, result);
  if (offsetCache.size > 512) offsetCache.delete(offsetCache.keys().next().value as string);
  return result;
}

export function resolveLocalDateTime(date: string, time: string, timezone: string): Date {
  const { year, month, day } = parseDate(date);
  const minuteOfDay = assertValidLocalTime(time);
  const canonicalTimezone = assertValidIanaTimezone(timezone);
  const localAsUtc = Date.UTC(year, month - 1, day, Math.floor(minuteOfDay / 60), minuteOfDay % 60);
  const matches = offsetsForDate(date, canonicalTimezone)
    .map((offsetMinutes) => new Date(localAsUtc - offsetMinutes * 60_000))
    .filter((candidate) => {
      const parts = localParts(candidate, canonicalTimezone);
      return parts.year === year && parts.month === month && parts.day === day && parts.hour === Math.floor(minuteOfDay / 60) && parts.minute === minuteOfDay % 60 && parts.second === 0;
    })
    .sort((left, right) => left.getTime() - right.getTime());

  if (matches.length === 0) throw new ValidationError(`Local time ${date} ${time} does not exist in ${canonicalTimezone}.`);
  if (matches.length > 1) throw new ValidationError(`Local time ${date} ${time} is ambiguous in ${canonicalTimezone}; recurring availability does not specify an occurrence.`);
  return matches[0];
}