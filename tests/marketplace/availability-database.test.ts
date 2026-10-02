import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { describe, expect, it, vi } from "vitest";
import { throwMappedSlotGenerationError } from "../../src/server/marketplace/availability/conflicts";

// The real client is created inside `vi.hoisted` so it is available to the module mock below.
// Only a local PostgreSQL instance is ever contacted; any other host disables these suites.
const harness = await vi.hoisted(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const url = process.env.DATABASE_URL;
  const localDatabase = Boolean(url) && ["localhost", "127.0.0.1", "::1"].includes(new URL(url as string).hostname);
  if (!localDatabase) return { prisma: null, databaseUrl: null, localDatabase: false };

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
  await prisma.$queryRawUnsafe("SELECT 1");
  return { prisma, databaseUrl: url, localDatabase: true };
});

vi.mock("../../src/server/db/client", () => ({ prisma: harness.prisma }));
vi.mock("../../src/server/auth/session", () => ({
  requireRole: vi.fn(async () => ({ id: "availability-test-admin", email: "admin@test.invalid", role: "ADMIN" })),
}));

// Non-null here: every suite that reaches this helper is gated behind `harness.localDatabase`,
// and the suite bodies would not execute at all when the client is null.
const prisma = harness.prisma!;

type Fixture = {
  userId: string;
  guideId: string;
  destinationId: string;
  experienceId: string;
  email: string;
  slug: string;
};

type FixtureOptions = {
  experienceTimezone?: string;
  guideTimezone?: string;
  durationMinutes?: number;
  groupLimit?: number | null;
  dayOfWeek: number;
  ruleStart?: string;
  ruleEnd?: string;
  ruleCapacityOverride?: number | null;
  guideSchedule?: { startTimeLocal: string; endTimeLocal: string } | null;
};

/**
 * Creates a fully valid, isolated availability fixture. Every identifier is a fresh UUID, so a test
 * can never collide with the three pre-existing bookings or with any other fixture.
 */
async function createFixture(options: FixtureOptions): Promise<Fixture> {
  const experienceTimezone = options.experienceTimezone ?? "Africa/Johannesburg";
  const guideTimezone = options.guideTimezone ?? experienceTimezone;
  const suffix = randomUUID();
  const userId = randomUUID();
  const guideId = randomUUID();
  const destinationId = randomUUID();
  const experienceId = randomUUID();
  const email = `availability-${suffix}@test.invalid`;
  const slug = `availability-${suffix}`;

  await prisma.user.create({ data: { id: userId, email, role: "GUIDE" } });
  await prisma.guideProfile.create({ data: { id: guideId, userId, languages: [], provinces: [], qualifications: [], timezone: guideTimezone, active: true, verified: true, verificationStatus: "APPROVED" } });
  await prisma.destination.create({ data: { id: destinationId, name: "Availability Test", province: "Western Cape", slug: `destination-${suffix}`, status: "PUBLISHED" } });
  await prisma.experience.create({
    data: {
      id: experienceId,
      guideId,
      destinationId,
      title: "Availability Test Experience",
      slug,
      description: "Isolated fixture used by the availability database tests.",
      duration: options.durationMinutes ?? 60,
      price: 0,
      groupLimit: options.groupLimit ?? 5,
      timezone: experienceTimezone,
      languages: [],
      status: "ACTIVE",
    },
  });
  await prisma.availabilityRule.create({
    data: { experienceId, dayOfWeek: options.dayOfWeek, startTimeLocal: options.ruleStart ?? "09:00", endTimeLocal: options.ruleEnd ?? "11:00", capacityOverride: options.ruleCapacityOverride ?? null, active: true },
  });

  const schedule = options.guideSchedule === undefined ? { startTimeLocal: "00:00", endTimeLocal: "23:59" } : options.guideSchedule;
  if (schedule) {
    await prisma.guideScheduleRule.create({ data: { guideId, dayOfWeek: options.dayOfWeek, startTimeLocal: schedule.startTimeLocal, endTimeLocal: schedule.endTimeLocal, active: true } });
  }
  return { userId, guideId, destinationId, experienceId, email, slug };
}

