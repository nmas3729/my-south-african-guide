import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

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
const key = (label: string) => `d-${label}-${randomUUID()}`;

/** Local calendar date of an instant in a given IANA zone. */
function localDate(instant: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Adds calendar days to a YYYY-MM-DD string without depending on the host timezone. */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return `${shifted.getUTCFullYear().toString().padStart(4, "0")}-${(shifted.getUTCMonth() + 1).toString().padStart(2, "0")}-${shifted.getUTCDate().toString().padStart(2, "0")}`;
}

type Fixture = { travellerId: string; otherTravellerId: string; guideUserId: string; guideId: string; destinationId: string; experienceId: string };

async function createFixture(capacity: number): Promise<Fixture> {
  const travellerId = randomUUID();
  const otherTravellerId = randomUUID();
  const guideUserId = randomUUID();
  const guideId = randomUUID();
  const destinationId = randomUUID();
  const experienceId = randomUUID();
  const suffix = randomUUID();

  await prisma.user.create({ data: { id: travellerId, email: `d-trav-${randomUUID()}@test.invalid`, role: "TRAVELLER" } });
  await prisma.user.create({ data: { id: otherTravellerId, email: `d-oth-${randomUUID()}@test.invalid`, role: "TRAVELLER" } });
  await prisma.user.create({ data: { id: guideUserId, email: `d-guide-${randomUUID()}@test.invalid`, role: "GUIDE" } });
  await prisma.guideProfile.create({ data: { id: guideId, userId: guideUserId, languages: [], provinces: [], qualifications: [], timezone: "Africa/Johannesburg", active: true, verified: true, verificationStatus: "APPROVED" } });
  await prisma.destination.create({ data: { id: destinationId, name: "Lifecycle Test", province: "Western Cape", slug: `lc-d-${suffix}`, status: "PUBLISHED" } });
  await prisma.experience.create({ data: { id: experienceId, guideId, destinationId, title: "Lifecycle Test", slug: `lc-e-${suffix}`, description: "fixture", duration: 60, price: 1000, groupLimit: 999, timezone: "Africa/Johannesburg", languages: [], status: "ACTIVE" } });
  await prisma.tourSlot.create({ data: { experienceId, guideId, startsAt: inHours(48), endsAt: inHours(49), timezone: "Africa/Johannesburg", capacity, status: "OPEN" } });
  return { travellerId, otherTravellerId, guideUserId, guideId, destinationId, experienceId };
}

async function destroyFixture(f: Fixture): Promise<void> {
  await prisma.bookingEvent.deleteMany({ where: { booking: { experienceId: f.experienceId } } });
  await prisma.slotReservation.deleteMany({ where: { slot: { experienceId: f.experienceId } } });
  await prisma.booking.deleteMany({ where: { experienceId: f.experienceId } });
  await prisma.tourSlot.deleteMany({ where: { experienceId: f.experienceId } });
  await prisma.experience.deleteMany({ where: { id: f.experienceId } });
  await prisma.guideProfile.deleteMany({ where: { id: f.guideId } });
  await prisma.destination.deleteMany({ where: { id: f.destinationId } });
  await prisma.user.deleteMany({ where: { id: { in: [f.travellerId, f.otherTravellerId, f.guideUserId] } } });
}

async function slotId(f: Fixture): Promise<string> {
  return (await prisma.tourSlot.findFirstOrThrow({ where: { experienceId: f.experienceId }, select: { id: true } })).id;
}

/** Places a real hold through the production Phase 2C reservation service. */
async function hold(f: Fixture, travellerId: string, partySize: number, label: string) {
  const { reserveSlot } = await import("../../src/server/marketplace/availability/reservation-service");
  harness.session.current = { id: travellerId, role: "TRAVELLER" };
  return reserveSlot({ slotId: await slotId(f), partySize, idempotencyKey: key(label) });
}

