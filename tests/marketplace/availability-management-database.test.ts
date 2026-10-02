import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// A real client over local PostgreSQL, injected into the module the services import so the
// production services run unmodified. Only the session layer is controllable per test.
const harness = await vi.hoisted(async () => {
  const { config } = await import("dotenv");
  config({ path: ".env.local", quiet: true });
  config({ quiet: true });

  const url = process.env.DATABASE_URL;
  const localDatabase = Boolean(url) && ["localhost", "127.0.0.1", "::1"].includes(new URL(url as string).hostname);
  const session = { current: null as null | { id: string; role: "ADMIN" | "GUIDE" | "TRAVELLER" } };
  if (!localDatabase) return { prisma: null, localDatabase: false, session };

  const { PrismaPg } = await import("@prisma/adapter-pg");
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url as string }) });
  await prisma.$queryRawUnsafe("SELECT 1");
  return { prisma, localDatabase: true, session };
});

vi.mock("../../src/server/db/client", () => ({ prisma: harness.prisma }));

// Mirrors the real session contract: role is enforced, identity always comes from here, and the
// thrown shapes satisfy `isAuthenticationError` in the shared error mapper.
vi.mock("../../src/server/auth/session", () => ({
  requireUser: async () => {
    if (!harness.session.current) throw Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" });
    return harness.session.current;
  },
  requireRole: async (...roles: string[]) => {
    if (!harness.session.current) throw Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" });
    if (!roles.includes(harness.session.current.role)) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
    return harness.session.current;
  },
}));

const prisma = harness.prisma!;
const suite = harness.localDatabase ? describe : describe.skip;

type Actor = { userId: string; guideId: string };
type Fixture = Actor & { adminUserId: string; other: Actor; destinationId: string; experienceId: string; travellerIds: string[] };

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);

const BOOKING_COLUMNS = { id: true, status: true, slotId: true, startsAt: true, endsAt: true, timezone: true } as const;

async function createGuide(role: "GUIDE" | "ADMIN" = "GUIDE"): Promise<Actor> {
  const userId = randomUUID();
  const guideId = randomUUID();
  await prisma.user.create({ data: { id: userId, email: `mgmt-${randomUUID()}@test.invalid`, role } });
  if (role === "GUIDE") {
    await prisma.guideProfile.create({ data: { id: guideId, userId, languages: [], provinces: [], qualifications: [], timezone: "Africa/Johannesburg", active: true, verified: true, verificationStatus: "APPROVED" } });
  }
  return { userId, guideId };
}

async function createFixture(): Promise<Fixture> {
  const guide = await createGuide();
  const other = await createGuide();
  const admin = await createGuide("ADMIN");
  const destinationId = randomUUID();
  const experienceId = randomUUID();
  const suffix = randomUUID();
  await prisma.destination.create({ data: { id: destinationId, name: "Mgmt Test", province: "Western Cape", slug: `mgmt-d-${suffix}`, status: "PUBLISHED" } });
  await prisma.experience.create({ data: { id: experienceId, guideId: guide.guideId, destinationId, title: "Mgmt Test", slug: `mgmt-e-${suffix}`, description: "fixture", duration: 60, price: 0, timezone: "Africa/Johannesburg", languages: [], status: "ACTIVE" } });
  return { userId: guide.userId, guideId: guide.guideId, adminUserId: admin.userId, other, destinationId, experienceId, travellerIds: [] };
}

/** Registers a traveller with the fixture so teardown always removes it, even on failure. */
async function createTraveller(fixture: Fixture): Promise<string> {
  const travellerId = randomUUID();
  await prisma.user.create({ data: { id: travellerId, email: `trav-${randomUUID()}@test.invalid`, role: "TRAVELLER" } });
  fixture.travellerIds.push(travellerId);
  return travellerId;
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  // Bookings reference both the experience and the traveller, so they go first.
  await prisma.booking.deleteMany({ where: { OR: [{ experienceId: fixture.experienceId }, { travellerId: { in: fixture.travellerIds } }] } });
  await prisma.experience.deleteMany({ where: { id: fixture.experienceId } });
  await prisma.guideScheduleRule.deleteMany({ where: { guideId: { in: [fixture.guideId, fixture.other.guideId] } } });
  await prisma.guideUnavailability.deleteMany({ where: { guideId: { in: [fixture.guideId, fixture.other.guideId] } } });
  await prisma.guideProfile.deleteMany({ where: { id: { in: [fixture.guideId, fixture.other.guideId] } } });
  await prisma.destination.deleteMany({ where: { id: fixture.destinationId } });
  await prisma.user.deleteMany({ where: { id: { in: [fixture.userId, fixture.other.userId, fixture.adminUserId, ...fixture.travellerIds] } } });
}