/**
 * Deletes only the fixture created by `createFixture`. Ordering respects the Restrict foreign keys;
 * children cascade. Failures are surfaced rather than swallowed so a leaking fixture is visible.
 */
async function destroyFixture(fixture: Fixture): Promise<void> {
  await prisma.experience.deleteMany({ where: { id: fixture.experienceId } });
  await prisma.guideProfile.deleteMany({ where: { id: fixture.guideId } });
  await prisma.destination.deleteMany({ where: { id: fixture.destinationId } });
  await prisma.user.deleteMany({ where: { id: fixture.userId } });
}

async function readSlots(experienceId: string) {
  return prisma.tourSlot.findMany({ where: { experienceId }, orderBy: { startsAt: "asc" } });
}

const BOOKING_COLUMNS = { id: true, status: true, slotId: true, startsAt: true, endsAt: true, timezone: true } as const;

describe("local PostgreSQL availability constraints", () => {
  it("ignores only duplicate experience starts and rejects guide overlaps", async () => {
    const client = new Client({ connectionString: harness.databaseUrl! });
    await client.connect();
    await client.query("BEGIN");

    const userId = randomUUID();
    const guideId = randomUUID();
    const destinationId = randomUUID();
    const experienceId = randomUUID();
    const firstSlotId = randomUUID();
    const duplicateSlotId = randomUUID();
    const conflictingSlotId = randomUUID();
    const now = Date.now();
    const startsAt = new Date(now + 6 * 60 * 60 * 1000);
    const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000);
    const conflictingStart = new Date(startsAt.getTime() + 30 * 60 * 1000);
    const conflictingEnd = new Date(conflictingStart.getTime() + 60 * 60 * 1000);

    try {
      await client.query(`INSERT INTO "User" ("id","email","role","updatedAt") VALUES ($1,$2,'GUIDE',CURRENT_TIMESTAMP)`, [userId, `${userId}@availability-test.invalid`]);
      await client.query(`INSERT INTO "GuideProfile" ("id","userId","languages","provinces","qualifications","timezone","active","verified","verificationStatus","updatedAt") VALUES ($1,$2,ARRAY['en'],ARRAY['ZA'],ARRAY['test'],'Africa/Johannesburg',true,true,'APPROVED',CURRENT_TIMESTAMP)`, [guideId, userId]);
      await client.query(`INSERT INTO "Destination" ("id","name","province","slug","status","updatedAt") VALUES ($1,'Availability Test','Test','availability-test-' || $1,'PUBLISHED',CURRENT_TIMESTAMP)`, [destinationId]);
      await client.query(`INSERT INTO "Experience" ("id","guideId","destinationId","title","slug","description","duration","price","timezone","status","updatedAt") VALUES ($1,$2,$3,'Availability Test','availability-test-' || $1,'Temporary rolled-back test fixture',60,0,'Africa/Johannesburg','ACTIVE',CURRENT_TIMESTAMP)`, [experienceId, guideId, destinationId]);

      const slotValues = [experienceId, guideId, startsAt, endsAt, "Africa/Johannesburg", 4];
      await client.query(`INSERT INTO "TourSlot" ("id","experienceId","guideId","startsAt","endsAt","timezone","capacity","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [firstSlotId, ...slotValues]);
      const duplicate = await client.query(`INSERT INTO "TourSlot" ("id","experienceId","guideId","startsAt","endsAt","timezone","capacity","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP) ON CONFLICT ("experienceId","startsAt") DO NOTHING RETURNING "id"`, [duplicateSlotId, ...slotValues]);
      expect(duplicate.rows).toHaveLength(0);

      await client.query("SAVEPOINT guide_overlap");
      let overlapError: unknown;
      try {
        await client.query(`INSERT INTO "TourSlot" ("id","experienceId","guideId","startsAt","endsAt","timezone","capacity","status","createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,$7,'OPEN',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)`, [conflictingSlotId, experienceId, guideId, conflictingStart, conflictingEnd, "Africa/Johannesburg", 4]);
      } catch (error) {
        overlapError = error;
      }
      await client.query("ROLLBACK TO SAVEPOINT guide_overlap");
      expect(overlapError).toMatchObject({ code: "23P01", constraint: "TourSlot_guide_no_overlap" });
      expect(() => throwMappedSlotGenerationError(overlapError)).toThrow("The assigned guide already has an overlapping departure.");
    } finally {
      await client.query("ROLLBACK");
      await client.end();
    }
});

const suite = harness.localDatabase ? describe : describe.skip;

// Generation stays well inside the 90-day horizon measured from the 2026-10-01 reference date.
const TZ = "Africa/Johannesburg";
const DAY = "2026-11-02"; // A Monday.
const DAY_TO = "2026-11-03";

function generateInput(experienceId: string, extra: Record<string, unknown> = {}) {
  return { experienceId, dateFrom: DAY, dateTo: DAY_TO, ...extra };
}

suite("production slot generation against local PostgreSQL", () => {
  it("materializes recurring availability as concrete TourSlot rows with correct instants, timezone and capacity", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "11:00", groupLimit: 7 });
    try {
      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 2, blockedCandidateCount: 0, closedCount: 0 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(2);
      // 09:00 and 10:00 Africa/Johannesburg (UTC+2) are 07:00Z and 08:00Z.
      expect(slots.map((slot) => slot.startsAt.toISOString())).toEqual(["2026-11-02T07:00:00.000Z", "2026-11-02T08:00:00.000Z"]);
      expect(slots.map((slot) => slot.endsAt.toISOString())).toEqual(["2026-11-02T08:00:00.000Z", "2026-11-02T09:00:00.000Z"]);
      expect(slots.every((slot) => slot.timezone === TZ)).toBe(true);
      expect(slots.every((slot) => slot.capacity === 7)).toBe(true);
      expect(slots.every((slot) => slot.status === "OPEN")).toBe(true);
      expect(slots.every((slot) => slot.guideId === fixture.guideId)).toBe(true);
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("does not create duplicates when the real generator is executed twice", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "11:00" });
    try {
      const first = await generateExperienceSlots(generateInput(fixture.experienceId));
      const afterFirst = await readSlots(fixture.experienceId);
      const second = await generateExperienceSlots(generateInput(fixture.experienceId));
      const afterSecond = await readSlots(fixture.experienceId);

      expect(first).toMatchObject({ createdCount: 2 });
      expect(second).toMatchObject({ createdCount: 0 });
      expect(afterFirst).toHaveLength(2);
      expect(afterSecond).toHaveLength(2);
      expect(afterSecond.map((slot) => slot.id).sort()).toEqual(afterFirst.map((slot) => slot.id).sort());
      expect(new Set(afterSecond.map((slot) => slot.startsAt.getTime())).size).toBe(2);
    } finally {
      await destroyFixture(fixture);
    }
  });
});

