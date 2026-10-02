import { AvailabilityExceptionType } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { guideScheduleAllowsSlot } from "../../src/server/marketplace/availability/guide-schedule";
import { evaluateExceptionForDeparture, specialDepartureCandidates } from "../../src/server/marketplace/availability/exceptions";
import { evaluateRecurringAvailability } from "../../src/server/marketplace/availability/rules";
import type { AvailabilityException, RecurringAvailabilityRule } from "../../src/server/marketplace/availability/types";

const mondayRule: RecurringAvailabilityRule = {
  id: "monday",
  dayOfWeek: 1,
  startTimeLocal: "09:00",
  endTimeLocal: "12:00",
  durationMinutes: 5,
  capacityOverride: null,
  seasonStartDate: null,
  seasonEndDate: null,
  active: true,
};

const baseCandidate = evaluateRecurringAvailability({ date: "2026-10-05", timezone: "Africa/Johannesburg", durationMinutes: 60, rules: [mondayRule], now: new Date("2026-10-01T00:00:00Z") })[0];

describe("availability rule evaluation", () => {
  it("generates a matching weekday and no departure on another weekday", () => {
    const monday = evaluateRecurringAvailability({ date: "2026-10-05", timezone: "Africa/Johannesburg", durationMinutes: 60, rules: [mondayRule], now: new Date("2026-10-01T00:00:00Z") });
    const tuesday = evaluateRecurringAvailability({ date: "2026-10-06", timezone: "Africa/Johannesburg", durationMinutes: 60, rules: [mondayRule], now: new Date("2026-10-01T00:00:00Z") });
    expect(monday.map((slot) => slot.startsAt.toISOString())).toEqual(["2026-10-05T07:00:00.000Z", "2026-10-05T08:00:00.000Z", "2026-10-05T09:00:00.000Z"]);
    expect(tuesday).toEqual([]);
  });

  it("ignores inactive rules and rejects invalid local ranges", () => {
    expect(evaluateRecurringAvailability({ date: "2026-10-05", timezone: "Africa/Johannesburg", durationMinutes: 60, rules: [{ ...mondayRule, active: false }], now: new Date("2026-10-01T00:00:00Z") })).toEqual([]);
    expect(() => evaluateRecurringAvailability({ date: "2026-10-05", timezone: "Africa/Johannesburg", durationMinutes: 60, rules: [{ ...mondayRule, endTimeLocal: "09:00" }], now: new Date("2026-10-01T00:00:00Z") })).toThrow("must end after it starts");
  });

  it("gives blocking exceptions precedence over capacity overrides", () => {
    const exceptions: AvailabilityException[] = [
      { id: "capacity", type: AvailabilityExceptionType.CAPACITY_OVERRIDE, date: new Date("2026-10-05T00:00:00Z"), startsAt: null, endsAt: null, capacityOverride: 4 },
      { id: "blocked", type: AvailabilityExceptionType.BLOCKED, date: new Date("2026-10-05T00:00:00Z"), startsAt: null, endsAt: null, capacityOverride: null },
    ];
    expect(evaluateExceptionForDeparture({ candidate: baseCandidate, timezone: "Africa/Johannesburg", exceptions })).toEqual({ blocked: true, capacityOverride: null });
  });

  it("applies one capacity override and rejects conflicting overrides", () => {
    const exception = (id: string, capacityOverride: number): AvailabilityException => ({ id, type: AvailabilityExceptionType.CAPACITY_OVERRIDE, date: new Date("2026-10-05T00:00:00Z"), startsAt: null, endsAt: null, capacityOverride });
    expect(evaluateExceptionForDeparture({ candidate: baseCandidate, timezone: "Africa/Johannesburg", exceptions: [exception("one", 4)] }).capacityOverride).toBe(4);
    expect(() => evaluateExceptionForDeparture({ candidate: baseCandidate, timezone: "Africa/Johannesburg", exceptions: [exception("one", 4), exception("two", 5)] })).toThrow("conflicting capacities");
  });

  it("creates special departures outside recurring rules", () => {
    const special: AvailabilityException = {
      id: "special",
      type: AvailabilityExceptionType.SPECIAL_DEPARTURE,
      date: null,
      startsAt: new Date("2026-10-07T07:00:00Z"),
      endsAt: new Date("2026-10-07T08:30:00Z"),
      capacityOverride: 8,
    };
    expect(specialDepartureCandidates({ dateFrom: "2026-10-05", dateTo: "2026-10-10", timezone: "Africa/Johannesburg", exceptions: [special], now: new Date("2026-10-01T00:00:00Z") })).toHaveLength(1);
    expect(() => specialDepartureCandidates({ dateFrom: "2026-10-05", dateTo: "2026-10-10", timezone: "Africa/Johannesburg", exceptions: [{ ...special, date: new Date("2026-10-08T00:00:00Z") }], now: new Date("2026-10-01T00:00:00Z") })).toThrow("does not match its start instant");
  });
});

