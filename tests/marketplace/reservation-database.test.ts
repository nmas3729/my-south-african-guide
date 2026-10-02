import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

// Real PostgreSQL client injected into the service's module, so the production reservation
// service runs unmodified. Only the authenticated session is controllable.
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
vi.mock("../../src/server/auth/session", () => ({
  requireRole: async (...roles: string[]) => {
    if (!harness.session.current) throw Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" });
    if (!roles.includes(harness.session.current.role)) throw Object.assign(new Error("FORBIDDEN"), { code: "FORBIDDEN" });
    return harness.session.current;
  },
  requireUser: async () => {
    if (!harness.session.current) throw Object.assign(new Error("UNAUTHENTICATED"), { code: "UNAUTHENTICATED" });
    return harness.session.current;
  },
}));

const prisma = harness.prisma!;
const suite = harness.localDatabase ? describe : describe.skip;

const HOUR = 60 * 60 * 1000;
const inHours = (hours: number) => new Date(Date.now() + hours * HOUR);
const key = (label: string) => `resv-${label}-${randomUUID()}`;

type Fixture = {
  travellerId: string;
  travellerId2: string;
  guideUserId: string;
  guideId: string;
  destinationId: string;
  experienceId: string;
};

const BOOKING_COLUMNS = { id: true, status: true, slotId: true, startsAt: true, endsAt: true, timezone: true, numberOfGuests: true, reservationIdempotencyKey: true } as const;

async function createFixture(capacity = 5): Promise<Fixture> {
  const travellerId = randomUUID();
  const travellerId2 = randomUUID();
  const guideId = randomUUID();
  const guideUserId = randomUUID();
  const destinationId = randomUUID();
  const experienceId = randomUUID();
  const suffix = randomUUID();

  await prisma.user.create({ data: { id: travellerId, email: `resv-trav-${randomUUID()}@test.invalid`, role: "TRAVELLER" } });
  await prisma.user.create({ data: { id: travellerId2, email: `resv-trav2-${randomUUID()}@test.invalid`, role: "TRAVELLER" } });
  await prisma.user.create({ data: { id: guideUserId, email: `resv-guide-${randomUUID()}@test.invalid`, role: "GUIDE" } });
  await prisma.guideProfile.create({ data: { id: guideId, userId: guideUserId, languages: [], provinces: [], qualifications: [], timezone: "Africa/Johannesburg", active: true, verified: true, verificationStatus: "APPROVED" } });
  await prisma.destination.create({ data: { id: destinationId, name: "Reservation Test", province: "Western Cape", slug: `resv-d-${suffix}`, status: "PUBLISHED" } });
  await prisma.experience.create({ data: { id: experienceId, guideId, destinationId, title: "Reservation Test", slug: `resv-e-${suffix}`, description: "fixture", duration: 60, price: 1000, groupLimit: 99, timezone: "Africa/Johannesburg", languages: [], status: "ACTIVE" } });
  await prisma.tourSlot.create({ data: { experienceId, guideId, startsAt: inHours(48), endsAt: inHours(49), timezone: "Africa/Johannesburg", capacity, status: "OPEN" } });
  return { travellerId, travellerId2, guideUserId, guideId, destinationId, experienceId };
}

async function destroyFixture(fixture: Fixture): Promise<void> {
  await prisma.bookingEvent.deleteMany({ where: { booking: { experienceId: fixture.experienceId } } });
  await prisma.slotReservation.deleteMany({ where: { slot: { experienceId: fixture.experienceId } } });
  await prisma.booking.deleteMany({ where: { experienceId: fixture.experienceId } });
  await prisma.tourSlot.deleteMany({ where: { experienceId: fixture.experienceId } });
  await prisma.experience.deleteMany({ where: { id: fixture.experienceId } });
  await prisma.guideProfile.deleteMany({ where: { id: fixture.guideId } });
  await prisma.destination.deleteMany({ where: { id: fixture.destinationId } });
  // Every user the fixture created must go, including the one that owned the guide profile.
  await prisma.user.deleteMany({ where: { id: { in: [fixture.travellerId, fixture.travellerId2, fixture.guideUserId] } } });
}

async function slotFor(experienceId: string) {
  return prisma.tourSlot.findFirstOrThrow({ where: { experienceId }, select: { id: true, capacity: true } });
}

/** Active seats recomputed independently of the service, straight from reservation rows. */
async function activeSeats(slotId: string): Promise<number> {
  const now = new Date();
  const rows = await prisma.slotReservation.findMany({ where: { slotId, status: { in: ["HELD", "CONFIRMED"] } }, select: { status: true, partySize: true, expiresAt: true } });
  return rows.filter((row) => row.status === "CONFIRMED" || (row.expiresAt !== null && row.expiresAt > now)).reduce((total, row) => total + row.partySize, 0);
}