suite("production exception behavior against local PostgreSQL", () => {
  it("prevents the blocked recurring departure from being generated while keeping unaffected departures", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "11:00" });
    try {
      await prisma.availabilityException.create({
        data: {
          experienceId: fixture.experienceId,
          type: "BLOCKED",
          startsAt: new Date("2026-11-02T07:00:00.000Z"),
          endsAt: new Date("2026-11-02T08:00:00.000Z"),
          reason: "Road closure",
        },
      });

      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 1, blockedCandidateCount: 1 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      expect(slots[0].startsAt.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("closes an existing future open slot that a later blocking exception affects without deleting it", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00" });
    try {
      await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(await readSlots(fixture.experienceId)).toHaveLength(1);

      await prisma.availabilityException.create({
        data: { experienceId: fixture.experienceId, type: "BLOCKED", date: new Date("2026-11-02T00:00:00.000Z"), reason: "Weather" },
      });
      const result = await generateExperienceSlots(generateInput(fixture.experienceId));

      expect(result).toMatchObject({ closedCount: 1, createdCount: 0 });
      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      expect(slots[0].status).toBe("CLOSED");
    } finally {
      await destroyFixture(fixture);
    }
  });
});

suite("production guide scheduling against local PostgreSQL", () => {
  it("suppresses candidates outside the guide schedule and keeps candidates inside it", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    // Rule allows 09:00-12:00; the guide only works 10:00-11:00, so only the 10:00 departure survives.
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "12:00", guideSchedule: { startTimeLocal: "10:00", endTimeLocal: "11:00" } });
    try {
      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 1, guideScheduleSkippedCount: 2 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      expect(slots[0].startsAt.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("suppresses an otherwise valid departure that overlaps a guide unavailability window", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "11:00" });
    try {
      await prisma.guideUnavailability.create({
        data: { guideId: fixture.guideId, startsAt: new Date("2026-11-02T07:00:00.000Z"), endsAt: new Date("2026-11-02T08:00:00.000Z"), reason: "Leave" },
      });

      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 1, guideScheduleSkippedCount: 1 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      expect(slots[0].startsAt.toISOString()).toBe("2026-11-02T08:00:00.000Z");
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("uses the guide timezone rather than the experience timezone for guide schedules", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    // Experience is Africa/Johannesburg (UTC+2); the guide works in Europe/London, which is UTC+0 on
    // this date. The rule produces 09:00/10:00 SAST = 07:00Z and 08:00Z.
    // Read in the GUIDE timezone those are 07:00-08:00 and 08:00-09:00 London, so a London-local
    // 08:00-09:00 schedule admits exactly the 08:00Z departure.
    // Read in the EXPERIENCE timezone they would instead be 09:00-10:00 and 10:00-11:00 SAST, and a
    // 08:00-09:00 window would admit neither. The two interpretations therefore disagree.
    const fixture = await createFixture({
      dayOfWeek: 1,
      ruleStart: "09:00",
      ruleEnd: "11:00",
      experienceTimezone: "Africa/Johannesburg",
      guideTimezone: "Europe/London",
      guideSchedule: { startTimeLocal: "08:00", endTimeLocal: "09:00" },
    });
    try {
      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 1, guideScheduleSkippedCount: 1 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      // 08:00Z is 08:00 in London, filling the guide's 08:00-09:00 local window exactly.
      expect(slots[0].startsAt.toISOString()).toBe("2026-11-02T08:00:00.000Z");
      expect(slots[0].endsAt.toISOString()).toBe("2026-11-02T09:00:00.000Z");
    } finally {
      await destroyFixture(fixture);
    }
  });
});