async function createSlot(experienceId: string, guideId: string, startsAt: Date, endsAt: Date) {
  return prisma.tourSlot.create({ data: { experienceId, guideId, startsAt, endsAt, timezone: "Africa/Johannesburg", capacity: 5, status: "OPEN" } });
}

suite("admin TourSlot close against local PostgreSQL", () => {
  it("closes a future open slot and leaves generator-owned fields untouched", async () => {
    const { closeTourSlot } = await import("../../src/server/marketplace/availability/slot-lifecycle");
    const fixture = await createFixture();
    try {
      const slot = await createSlot(fixture.experienceId, fixture.guideId, inHours(48), inHours(49));
      const before = { startsAt: slot.startsAt, endsAt: slot.endsAt, guideId: slot.guideId, timezone: slot.timezone, capacity: slot.capacity };

      harness.session.current = { id: fixture.adminUserId, role: "ADMIN" };
      const closed = await closeTourSlot(slot.id);

      expect(closed.status).toBe("CLOSED");
      const after = await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id } });
      expect(after.status).toBe("CLOSED");
      expect({ startsAt: after.startsAt, endsAt: after.endsAt, guideId: after.guideId, timezone: after.timezone, capacity: after.capacity }).toEqual(before);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("refuses closure for a non-ADMIN role", async () => {
    const { closeTourSlot } = await import("../../src/server/marketplace/availability/slot-lifecycle");
    const fixture = await createFixture();
    try {
      const slot = await createSlot(fixture.experienceId, fixture.guideId, inHours(48), inHours(49));
      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      await expect(closeTourSlot(slot.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe("OPEN");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("refuses to close a past slot or an already closed slot", async () => {
    const { closeTourSlot } = await import("../../src/server/marketplace/availability/slot-lifecycle");
    const fixture = await createFixture();
    try {
      const past = await createSlot(fixture.experienceId, fixture.guideId, inHours(-3), inHours(-2));
      harness.session.current = { id: fixture.adminUserId, role: "ADMIN" };
      await expect(closeTourSlot(past.id)).rejects.toMatchObject({ code: "CONFLICT" });
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: past.id } })).status).toBe("OPEN");

      const closedSlot = await prisma.tourSlot.create({ data: { experienceId: fixture.experienceId, guideId: fixture.guideId, startsAt: inHours(72), endsAt: inHours(73), timezone: "Africa/Johannesburg", capacity: 5, status: "CLOSED" } });
      await expect(closeTourSlot(closedSlot.id)).rejects.toThrow("Only an open tour slot can be closed.");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("refuses to close a slot that has a linked booking and leaves the slot open", async () => {
    const { closeTourSlot } = await import("../../src/server/marketplace/availability/slot-lifecycle");
    const fixture = await createFixture();
    try {
      const travellerId = await createTraveller(fixture);
      const slot = await createSlot(fixture.experienceId, fixture.guideId, inHours(48), inHours(49));
      // Booking_slot_snapshot_complete requires the full snapshot when slotId is set.
      await prisma.booking.create({
        data: { travellerId, experienceId: fixture.experienceId, guideId: fixture.guideId, slotId: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt, timezone: slot.timezone, bookingDate: slot.startsAt, numberOfGuests: 2, totalAmount: 5000 },
      });

      harness.session.current = { id: fixture.adminUserId, role: "ADMIN" };
      await expect(closeTourSlot(slot.id)).rejects.toThrow("This departure has bookings and cannot be closed.");
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id } })).status).toBe("OPEN");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("exposes no client-supplied status: the only outcome is OPEN to CLOSED", async () => {
    const { closeTourSlot } = await import("../../src/server/marketplace/availability/slot-lifecycle");
    const fixture = await createFixture();
    try {
      const slot = await createSlot(fixture.experienceId, fixture.guideId, inHours(48), inHours(49));
      harness.session.current = { id: fixture.adminUserId, role: "ADMIN" };

      // The service signature accepts only an id, so no status/capacity payload can be supplied.
      expect(closeTourSlot.length).toBeLessThanOrEqual(2);
      const closed = await closeTourSlot(slot.id, new Date());
      expect(closed.status).toBe("CLOSED");

      const after = await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id } });
      expect(after.capacity).toBe(5);
      expect(after.status).toBe("CLOSED");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("guide-owned schedule management against local PostgreSQL", () => {
  it("creates, lists, updates and soft-disables the caller's own schedule rule", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      harness.session.current = { id: fixture.userId, role: "GUIDE" };

      const created = await api.createMyScheduleRule({ dayOfWeek: 2, startTimeLocal: "08:00", endTimeLocal: "12:00", effectiveFrom: "2026-11-01", effectiveTo: "2026-12-31" });
      expect(created).toMatchObject({ dayOfWeek: 2, startTimeLocal: "08:00", endTimeLocal: "12:00", active: true });
      // Identity is derived from the session, so the row belongs to the caller's guide profile.
      const stored = await prisma.guideScheduleRule.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.guideId).toBe(fixture.guideId);

      const listed = await api.listMyScheduleRules();
      expect(listed.map((rule) => rule.id)).toContain(created.id);

      const updated = await api.updateMyScheduleRule(created.id, { startTimeLocal: "09:00", endTimeLocal: "13:00" });
      expect(updated).toMatchObject({ startTimeLocal: "09:00", endTimeLocal: "13:00" });
      // effectiveFrom/effectiveTo survive an unrelated update.
      expect(updated.effectiveFrom).toEqual(stored.effectiveFrom);
      expect(updated.effectiveTo).toEqual(stored.effectiveTo);

      const disabled = await api.disableMyScheduleRule(created.id);
      expect(disabled.active).toBe(false);
      // Soft disable: the row is retained, not deleted.
      expect(await prisma.guideScheduleRule.count({ where: { id: created.id } })).toBe(1);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("never lets a guide read or modify another guide's schedule, and ignores a client guideId", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      const foreign = await prisma.guideScheduleRule.create({ data: { guideId: fixture.other.guideId, dayOfWeek: 3, startTimeLocal: "08:00", endTimeLocal: "10:00", active: true } });

      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      expect((await api.listMyScheduleRules()).map((rule) => rule.id)).not.toContain(foreign.id);
      await expect(api.updateMyScheduleRule(foreign.id, { startTimeLocal: "07:00" })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(api.disableMyScheduleRule(foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await prisma.guideScheduleRule.findUniqueOrThrow({ where: { id: foreign.id } })).startTimeLocal).toBe("08:00");

      // `.strict()` rejects any attempt to target another guide explicitly.
      await expect(api.createMyScheduleRule({ guideId: fixture.other.guideId, dayOfWeek: 1, startTimeLocal: "08:00", endTimeLocal: "10:00" })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.guideScheduleRule.count({ where: { guideId: fixture.other.guideId } })).toBe(1);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("rejects invalid local-time, day-of-week and date input", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      // HH:mm format, ordering, day-of-week range and ISO date format are all rejected.
      await expect(api.createMyScheduleRule({ dayOfWeek: 1, startTimeLocal: "9am", endTimeLocal: "10:00" })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(api.createMyScheduleRule({ dayOfWeek: 1, startTimeLocal: "12:00", endTimeLocal: "09:00" })).rejects.toThrow("A schedule window must end after it starts.");
      await expect(api.createMyScheduleRule({ dayOfWeek: 9, startTimeLocal: "08:00", endTimeLocal: "10:00" })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(api.createMyScheduleRule({ dayOfWeek: 1, startTimeLocal: "08:00", endTimeLocal: "10:00", effectiveFrom: "2026-13-40" })).rejects.toThrow("The supplied calendar date is invalid.");
      await expect(api.createMyScheduleRule({ dayOfWeek: 1, startTimeLocal: "08:00", endTimeLocal: "10:00", effectiveFrom: "2026-06-01", effectiveTo: "2026-05-01" })).rejects.toThrow("effectiveFrom cannot be later than effectiveTo.");
      expect(await prisma.guideScheduleRule.count({ where: { guideId: fixture.guideId } })).toBe(0);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("guide-owned unavailability against local PostgreSQL", () => {
  it("creates, lists and removes the caller's own unavailability window", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      const created = await api.createMyUnavailability({ startsAt: inHours(100).toISOString(), endsAt: inHours(102).toISOString(), reason: "Annual leave" });
      expect(created.reason).toBe("Annual leave");

      const stored = await prisma.guideUnavailability.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.guideId).toBe(fixture.guideId);
      expect((await api.listMyUnavailability()).map((item) => item.id)).toContain(created.id);

      await api.removeMyUnavailability(created.id);
      expect(await prisma.guideUnavailability.count({ where: { id: created.id } })).toBe(0);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("closes affected future open slots in the same transaction and leaves unaffected slots open", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      const inside = await createSlot(fixture.experienceId, fixture.guideId, inHours(50), inHours(51));
      const alsoInside = await createSlot(fixture.experienceId, fixture.guideId, inHours(52), inHours(53));
      const outside = await createSlot(fixture.experienceId, fixture.guideId, inHours(200), inHours(201));
      const otherGuideSlot = await createSlot(fixture.experienceId, fixture.other.guideId, inHours(50), inHours(51));

      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      const created = await api.createMyUnavailability({ startsAt: inHours(48).toISOString(), endsAt: inHours(60).toISOString() });

      expect(created.closedSlotCount).toBe(2);
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: inside.id } })).status).toBe("CLOSED");
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: alsoInside.id } })).status).toBe("CLOSED");
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: outside.id } })).status).toBe("OPEN");
      // Another guide's departure in the same window is untouched.
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: otherGuideSlot.id } })).status).toBe("OPEN");
      // No slot is ever deleted by this operation.
      expect(await prisma.tourSlot.count({ where: { experienceId: fixture.experienceId } })).toBe(4);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("is atomic: a booked slot in the window rolls back the unavailability record too", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      const travellerId = await createTraveller(fixture);
      const free = await createSlot(fixture.experienceId, fixture.guideId, inHours(50), inHours(51));
      const booked = await createSlot(fixture.experienceId, fixture.guideId, inHours(52), inHours(53));
      await prisma.booking.create({
        data: { travellerId, experienceId: fixture.experienceId, guideId: fixture.guideId, slotId: booked.id, startsAt: booked.startsAt, endsAt: booked.endsAt, timezone: booked.timezone, bookingDate: booked.startsAt, numberOfGuests: 1, totalAmount: 5000 },
      });

      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      await expect(api.createMyUnavailability({ startsAt: inHours(48).toISOString(), endsAt: inHours(60).toISOString() })).rejects.toThrow("have bookings");

      // Atomicity: neither the unavailability row nor the closable slot was committed.
      expect(await prisma.guideUnavailability.count({ where: { guideId: fixture.guideId } })).toBe(0);
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: free.id } })).status).toBe("OPEN");
      expect((await prisma.tourSlot.findUniqueOrThrow({ where: { id: booked.id } })).status).toBe("OPEN");
      // The pre-existing booking is untouched.
      expect(await prisma.booking.count({ where: { slotId: booked.id } })).toBe(1);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("never lets a guide remove another guide's unavailability or target them by client guideId", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const fixture = await createFixture();
    try {
      const foreign = await prisma.guideUnavailability.create({ data: { guideId: fixture.other.guideId, startsAt: inHours(30), endsAt: inHours(31), allDay: false } });

      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      expect((await api.listMyUnavailability()).map((item) => item.id)).not.toContain(foreign.id);
      await expect(api.removeMyUnavailability(foreign.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(await prisma.guideUnavailability.count({ where: { id: foreign.id } })).toBe(1);

      await expect(api.createMyUnavailability({ guideId: fixture.other.guideId, startsAt: inHours(30).toISOString(), endsAt: inHours(31).toISOString() })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(api.createMyUnavailability({ startsAt: inHours(31).toISOString(), endsAt: inHours(30).toISOString() })).rejects.toThrow("An unavailability window must end after it starts.");
      expect(await prisma.guideUnavailability.count({ where: { guideId: fixture.other.guideId } })).toBe(1);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("existing booking integrity across availability management", () => {
  it("leaves the three pre-existing bookings and every reservation untouched", async () => {
    const api = await import("../../src/server/marketplace/availability/guide-availability");
    const lifecycle = await import("../../src/server/marketplace/availability/slot-lifecycle");
    // Scope to legacy bookings only. Test files run in parallel workers against one database, so a
    // global `count(*) === 3` would race with fixtures written by a concurrently running file. Every
    // booking created by any test fixture is slot-linked, which cleanly separates the two sets.
    const legacyOnly = { slotId: null, reservationIdempotencyKey: null };
    const before = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(before).toHaveLength(3);
    expect(before.every((b) => b.startsAt === null && b.endsAt === null && b.timezone === null)).toBe(true);

    const fixture = await createFixture();
    try {
      harness.session.current = { id: fixture.userId, role: "GUIDE" };
      const rule = await api.createMyScheduleRule({ dayOfWeek: 1, startTimeLocal: "08:00", endTimeLocal: "12:00" });
      await api.updateMyScheduleRule(rule.id, { endTimeLocal: "13:00" });
      await createSlot(fixture.experienceId, fixture.guideId, inHours(50), inHours(51));
      await api.createMyUnavailability({ startsAt: inHours(48).toISOString(), endsAt: inHours(60).toISOString() });
      harness.session.current = { id: fixture.adminUserId, role: "ADMIN" };
      const other = await createSlot(fixture.experienceId, fixture.guideId, inHours(200), inHours(201));
      await lifecycle.closeTourSlot(other.id);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }

    const after = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
    // Scoped to this file's fixtures: parallel test files share one database, so global counts would
    // race with fixtures a concurrently running file is still using.
    expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(0);
    expect(await prisma.slotReservation.count({ where: { slot: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.bookingEvent.count({ where: { booking: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });
});