/** Active seats recomputed independently from reservation rows. */
async function activeSeats(id: string): Promise<number> {
  const now = new Date();
  const rows = await prisma.slotReservation.findMany({ where: { slotId: id, status: { in: ["HELD", "CONFIRMED"] } }, select: { status: true, partySize: true, expiresAt: true } });
  return rows.filter((r) => r.status === "CONFIRMED" || (r.expiresAt !== null && r.expiresAt > now)).reduce((t, r) => t + r.partySize, 0);
}

suite("Phase 2D premature confirmation is blocked", () => {
  it("cannot move a booking to CONFIRMED through any Phase 2D operation", async () => {
    const { canTransitionBooking } = await import("../../src/server/marketplace/bookings/state-machine");
    const bookings = await import("../../src/server/marketplace/bookings/service");
    const lifecycle = await import("../../src/server/marketplace/availability/reservation-lifecycle");

    expect(canTransitionBooking("ACCEPTED", "CONFIRMED")).toBe(false);
    // No confirmation service or reservation confirmation capability is exported.
    expect(Object.keys(bookings)).not.toContain("confirmBooking");
    expect(Object.keys(lifecycle)).not.toContain("confirmReservation");
    expect(Object.keys(lifecycle)).not.toContain("confirmMyReservation");
    expect(() => lifecycle.assertPaymentVerificationRequired()).toThrow("payment must be successfully processed and server-side verified");
  });

  it("leaves an accepted booking unconfirmed after every Phase 2D lifecycle operation", async () => {
    const f = await createFixture(5);
    try {
      const { acceptBookingRequest } = await import("../../src/server/marketplace/bookings/service");
      const held = await hold(f, f.travellerId, 2, "gate");
      harness.session.current = { id: f.guideUserId, role: "GUIDE" };
      await acceptBookingRequest(held.bookingId);

      const afterAccept = await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId }, select: { status: true } });
      expect(afterAccept.status).toBe("ACCEPTED");
      expect(afterAccept.status).not.toBe("CONFIRMED");

      // The reservation stays HELD: Phase 2D cannot confirm it either.
      const reservation = await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } });
      expect(reservation.status).toBe("HELD");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });
});

suite("Phase 2D reservation release against local PostgreSQL", () => {
  it("releases a HELD reservation, restores capacity and is idempotent", async () => {
    const { releaseMyReservation } = await import("../../src/server/marketplace/availability/reservation-lifecycle");
    const f = await createFixture(3);
    try {
      const id = await slotId(f);
      const held = await hold(f, f.travellerId, 3, "release");
      expect(await activeSeats(id)).toBe(3);

      harness.session.current = { id: f.travellerId, role: "TRAVELLER" };
      const first = await releaseMyReservation(held.reservationId);
      expect(first).toMatchObject({ status: "RELEASED", released: true });

      // Capacity is restored immediately.
      expect(await activeSeats(id)).toBe(0);
      const mirror = await prisma.tourSlot.findUniqueOrThrow({ where: { id }, select: { heldSeats: true, committedSeats: true } });
      expect(mirror).toMatchObject({ heldSeats: 0, committedSeats: 0 });

      // Repeated release is safe and emits no second lifecycle event.
      const second = await releaseMyReservation(held.reservationId);
      expect(second).toMatchObject({ status: "RELEASED", released: false });
      expect(await prisma.bookingEvent.count({ where: { bookingId: held.bookingId, type: "RESERVATION_RELEASED" } })).toBe(1);

      // Releasing the hold abandons the unpaid booking rather than leaving it live.
      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId }, select: { status: true } });
      expect(booking.status).toBe("CANCELLED");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });

  it("prevents one traveller from reading or releasing another traveller's reservation", async () => {
    const { releaseMyReservation, getMyReservationStatus } = await import("../../src/server/marketplace/availability/reservation-lifecycle");
    const f = await createFixture(5);
    try {
      const held = await hold(f, f.travellerId, 2, "owner");

      harness.session.current = { id: f.otherTravellerId, role: "TRAVELLER" };
      await expect(getMyReservationStatus(held.reservationId)).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(releaseMyReservation(held.reservationId)).rejects.toMatchObject({ code: "NOT_FOUND" });

      const reservation = await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } });
      expect(reservation.status).toBe("HELD");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });

  it("exposes reservation status with remaining capacity for the owner only", async () => {
    const { getMyReservationStatus } = await import("../../src/server/marketplace/availability/reservation-lifecycle");
    const f = await createFixture(5);
    try {
      const held = await hold(f, f.travellerId, 2, "status");
      harness.session.current = { id: f.travellerId, role: "TRAVELLER" };
      const status = await getMyReservationStatus(held.reservationId);
      expect(status).toMatchObject({ status: "HELD", held: true, partySize: 2, capacity: 5, remainingCapacity: 3 });
      expect(status.timezone).toBe("Africa/Johannesburg");
      // The read endpoint confers no lifecycle capability.
      expect(status).not.toHaveProperty("confirmationToken");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });
});