suite("production capacity precedence against local PostgreSQL", () => {
  it("applies capacity precedence: explicit request, then exception override, then rule override, then groupLimit", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");

    const groupLimitFixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00", groupLimit: 6 });
    try {
      await generateExperienceSlots(generateInput(groupLimitFixture.experienceId));
      expect((await readSlots(groupLimitFixture.experienceId))[0].capacity).toBe(6);
    } finally {
      await destroyFixture(groupLimitFixture);
    }

    const ruleOverrideFixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00", groupLimit: 6, ruleCapacityOverride: 4 });
    try {
      await generateExperienceSlots(generateInput(ruleOverrideFixture.experienceId));
      expect((await readSlots(ruleOverrideFixture.experienceId))[0].capacity).toBe(4);
    } finally {
      await destroyFixture(ruleOverrideFixture);
    }

    const exceptionFixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00", groupLimit: 6, ruleCapacityOverride: 4 });
    try {
      await prisma.availabilityException.create({
        data: { experienceId: exceptionFixture.experienceId, type: "CAPACITY_OVERRIDE", date: new Date("2026-11-02T00:00:00.000Z"), capacityOverride: 3 },
      });
      await generateExperienceSlots(generateInput(exceptionFixture.experienceId));
      expect((await readSlots(exceptionFixture.experienceId))[0].capacity).toBe(3);
    } finally {
      await destroyFixture(exceptionFixture);
    }

    const explicitFixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00", groupLimit: 6, ruleCapacityOverride: 4 });
    try {
      await prisma.availabilityException.create({
        data: { experienceId: explicitFixture.experienceId, type: "CAPACITY_OVERRIDE", date: new Date("2026-11-02T00:00:00.000Z"), capacityOverride: 3 },
      });
      await generateExperienceSlots(generateInput(explicitFixture.experienceId, { capacity: 9 }));
      expect((await readSlots(explicitFixture.experienceId))[0].capacity).toBe(9);
    } finally {
      await destroyFixture(explicitFixture);
    }
  });
});

