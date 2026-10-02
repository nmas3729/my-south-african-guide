import { AvailabilityExceptionType } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { addCalendarDays, formatInstantInTimezone, resolveLocalDateTime, weekdayForDate } from "../../src/server/marketplace/availability/time";

type MockSlot = {
  id: string;
  experienceId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
  guideId?: string;
  timezone?: string;
  capacity?: number;
};

type MockExperience = {
  id: string;
  guideId: string;
  timezone: string;
  duration: number;
  groupLimit: number;
  status: string;
  destination: { status: string };
  guide: { active: boolean; verified: boolean; verificationStatus: string };
  eligibleGuides: Array<{ guideId: string }>;
  availabilityRules: Array<{
    id: string;
    dayOfWeek: number;
    startTimeLocal: string;
    endTimeLocal: string;
    durationMinutes: number;
    capacityOverride: number | null;
    seasonStartDate: Date | null;
    seasonEndDate: Date | null;
    active: boolean;
  }>;
  availabilityExceptions: Array<{
    id: string;
    type: AvailabilityExceptionType;
    date: Date | null;
    startsAt: Date | null;
    endsAt: Date | null;
    capacityOverride: number | null;
  }>;
};

type MockGuide = {
  id: string;
  timezone: string;
  active: boolean;
  verified: boolean;
  verificationStatus: string;
  scheduleRules: Array<{
    dayOfWeek: number;
    startTimeLocal: string;
    endTimeLocal: string;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    active: boolean;
  }>;
  unavailability: Array<{ startsAt: Date; endsAt: Date }>;
};

type MockSqlValues = [string, string, string, Date, Date, string, number, string];

function isMockSqlValues(values: unknown[]): values is MockSqlValues {
  return values.length === 8
    && typeof values[0] === "string"
    && typeof values[1] === "string"
    && typeof values[2] === "string"
    && values[3] instanceof Date
    && values[4] instanceof Date
    && typeof values[5] === "string"
    && typeof values[6] === "number"
    && typeof values[7] === "string";
}

const mocks = vi.hoisted(() => {
  const state: {
    slots: MockSlot[];
    experience: MockExperience;
    guide: MockGuide;
  } = {
    slots: [],
    experience: {
      id: "",
      guideId: "",
      timezone: "",
      duration: 0,
      groupLimit: 0,
      status: "",
      destination: { status: "" },
      guide: { active: false, verified: false, verificationStatus: "" },
      eligibleGuides: [],
      availabilityRules: [],
      availabilityExceptions: [],
    },
    guide: {
      id: "",
      timezone: "",
      active: false,
      verified: false,
      verificationStatus: "",
      scheduleRules: [],
      unavailability: [],
    },
  };
  const tx = {
    experience: { findUnique: vi.fn() },
    guideProfile: { findUnique: vi.fn() },
    tourSlot: { findMany: vi.fn(), updateMany: vi.fn() },
    $executeRaw: vi.fn(),
  };
  return {
    state,
    tx,
    prisma: { $transaction: vi.fn(), experience: { findFirst: vi.fn() }, tourSlot: { findMany: vi.fn() } },
    requireRole: vi.fn(),
  };
});

vi.mock("../../src/server/db/client", () => ({ prisma: mocks.prisma }));
vi.mock("../../src/server/auth/session", () => ({ requireRole: mocks.requireRole }));

import { generateExperienceSlots } from "../../src/server/marketplace/availability/service";
import { listBookableSlots } from "../../src/server/marketplace/availability/slots";

const timezone = "Africa/Johannesburg";
const now = new Date();
const dateFrom = addCalendarDays(formatInstantInTimezone(now, timezone).date, 3);
const dateTo = addCalendarDays(dateFrom, 1);
const weekday = weekdayForDate(dateFrom);