suite("Phase 2D booking synchronization against local PostgreSQL", () => {
  it("cancels a booking and releases its hold atomically", async () => {
    const { cancelBookingRequest } = await import("../../src/server/marketplace/bookings/service");
    const f = await createFixture(3);
    try {
      const id = await slotId(f);
      const held = await hold(f, f.travellerId, 3, "cancel");

      harness.session.current = { id: f.travellerId, role: "TRAVELLER" };
      await cancelBookingRequest(held.bookingId);

      const booking = await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId }, select: { status: true } });
      const reservation = await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } });
      // Never a CANCELLED booking that still holds capacity.
      expect(booking.status).toBe("CANCELLED");
      expect(reservation.status).toBe("RELEASED");
      expect(await activeSeats(id)).toBe(0);

      const events = await prisma.bookingEvent.findMany({ where: { bookingId: held.bookingId }, select: { type: true } });
      expect(events.map((e) => e.type).sort()).toEqual(["BOOKING_CREATED", "RESERVATION_HELD", "RESERVATION_RELEASED", "STATUS_CHANGED"].sort());

      // A repeated cancellation is rejected by the state machine without corrupting state.
      await expect(cancelBookingRequest(held.bookingId)).rejects.toThrow("Cannot change booking");
      expect((await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } })).status).toBe("RELEASED");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });

  it("declines a booking and releases its hold atomically", async () => {
    const { declineBookingRequest } = await import("../../src/server/marketplace/bookings/service");
    const f = await createFixture(3);
    try {
      const id = await slotId(f);
      const held = await hold(f, f.travellerId, 3, "decline");

      harness.session.current = { id: f.guideUserId, role: "GUIDE" };
      await declineBookingRequest(held.bookingId);

      expect((await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId }, select: { status: true } })).status).toBe("DECLINED");
      expect((await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } })).status).toBe("RELEASED");
      expect(await activeSeats(id)).toBe(0);

      // Repeated decline is safe.
      await expect(declineBookingRequest(held.bookingId)).rejects.toThrow("Cannot change booking");
      expect(await prisma.bookingEvent.count({ where: { bookingId: held.bookingId, type: "STATUS_CHANGED" } })).toBe(1);
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });

  it("stops an unauthorised guide from declining another guide's booking", async () => {
    const { declineBookingRequest } = await import("../../src/server/marketplace/bookings/service");
    const f = await createFixture(3);
    try {
      const held = await hold(f, f.travellerId, 2, "denied");
      const { acceptBookingRequest } = await import("../../src/server/marketplace/bookings/service");
      harness.session.current = { id: f.guideUserId, role: "GUIDE" };
      await acceptBookingRequest(held.bookingId);

      const otherGuideUser = randomUUID();
      const otherGuide = randomUUID();
      await prisma.user.create({ data: { id: otherGuideUser, email: `d-og-${randomUUID()}@test.invalid`, role: "GUIDE" } });
      await prisma.guideProfile.create({ data: { id: otherGuide, userId: otherGuideUser, languages: [], provinces: [], qualifications: [], timezone: "Africa/Johannesburg", active: true, verified: true, verificationStatus: "APPROVED" } });
      try {
        harness.session.current = { id: otherGuideUser, role: "GUIDE" };
        await expect(declineBookingRequest(held.bookingId)).rejects.toMatchObject({ code: "FORBIDDEN" });
        expect((await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } })).status).toBe("HELD");
      } finally {
        await prisma.guideProfile.deleteMany({ where: { id: otherGuide } });
        await prisma.user.deleteMany({ where: { id: otherGuideUser } });
      }
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });
});