suite("production special departures, conflicts, horizon and booking integrity", () => {
  it("generates a special departure outside any recurring rule", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00" });
    try {
      await prisma.availabilityRule.deleteMany({ where: { experienceId: fixture.experienceId } });
      await prisma.availabilityException.create({
        data: {
          experienceId: fixture.experienceId,
          type: "SPECIAL_DEPARTURE",
          startsAt: new Date("2026-11-02T13:00:00.000Z"),
          endsAt: new Date("2026-11-02T14:30:00.000Z"),
          capacityOverride: 8,
        },
      });

      const result = await generateExperienceSlots(generateInput(fixture.experienceId));
      expect(result).toMatchObject({ createdCount: 1 });

      const slots = await readSlots(fixture.experienceId);
      expect(slots).toHaveLength(1);
      expect(slots[0].startsAt.toISOString()).toBe("2026-11-02T13:00:00.000Z");
      expect(slots[0].endsAt.toISOString()).toBe("2026-11-02T14:30:00.000Z");
      expect(slots[0].capacity).toBe(8);
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("maps a guide overlap raised by PostgreSQL to a domain conflict error", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00" });
    try {
      // A pre-existing slot at 07:00Z-08:00Z for the same guide occupies the first half hour.
      await prisma.tourSlot.create({
        data: {
          experienceId: fixture.experienceId,
          guideId: fixture.guideId,
          startsAt: new Date("2026-11-02T07:00:00.000Z"),
          endsAt: new Date("2026-11-02T08:00:00.000Z"),
          timezone: TZ,
          capacity: 5,
        },
      });
      // A 09:30 SAST rule produces a 07:30Z departure that genuinely overlaps the existing slot.
      await prisma.availabilityRule.deleteMany({ where: { experienceId: fixture.experienceId } });
      await prisma.availabilityRule.create({
        data: { experienceId: fixture.experienceId, dayOfWeek: 1, startTimeLocal: "09:30", endTimeLocal: "10:30", active: true },
      });

      await expect(generateExperienceSlots(generateInput(fixture.experienceId))).rejects.toMatchObject({
        code: "CONFLICT",
        message: "The assigned guide already has an overlapping departure.",
      });
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("never exceeds the configured generation horizon", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "10:00" });
    try {
      await expect(generateExperienceSlots(generateInput(fixture.experienceId, { dateTo: "2027-03-01" }))).rejects.toThrow(/cannot exceed|cannot extend beyond/);
      expect(await readSlots(fixture.experienceId)).toHaveLength(0);
    } finally {
      await destroyFixture(fixture);
    }
  });

  it("leaves the three pre-existing bookings completely unchanged", async () => {
    const { generateExperienceSlots } = await import("../../src/server/marketplace/availability/service");
    const legacyOnly = { slotId: null, reservationIdempotencyKey: null };
    const before = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(before).toHaveLength(3);
    expect(before.every((booking) => booking.slotId === null && booking.startsAt === null && booking.endsAt === null && booking.timezone === null)).toBe(true);

    const fixture = await createFixture({ dayOfWeek: 1, ruleStart: "09:00", ruleEnd: "11:00" });
    try {
      await generateExperienceSlots(generateInput(fixture.experienceId));
      await generateExperienceSlots(generateInput(fixture.experienceId));
    } finally {
      await destroyFixture(fixture);
    }

    const after = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(after).toHaveLength(3);
    expect(after.map((booking) => booking.id)).toEqual(before.map((booking) => booking.id));
    expect(after.map((booking) => booking.status)).toEqual(before.map((booking) => booking.status));
    expect(after).toEqual(before);
    // Scoped to this file's fixtures: parallel test files share one database, so global counts of
    // slot-linked rows would race with fixtures a concurrently running file is still using.
    expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(0);
    expect(await prisma.slotReservation.count({ where: { slot: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.bookingEvent.count({ where: { booking: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });
});
  });