suite("Phase 2C concurrency against local PostgreSQL", () => {
  it("allows exactly one of two concurrent reservations when capacity 5 is contested by 4 and 3", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);

      // Both travellers fire at the same time. The database row lock must serialize them.
      const attempt = async (travellerId: string, partySize: number) => {
        harness.session.current = { id: travellerId, role: "TRAVELLER" };
        return reserveSlot({ slotId: slot.id, partySize, idempotencyKey: key("race") }).then(
          (value) => ({ ok: true as const, value }),
          (error: Error) => ({ ok: false as const, error }),
        );
      };

      const [a, b] = await Promise.all([attempt(fixture.travellerId, 4), attempt(fixture.travellerId2, 3)]);
      const successes = [a, b].filter((result) => result.ok);
      const failures = [a, b].filter((result) => !result.ok);

      expect(successes).toHaveLength(1);
      expect(failures).toHaveLength(1);
      // The loser must be an insufficient-capacity conflict, not an arbitrary database error.
      expect((failures[0] as { error: Error }).error).toMatchObject({ code: "CONFLICT" });
      expect((failures[0] as { error: Error }).error.message).toMatch(/remain|fully booked/);

      // The invariant: active seats never exceed the authoritative slot capacity.
      const used = await activeSeats(slot.id);
      expect(used).toBeLessThanOrEqual(slot.capacity);
      expect(used).toBe(4);
      expect(await prisma.slotReservation.count({ where: { slotId: slot.id } })).toBe(1);

      // The Phase 2A seat mirror agrees with the authoritative reservation rows.
      const mirror = await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id }, select: { heldSeats: true, committedSeats: true } });
      expect(mirror.heldSeats).toBe(used);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("serializes three concurrent reservations so the slot never oversells", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      const attempt = async (travellerId: string, partySize: number) => {
        harness.session.current = { id: travellerId, role: "TRAVELLER" };
        return reserveSlot({ slotId: slot.id, partySize, idempotencyKey: key("trio") }).then(() => true, () => false);
      };
      // 2 + 2 + 3 cannot all fit in 5, so exactly two must win.
      const results = await Promise.all([attempt(fixture.travellerId, 2), attempt(fixture.travellerId2, 2), attempt(fixture.travellerId, 3)]);
      expect(results.filter(Boolean)).toHaveLength(2);
      expect(await activeSeats(slot.id)).toBeLessThanOrEqual(slot.capacity);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("Phase 2C capacity against local PostgreSQL", () => {
  it("reserves when capacity is available and fails when it is exhausted", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      const ok = await reserveSlot({ slotId: slot.id, partySize: 5, idempotencyKey: key("full") });
      expect(ok).toMatchObject({ status: "HELD", partySize: 5, remainingCapacity: 0 });
      expect(await activeSeats(slot.id)).toBe(5);

      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("over") })).rejects.toThrow("This departure is fully booked.");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("counts only HELD (unexpired) and CONFIRMED reservations as capacity", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      const travellers = [fixture.travellerId, fixture.travellerId2];
      const statuses = ["CONFIRMED", "RELEASED", "EXPIRED", "CANCELLED"] as const;

      for (const [index, status] of statuses.entries()) {
        harness.session.current = { id: travellers[index % travellers.length], role: "TRAVELLER" };
        const created = await reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key(`s-${status}`) });
        await prisma.slotReservation.update({ where: { id: created.reservationId }, data: { status, releasedAt: new Date() } });
      }
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("held") });

      // Only the CONFIRMED seat and the live HELD seat consume capacity.
      expect(await activeSeats(slot.id)).toBe(2);
      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 4, idempotencyKey: key("toobig") })).rejects.toThrow(/Only 3 place\(s\) remain/);
      expect(await reserveSlot({ slotId: slot.id, partySize: 3, idempotencyKey: key("exact") })).toMatchObject({ remainingCapacity: 0 });
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("rejects a party size above the slot capacity without creating anything", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(2);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 3, idempotencyKey: key("oversize") })).rejects.toThrow("Only 2 place(s) remain");
      expect(await prisma.slotReservation.count({ where: { slotId: slot.id } })).toBe(0);
      expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(0);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("Phase 2C hold lifecycle against local PostgreSQL", () => {
  it("sets a 30 minute hold from database time and records a RESERVATION_HELD event", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      const dbNow = await prisma.$queryRawUnsafe<Array<{ now: Date }>>("SELECT CURRENT_TIMESTAMP AS now");
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      const created = await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey: key("hold") });

      expect(created.status).toBe("HELD");
      expect(created.expiresAt).not.toBeNull();
      const deltaMinutes = (created.expiresAt!.getTime() - dbNow[0].now.getTime()) / 60_000;
      // Tolerance covers the millisecond truncation of the `Timestamptz(3)` column.
      expect(deltaMinutes).toBeGreaterThan(29.9);
      expect(deltaMinutes).toBeLessThan(30.05);

      const events = await prisma.bookingEvent.findMany({ where: { bookingId: created.bookingId }, orderBy: { createdAt: "asc" }, select: { type: true, reservationId: true } });
      expect(events.map((event) => event.type)).toEqual(["BOOKING_CREATED", "RESERVATION_HELD"]);
      expect(events[1].reservationId).toBe(created.reservationId);

      // The booking carries the slot snapshot; bookingDate stays compatibility data.
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, select: { slotId: true, startsAt: true, endsAt: true, timezone: true, bookingDate: true, status: true } });
      expect(booking).toMatchObject({ slotId: slot.id, timezone: "Africa/Johannesburg", status: "REQUESTED" });
      expect(booking.startsAt?.toISOString()).toBe(booking.bookingDate.toISOString());
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("expires a stale hold and frees its seats inside the next reservation transaction", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      const first = await reserveSlot({ slotId: slot.id, partySize: 5, idempotencyKey: key("stale") });

      // Force the hold into the past to simulate a 30 minute window elapsing. `createdAt` moves back
      // too, so the Phase 2A `SlotReservation_held_expiry_valid` constraint (expiresAt > createdAt)
      // remains satisfied while the hold is genuinely stale.
      const twoHoursAgo = new Date(Date.now() - 2 * HOUR);
      await prisma.slotReservation.update({ where: { id: first.reservationId }, data: { createdAt: twoHoursAgo, expiresAt: new Date(Date.now() - 60_000) } });

      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      const second = await reserveSlot({ slotId: slot.id, partySize: 5, idempotencyKey: key("fresh") });
      expect(second.remainingCapacity).toBe(0);

      const expired = await prisma.slotReservation.findUniqueOrThrow({ where: { id: first.reservationId }, select: { status: true, releasedAt: true } });
      expect(expired.status).toBe("EXPIRED");
      expect(expired.releasedAt).not.toBeNull();

      const expiryEvents = await prisma.bookingEvent.findMany({ where: { bookingId: first.bookingId, type: "RESERVATION_EXPIRED" }, select: { reservationId: true } });
      expect(expiryEvents).toHaveLength(1);
      expect(expiryEvents[0].reservationId).toBe(first.reservationId);

      // Expired seats no longer consume capacity and the mirror was refreshed.
      expect(await activeSeats(slot.id)).toBe(5);
      const mirror = await prisma.tourSlot.findUniqueOrThrow({ where: { id: slot.id }, select: { heldSeats: true } });
      expect(mirror.heldSeats).toBe(5);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("keeps a live hold consuming capacity so a second traveller cannot take those seats", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(3);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await reserveSlot({ slotId: slot.id, partySize: 3, idempotencyKey: key("live") });
      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("blocked") })).rejects.toThrow("This departure is fully booked.");
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("Phase 2C idempotency against local PostgreSQL", () => {
  it("replays an identical request without duplicating anything or consuming capacity twice", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      const idempotencyKey = key("same");
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };

      const first = await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey });
      const second = await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey });

      expect(second.reservationId).toBe(first.reservationId);
      expect(second.bookingId).toBe(first.bookingId);
      expect(await prisma.booking.count({ where: { travellerId: fixture.travellerId, reservationIdempotencyKey: idempotencyKey } })).toBe(1);
      expect(await prisma.slotReservation.count({ where: { slotId: slot.id } })).toBe(1);
      expect(await activeSeats(slot.id)).toBe(2);
      // Lifecycle events are not duplicated by the replay.
      expect(await prisma.bookingEvent.count({ where: { bookingId: first.bookingId } })).toBe(2);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("rejects an idempotency key reused for a materially different request", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      const idempotencyKey = key("conflict");
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey });

      await expect(reserveSlot({ slotId: slot.id, partySize: 3, idempotencyKey })).rejects.toThrow("already used for a different reservation request");
      expect(await prisma.booking.count({ where: { reservationIdempotencyKey: idempotencyKey } })).toBe(1);
      expect(await prisma.slotReservation.count({ where: { slotId: slot.id } })).toBe(1);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("Phase 2C ownership and slot state against local PostgreSQL", () => {
  it("uses the authenticated traveller and refuses a client-supplied traveller", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      const created = await reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("owner") });
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: created.bookingId }, select: { travellerId: true } });
      expect(booking.travellerId).toBe(fixture.travellerId);

      // A client-supplied traveller is rejected outright by the strict schema.
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("spoof"), travellerId: fixture.travellerId2 })).rejects.toMatchObject({ code: "VALIDATION" });

      // A GUIDE cannot reserve on a traveller's behalf.
      harness.session.current = { id: fixture.travellerId2, role: "GUIDE" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("guide") })).rejects.toMatchObject({ code: "FORBIDDEN" });
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("reserves an OPEN slot and refuses a CLOSED slot, a departed slot and an unknown slot", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("open") });

      await prisma.tourSlot.update({ where: { id: slot.id }, data: { status: "CLOSED" } });
      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("closed") })).rejects.toThrow("This departure is not open for reservations.");

      const past = await prisma.tourSlot.create({ data: { experienceId: fixture.experienceId, guideId: fixture.guideId, startsAt: inHours(-2), endsAt: inHours(-1), timezone: "Africa/Johannesburg", capacity: 3, status: "OPEN" } });
      await expect(reserveSlot({ slotId: past.id, partySize: 1, idempotencyKey: key("past") })).rejects.toThrow("This departure has already started.");
      await expect(reserveSlot({ slotId: "missing-slot", partySize: 1, idempotencyKey: key("missing") })).rejects.toMatchObject({ code: "NOT_FOUND" });
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("rejects invalid party sizes and missing idempotency keys without writing", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(5);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 0, idempotencyKey: key("zero") })).rejects.toMatchObject({ code: "VALIDATION" });
      await expect(reserveSlot({ slotId: slot.id, partySize: 1 })).rejects.toMatchObject({ code: "VALIDATION" });
      expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(0);
      expect(await prisma.slotReservation.count({ where: { slot: { experienceId: fixture.experienceId } } })).toBe(0);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });
});