suite("Phase 2D expiry and remaining capacity against local PostgreSQL", () => {
  it("expires a stale hold without resurrecting it and is safe to repeat", async () => {
    const { expireStaleReservations } = await import("../../src/server/marketplace/availability/reservation-lifecycle");
    const f = await createFixture(3);
    try {
      const id = await slotId(f);
      const held = await hold(f, f.travellerId, 3, "expire");
      // Move the hold into the past; createdAt moves too so the Phase 2A check constraint holds.
      await prisma.slotReservation.update({ where: { id: held.reservationId }, data: { createdAt: new Date(Date.now() - 2 * HOUR), expiresAt: new Date(Date.now() - HOUR) } });

      harness.session.current = { id: f.travellerId, role: "TRAVELLER" };
      const first = await expireStaleReservations();
      expect(first.expired).toBe(1);

      const afterExpiry = await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } });
      expect(afterExpiry.status).toBe("EXPIRED");
      expect(await activeSeats(id)).toBe(0);
      expect(await prisma.bookingEvent.count({ where: { bookingId: held.bookingId, type: "RESERVATION_EXPIRED" } })).toBe(1);

      // Re-running is a no-op: no duplicate event, and the expired hold is never resurrected.
      const second = await expireStaleReservations();
      expect(second.expired).toBe(0);
      expect((await prisma.slotReservation.findUniqueOrThrow({ where: { id: held.reservationId }, select: { status: true } })).status).toBe("EXPIRED");
      expect(await prisma.bookingEvent.count({ where: { bookingId: held.bookingId, type: "RESERVATION_EXPIRED" } })).toBe(1);

      // The booking is never confirmed by expiry.
      expect((await prisma.booking.findUniqueOrThrow({ where: { id: held.bookingId }, select: { status: true } })).status).not.toBe("CONFIRMED");
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });

  it("reports remaining capacity on the public slot lookup, excluding stale holds", async () => {
    const { listBookableSlots } = await import("../../src/server/marketplace/availability/slots");
    const f = await createFixture(5);
    try {
      const held = await hold(f, f.travellerId, 2, "cap");
      const [expiredHold] = await Promise.all([hold(f, f.otherTravellerId, 1, "cap2")]);
      // Make the second hold stale so it must not suppress availability.
      await prisma.slotReservation.update({ where: { id: expiredHold.reservationId }, data: { createdAt: new Date(Date.now() - 2 * HOUR), expiresAt: new Date(Date.now() - HOUR) } });

      const slug = (await prisma.experience.findUniqueOrThrow({ where: { id: f.experienceId }, select: { slug: true } })).slug;
      const { startsAt } = await prisma.tourSlot.findUniqueOrThrow({ where: { id: held.slotId }, select: { startsAt: true } });
      // Both bounds must be expressed in the experience timezone; mixing zones breaks the range.
      const day = localDate(startsAt, "Africa/Johannesburg");
      const nextDay = addDays(day, 1);

      const slots = await listBookableSlots(slug, { dateFrom: day, dateTo: nextDay });
      const slot = slots.find((s) => s.id === held.slotId);
      expect(slot).toBeDefined();
      // 5 capacity - 2 active seats; the stale 1-seat hold is excluded.
      expect(slot!.remainingCapacity).toBe(3);
      expect(slot!.capacity).toBe(5);
    } finally {
      await destroyFixture(f);
      harness.session.current = null;
    }
  });
});