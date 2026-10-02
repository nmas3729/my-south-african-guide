import { describe, expect, it } from "vitest";
import { configuredAvailabilityHorizonDays, validateAvailabilityDateRange } from "../../src/server/marketplace/availability/schemas";
import { addCalendarDays, assertValidIanaTimezone, assertValidIsoDate, formatInstantInTimezone, resolveLocalDateTime, weekdayForDate } from "../../src/server/marketplace/availability/time";

describe("availability timezone utilities", () => {
  it("resolves South African local time to its concrete instant", () => {
    expect(resolveLocalDateTime("2026-10-05", "09:30", "Africa/Johannesburg").toISOString()).toBe("2026-10-05T07:30:00.000Z");
    expect(formatInstantInTimezone(new Date("2026-10-05T07:30:00.000Z"), "Africa/Johannesburg")).toEqual({ date: "2026-10-05", time: "09:30" });
  });

  it("accepts IANA zones and rejects arbitrary timezone strings", () => {
    expect(assertValidIanaTimezone("Europe/London")).toBe("Europe/London");
    expect(() => assertValidIanaTimezone("South Africa Standard Time")).toThrow("valid IANA timezone");
  });

  it("rejects nonexistent and ambiguous daylight-saving local times", () => {
    expect(() => resolveLocalDateTime("2026-03-08", "02:30", "America/New_York")).toThrow("does not exist");
    expect(() => resolveLocalDateTime("2026-11-01", "01:30", "America/New_York")).toThrow("is ambiguous");
  });

  it("validates calendar dates and uses Sunday-zero weekday numbering", () => {
    expect(assertValidIsoDate("2026-10-01")).toBe("2026-10-01");
    expect(() => assertValidIsoDate("2026-02-30")).toThrow("calendar date is invalid");
    expect(weekdayForDate("2026-10-05")).toBe(1);
    expect(addCalendarDays("2026-10-01", 90)).toBe("2026-12-30");
  });

  it("enforces an inclusive/exclusive, future-only range within the horizon", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    expect(() => validateAvailabilityDateRange("2026-10-01", "2026-12-30", "Africa/Johannesburg", now, 90)).not.toThrow();
    expect(() => validateAvailabilityDateRange("2026-10-01", "2026-12-31", "Africa/Johannesburg", now, 90)).toThrow("cannot exceed 90 days");
    expect(() => validateAvailabilityDateRange("2026-09-30", "2026-10-02", "Africa/Johannesburg", now, 90)).toThrow("before today");
    expect(() => validateAvailabilityDateRange("2026-10-03", "2026-10-02", "Africa/Johannesburg", now, 90)).toThrow("dateTo must be later");
  });

  // The environment variable is only mutated for the duration of each case and always restored,
  // so no persistent project configuration changes.
  const withHorizon = <T,>(value: string | undefined, run: () => T): T => {
    const original = process.env.AVAILABILITY_GENERATION_HORIZON_DAYS;
    if (value === undefined) delete process.env.AVAILABILITY_GENERATION_HORIZON_DAYS;
    else process.env.AVAILABILITY_GENERATION_HORIZON_DAYS = value;
    try {
      return run();
    } finally {
      if (original === undefined) delete process.env.AVAILABILITY_GENERATION_HORIZON_DAYS;
      else process.env.AVAILABILITY_GENERATION_HORIZON_DAYS = original;
    }
  };

  it("defaults the generation horizon to 90 days and honours a configured value", () => {
    expect(withHorizon(undefined, configuredAvailabilityHorizonDays)).toBe(90);
    expect(withHorizon("45", configuredAvailabilityHorizonDays)).toBe(45);
  });

  it("rejects invalid generation horizon configuration", () => {
    expect(() => withHorizon("ninety", configuredAvailabilityHorizonDays)).toThrow("must be an integer from 1 to 365");
    expect(() => withHorizon("0", configuredAvailabilityHorizonDays)).toThrow("must be an integer from 1 to 365");
    expect(() => withHorizon("366", configuredAvailabilityHorizonDays)).toThrow("must be an integer from 1 to 365");
  });

  it("bounds the date range by the configured horizon rather than a hard-coded 90 days", () => {
    const now = new Date("2026-10-01T12:00:00.000Z");
    const within = () => withHorizon("14", () => validateAvailabilityDateRange("2026-10-01", "2026-10-15", "Africa/Johannesburg", now));
    const tooWide = () => withHorizon("14", () => validateAvailabilityDateRange("2026-10-01", "2026-10-16", "Africa/Johannesburg", now));
    const tooLate = () => withHorizon("14", () => validateAvailabilityDateRange("2026-10-15", "2026-10-17", "Africa/Johannesburg", now));

    expect(within).not.toThrow();
    expect(tooWide).toThrow("cannot exceed 14 days");
    expect(tooLate).toThrow("cannot extend beyond 14 days");
    // The same range that a 14-day horizon rejects is accepted by the default 90-day horizon.
    expect(() => withHorizon(undefined, () => validateAvailabilityDateRange("2026-10-01", "2026-10-16", "Africa/Johannesburg", now))).not.toThrow();
  });
});