describe("guide schedule evaluation", () => {
  const window = { startsAt: new Date("2026-10-05T07:00:00Z"), endsAt: new Date("2026-10-05T08:00:00Z") };
  const schedule = { dayOfWeek: 1, startTimeLocal: "08:00", endTimeLocal: "12:00", effectiveFrom: null, effectiveTo: null, active: true };

  it("allows a slot inside the guide's local schedule", () => {
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [schedule], unavailability: [] })).toBe(true);
  });

  it("rejects slots outside the guide schedule or overlapping unavailability", () => {
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, startTimeLocal: "10:00" }], unavailability: [] })).toBe(false);
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [schedule], unavailability: [{ startsAt: new Date("2026-10-05T07:30:00Z"), endsAt: new Date("2026-10-05T07:45:00Z") }] })).toBe(false);
  });

  it("rejects nonexistent and ambiguous guide schedule wall times", () => {
    expect(() => guideScheduleAllowsSlot({ startsAt: new Date("2026-03-08T07:30:00Z"), endsAt: new Date("2026-03-08T08:00:00Z"), timezone: "America/New_York", schedules: [{ ...schedule, dayOfWeek: 0, startTimeLocal: "02:30", endTimeLocal: "04:00" }], unavailability: [] })).toThrow("does not exist");
    expect(() => guideScheduleAllowsSlot({ startsAt: new Date("2026-11-01T07:30:00Z"), endsAt: new Date("2026-11-01T08:00:00Z"), timezone: "America/New_York", schedules: [{ ...schedule, dayOfWeek: 0, startTimeLocal: "01:30", endTimeLocal: "03:00" }], unavailability: [] })).toThrow("is ambiguous");
  });

  it("honours guide schedule effectiveFrom and effectiveTo bounds", () => {
    // The slot runs on the local date 2026-10-05.
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, effectiveFrom: new Date("2026-10-05T00:00:00Z") }], unavailability: [] })).toBe(true);
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, effectiveTo: new Date("2026-10-05T00:00:00Z") }], unavailability: [] })).toBe(true);

    // A window that only starts after the departure date excludes it.
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, effectiveFrom: new Date("2026-10-06T00:00:00Z") }], unavailability: [] })).toBe(false);
    // A window that already ended before the departure date excludes it.
    expect(guideScheduleAllowsSlot({ ...window, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, effectiveTo: new Date("2026-10-04T00:00:00Z") }], unavailability: [] })).toBe(false);
  });

  it("rejects a departure whose interval crosses local midnight", () => {
    // 2026-10-05T21:00Z-23:00Z is 23:00 local on Monday 2026-10-05 through 01:00 on Tuesday
    // 2026-10-06 in Johannesburg, so the interval spans two local days.
    const crossing = { startsAt: new Date("2026-10-05T21:00:00Z"), endsAt: new Date("2026-10-05T23:00:00Z") };
    expect(guideScheduleAllowsSlot({ ...crossing, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, dayOfWeek: 1, startTimeLocal: "23:00", endTimeLocal: "23:59" }], unavailability: [] })).toBe(false);

    // Identical schedule and identical start instant, but the departure ends within the same local
    // day, which isolates crossing local midnight as the only cause of the rejection above.
    const sameDay = { startsAt: new Date("2026-10-05T21:00:00Z"), endsAt: new Date("2026-10-05T21:59:00Z") };
    expect(guideScheduleAllowsSlot({ ...sameDay, timezone: "Africa/Johannesburg", schedules: [{ ...schedule, dayOfWeek: 1, startTimeLocal: "23:00", endTimeLocal: "23:59" }], unavailability: [] })).toBe(true);
  });
});