function makeExperience(): MockExperience {
  return {
    id: "experience-1",
    guideId: "guide-1",
    timezone,
    duration: 60,
    groupLimit: 5,
    status: "ACTIVE",
    destination: { status: "PUBLISHED" },
    guide: { active: true, verified: true, verificationStatus: "APPROVED" },
    eligibleGuides: [],
    availabilityRules: [{ id: "rule-1", dayOfWeek: weekday, startTimeLocal: "09:00", endTimeLocal: "11:00", durationMinutes: 15, capacityOverride: null, seasonStartDate: null, seasonEndDate: null, active: true }],
    availabilityExceptions: [],
  };
}

function makeGuide(scheduleStart = "08:00"): MockGuide {
  return {
    id: "guide-1",
    timezone,
    active: true,
    verified: true,
    verificationStatus: "APPROVED",
    scheduleRules: [{ dayOfWeek: weekday, startTimeLocal: scheduleStart, endTimeLocal: "12:00", effectiveFrom: null, effectiveTo: null, active: true }],
    unavailability: [],
  };
}

function request(extra: Record<string, unknown> = {}) {
  return { experienceId: "experience-1", dateFrom, dateTo, ...extra };
}

describe("availability slot generation service", () => {
  beforeEach(() => {
    mocks.state.slots = [];
    mocks.state.experience = makeExperience();
    mocks.state.guide = makeGuide();
    mocks.requireRole.mockReset().mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.tx.experience.findUnique.mockReset().mockImplementation(async () => mocks.state.experience);
    mocks.tx.guideProfile.findUnique.mockReset().mockImplementation(async () => mocks.state.guide);
    mocks.tx.tourSlot.findMany.mockReset().mockImplementation(async () => mocks.state.slots);
    mocks.tx.tourSlot.updateMany.mockReset().mockImplementation(async ({ where, data }: {
      where: { id: { in: string[] }; status: string };
      data: Record<string, unknown>;
    }) => {
      let count = 0;
      for (const slot of mocks.state.slots) {
        if (where.id.in.includes(slot.id) && slot.status === where.status) {
          Object.assign(slot, data);
          count += 1;
        }
      }
      return { count };
    });
    mocks.tx.$executeRaw.mockReset().mockImplementation(async (query: { values: unknown[] }) => {
      const values = query.values;
      let count = 0;
      for (let offset = 0; offset < values.length; offset += 8) {
        const parameters = values.slice(offset, offset + 8);
        if (!isMockSqlValues(parameters)) throw new Error("Unexpected SQL parameters for TourSlot insert.");
        const [id, experienceId, guideId, startsAt, endsAt, slotTimezone, capacity, status] = parameters;
        if (mocks.state.slots.some((slot) => slot.experienceId === experienceId && slot.startsAt.getTime() === startsAt.getTime())) continue;
        mocks.state.slots.push({ id, experienceId, guideId, startsAt, endsAt, timezone: slotTimezone, capacity, status });
        count += 1;
      }
      return count;
    });
    mocks.prisma.$transaction.mockReset().mockImplementation(async (run: (transaction: typeof mocks.tx) => unknown) => run(mocks.tx));
    mocks.prisma.experience.findFirst.mockReset();
    mocks.prisma.tourSlot.findMany.mockReset();
  });

  it("creates expected future slots and is idempotent on retry", async () => {
    const first = await generateExperienceSlots(request());
    const second = await generateExperienceSlots(request());
    expect(first).toMatchObject({ candidateCount: 2, createdCount: 2, existingCount: 0 });
    expect(second).toMatchObject({ candidateCount: 2, createdCount: 0, existingCount: 2 });
    expect(mocks.state.slots).toHaveLength(2);
    expect(mocks.state.slots.map((slot) => slot.capacity)).toEqual([5, 5]);
    expect(mocks.state.slots[0].timezone).toBe(timezone);
  });

  it("uses explicit capacity first and exception capacity before rule and group defaults", async () => {
    await generateExperienceSlots(request({ capacity: 9 }));
    expect(mocks.state.slots.map((slot) => slot.capacity)).toEqual([9, 9]);

    mocks.state.slots = [];
    mocks.state.experience.availabilityRules[0].capacityOverride = 4;
    mocks.state.experience.availabilityExceptions = [{ id: "capacity", type: AvailabilityExceptionType.CAPACITY_OVERRIDE, date: new Date(`${dateFrom}T00:00:00.000Z`), startsAt: null, endsAt: null, capacityOverride: 7 }];
    await generateExperienceSlots(request());
    expect(mocks.state.slots.map((slot) => slot.capacity)).toEqual([7, 7]);
  });

  it("skips candidates outside guide schedule and does not delete blocked existing slots", async () => {
    mocks.state.guide = makeGuide("10:00");
    const limited = await generateExperienceSlots(request());
    expect(limited).toMatchObject({ createdCount: 1, guideScheduleSkippedCount: 1 });

    mocks.state.slots = [];
    mocks.state.experience.availabilityExceptions = [{ id: "block-new", type: AvailabilityExceptionType.BLOCKED, date: new Date(`${dateFrom}T00:00:00.000Z`), startsAt: null, endsAt: null, capacityOverride: null }];
    const blockedNew = await generateExperienceSlots(request());
    expect(blockedNew).toMatchObject({ createdCount: 0, blockedCandidateCount: 2 });

    mocks.state.slots = [{ id: "existing", experienceId: "experience-1", startsAt: resolveLocalDateTime(dateFrom, "09:00", timezone), endsAt: resolveLocalDateTime(dateFrom, "10:00", timezone), status: "OPEN" }];
    const blocked = await generateExperienceSlots(request());
    expect(blocked.closedCount).toBe(1);
    expect(mocks.state.slots.find((slot) => slot.id === "existing")?.status).toBe("CLOSED");
    expect(mocks.state.slots).toHaveLength(1);
  });

  it("materializes an explicit special departure without a recurring rule", async () => {
    const startsAt = resolveLocalDateTime(dateFrom, "13:00", timezone);
    mocks.state.experience.availabilityRules = [];
    mocks.state.guide.scheduleRules[0].endTimeLocal = "15:00";
    mocks.state.experience.availabilityExceptions = [{ id: "special", type: AvailabilityExceptionType.SPECIAL_DEPARTURE, date: null, startsAt, endsAt: new Date(startsAt.getTime() + 90 * 60_000), capacityOverride: 8 }];
    const result = await generateExperienceSlots(request());
    expect(result.createdCount).toBe(1);
    expect(mocks.state.slots[0]).toMatchObject({ capacity: 8, status: "OPEN", timezone });
  });

  it("does not permit requests beyond the configured default horizon", async () => {
    await expect(generateExperienceSlots(request({ dateFrom: addCalendarDays(dateFrom, 90), dateTo: addCalendarDays(dateFrom, 91) }))).rejects.toThrow("cannot extend beyond 90 days");
    expect(mocks.state.slots).toHaveLength(0);
  });

  it("returns persisted future open slots and filters those blocked by new exceptions", async () => {
    const startsAt = resolveLocalDateTime(dateFrom, "09:00", timezone);
    mocks.prisma.experience.findFirst.mockResolvedValue({ id: "experience-1", timezone, availabilityExceptions: [{ id: "block", type: AvailabilityExceptionType.BLOCKED, date: new Date(`${dateFrom}T00:00:00.000Z`), startsAt: null, endsAt: null, capacityOverride: null }] });
    mocks.prisma.tourSlot.findMany.mockResolvedValue([
      { id: "blocked", startsAt, endsAt: new Date(startsAt.getTime() + 60 * 60_000), timezone, capacity: 5, guideId: "guide-1" },
      { id: "other-day", startsAt: resolveLocalDateTime(dateTo, "09:00", timezone), endsAt: resolveLocalDateTime(dateTo, "10:00", timezone), timezone, capacity: 5, guideId: "guide-1" },
    ]);
    await expect(listBookableSlots("experience", { dateFrom, dateTo })).resolves.toEqual([]);
  });
});