suite("Phase 2C atomicity and regression against local PostgreSQL", () => {
  it("creates booking, reservation and events atomically and leaves no orphan rows on failure", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    const fixture = await createFixture(2);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      const first = await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey: key("atomic-ok") });

      harness.session.current = { id: fixture.travellerId2, role: "TRAVELLER" };
      await expect(reserveSlot({ slotId: slot.id, partySize: 1, idempotencyKey: key("atomic-fail") })).rejects.toThrow("This departure is fully booked.");

      expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(1);
      expect(await prisma.slotReservation.count({ where: { slotId: slot.id } })).toBe(1);
      // Scoped to this fixture: a concurrently running test file may have its own events in flight.
      expect(await prisma.bookingEvent.count({ where: { booking: { experienceId: fixture.experienceId } } })).toBe(2);
      expect(await prisma.bookingEvent.count({ where: { bookingId: { not: first.bookingId }, booking: { experienceId: fixture.experienceId } } })).toBe(0);
      // Phase 2C creates no financial records.
      expect(await prisma.payment.count()).toBe(0);
      expect(await prisma.invoice.count()).toBe(0);
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }
  });

  it("leaves the three pre-existing bookings completely unchanged", async () => {
    const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
    // Scoped to legacy bookings: parallel test files share one database, so a global count would race
    // with fixtures written concurrently. Every booking this file creates is slot-linked.
    const legacyOnly = { slotId: null, reservationIdempotencyKey: null };
    const before = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(before).toHaveLength(3);
    expect(before.every((booking) => booking.startsAt === null && booking.endsAt === null && booking.timezone === null)).toBe(true);

    const fixture = await createFixture(4);
    try {
      const slot = await slotFor(fixture.experienceId);
      harness.session.current = { id: fixture.travellerId, role: "TRAVELLER" };
      await reserveSlot({ slotId: slot.id, partySize: 2, idempotencyKey: key("regression") });
    } finally {
      await destroyFixture(fixture);
      harness.session.current = null;
    }

    const after = await prisma.booking.findMany({ where: legacyOnly, select: BOOKING_COLUMNS, orderBy: { id: "asc" } });
    expect(after).toEqual(before);
    expect(after.map((booking) => booking.id)).toEqual(before.map((booking) => booking.id));
    expect(after.map((booking) => booking.status)).toEqual(before.map((booking) => booking.status));
    // Scoped to this file's fixtures: parallel test files share one database, so global counts would
    // race with fixtures a concurrently running file is still using.
    expect(await prisma.booking.count({ where: { experienceId: fixture.experienceId } })).toBe(0);
    expect(await prisma.slotReservation.count({ where: { slot: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.bookingEvent.count({ where: { booking: { experienceId: fixture.experienceId } } })).toBe(0);
    expect(await prisma.payment.count()).toBe(0);
  });
});