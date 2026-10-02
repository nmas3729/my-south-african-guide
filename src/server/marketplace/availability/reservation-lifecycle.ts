import { BookingEventType, BookingStatus, Prisma, SlotReservationStatus, UserRole } from "@prisma/client";
import { prisma } from "../../db/client";
import { requireRole } from "../../auth/session";
import { ConflictError, NotFoundError } from "../shared/errors";
import { consumesCapacity } from "./reservation";

export type ReservationStatusDto = {
  reservationId: string;
  bookingId: string;
  slotId: string;
  partySize: number;
  status: SlotReservationStatus;
  expiresAt: Date | null;
  held: boolean;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  capacity: number;
  remainingCapacity: number;
};

const reservationSelect = { id: true, bookingId: true, slotId: true, partySize: true, status: true, expiresAt: true } as const;

/**
 * Serializes on the authoritative TourSlot row. Every lifecycle mutation locks the slot first so it
 * can never interleave with a Phase 2C reservation creating capacity. Database time is read here so
 * expiry decisions share the single clock established in Phase 2C.
 */
async function lockSlot(tx: Prisma.TransactionClient, slotId: string) {
  const rows = await tx.$queryRaw<Array<{ capacity: number; dbNow: Date }>>(Prisma.sql`
    SELECT "capacity", CURRENT_TIMESTAMP AS "dbNow" FROM "TourSlot" WHERE "id" = ${slotId} FOR UPDATE
  `);
  const slot = rows[0];
  if (!slot) throw new NotFoundError("Departure not found.");
  return { capacity: slot.capacity, now: slot.dbNow };
}

/**
 * Acquires the same TourSlot lock for a caller that owns its own transaction (booking cancellation and
 * guide decline). Exposed so those operations serialize with reservation creation in the identical
 * order rather than duplicating the lock statement.
 */
export async function lockSlotForLifecycle(tx: Prisma.TransactionClient, slotId: string): Promise<Date> {
  const { now } = await lockSlot(tx, slotId);
  return now;
}

/** Recomputes the Phase 2A seat mirrors from the authoritative reservation rows. */
async function syncSeatMirrors(tx: Prisma.TransactionClient, slotId: string, now: Date): Promise<void> {
  const rows = await tx.slotReservation.findMany({
    where: { slotId, status: { in: [SlotReservationStatus.HELD, SlotReservationStatus.CONFIRMED] } },
    select: { status: true, partySize: true, expiresAt: true },
  });
  let held = 0;
  let committed = 0;
  for (const row of rows) {
    if (!consumesCapacity(row.status, row.expiresAt, now)) continue;
    if (row.status === SlotReservationStatus.CONFIRMED) committed += row.partySize;
    else held += row.partySize;
  }
  await tx.tourSlot.update({ where: { id: slotId }, data: { heldSeats: held, committedSeats: committed, updatedAt: now } });
}

async function activeSeats(tx: Prisma.TransactionClient, slotId: string, now: Date): Promise<number> {
  const rows = await tx.slotReservation.findMany({
    where: { slotId, status: { in: [SlotReservationStatus.HELD, SlotReservationStatus.CONFIRMED] } },
    select: { status: true, partySize: true, expiresAt: true },
  });
  return rows.filter((row) => consumesCapacity(row.status, row.expiresAt, now)).reduce((total, row) => total + row.partySize, 0);
}

export type ReleaseOutcome = "RELEASED" | "EXPIRED" | "ALREADY_TERMINAL";

/**
 * Releases the HELD reservation attached to a booking, inside the caller's transaction.
 *
 * Shared by the traveller release endpoint and by booking cancellation / guide decline so a single
 * implementation owns the reservation transition, its lifecycle event and the capacity mirrors. The
 * TourSlot row is locked by the caller before this runs, keeping lock order consistent with Phase 2C.
 *
 * A hold that has already elapsed is transitioned to EXPIRED rather than RELEASED: an expired hold can
 * never be resurrected, and reporting it as RELEASED would misstate why the seats were freed.
 *
 * Idempotent: a reservation that is already terminal is left untouched and reports
 * ALREADY_TERMINAL without emitting a second lifecycle event.
 */
export async function releaseReservationForBooking(tx: Prisma.TransactionClient, input: {
  bookingId: string;
  slotId: string;
  now: Date;
  actorId?: string | null;
  actorRole: UserRole;
  metadata?: Prisma.InputJsonValue;
}): Promise<ReleaseOutcome> {
  const reservation = await tx.slotReservation.findUnique({ where: { bookingId: input.bookingId }, select: reservationSelect });
  if (!reservation || reservation.slotId !== input.slotId) return "ALREADY_TERMINAL";
  if (reservation.status !== SlotReservationStatus.HELD) return "ALREADY_TERMINAL";

  // Conditional update: a concurrent release/expiry wins, and this call becomes a no-op.
  const alreadyExpired = reservation.expiresAt !== null && reservation.expiresAt <= input.now;
  const nextStatus = alreadyExpired ? SlotReservationStatus.EXPIRED : SlotReservationStatus.RELEASED;
  const updated = await tx.slotReservation.updateMany({
    where: { id: reservation.id, status: SlotReservationStatus.HELD },
    data: { status: nextStatus, releasedAt: input.now, updatedAt: input.now },
  });
  if (updated.count !== 1) return "ALREADY_TERMINAL";

  await tx.bookingEvent.create({
    data: {
      bookingId: input.bookingId,
      reservationId: reservation.id,
      type: alreadyExpired ? BookingEventType.RESERVATION_EXPIRED : BookingEventType.RESERVATION_RELEASED,
      actorId: input.actorId ?? null,
      actorRole: input.actorRole,
      metadata: input.metadata ?? (alreadyExpired ? { reason: "HOLD_EXPIRED" } : Prisma.JsonNull),
    },
  });

  await syncSeatMirrors(tx, input.slotId, input.now);
  return alreadyExpired ? "EXPIRED" : "RELEASED";
}

async function readReservationStatus(tx: Prisma.TransactionClient, reservationId: string, travellerId: string): Promise<ReservationStatusDto> {
  const reservation = await tx.slotReservation.findUnique({ where: { id: reservationId }, select: { ...reservationSelect, booking: { select: { travellerId: true } } } });
  if (!reservation) throw new NotFoundError("Reservation not found.");
  // Never expose another traveller's reservation; indistinguishable from "not found".
  if (reservation.booking.travellerId !== travellerId) throw new NotFoundError("Reservation not found.");

  const slot = await tx.tourSlot.findUniqueOrThrow({ where: { id: reservation.slotId }, select: { startsAt: true, endsAt: true, timezone: true, capacity: true } });
  const [{ now }] = await tx.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`);
  const used = await activeSeats(tx, reservation.slotId, now);
  return {
    reservationId: reservation.id,
    bookingId: reservation.bookingId,
    slotId: reservation.slotId,
    partySize: reservation.partySize,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    // Reported separately from `status` so a lapsed hold is never presented as active.
    held: consumesCapacity(reservation.status, reservation.expiresAt, now),
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    timezone: slot.timezone,
    capacity: slot.capacity,
    remainingCapacity: Math.max(0, slot.capacity - used),
  };
}

/** Read-only status for the owning traveller. This endpoint confers no lifecycle capability. */
export async function getMyReservationStatus(reservationId: string): Promise<ReservationStatusDto> {
  const traveller = await requireRole("TRAVELLER");
  return prisma.$transaction((tx) => readReservationStatus(tx, reservationId, traveller.id));
}

/**
 * Releases the caller's own HELD reservation and returns the seats to the pool.
 *
 * Idempotent: releasing an already-terminal reservation reports its current state rather than
 * failing, and never emits a second lifecycle event. This operation never confirms a booking.
 */
export async function releaseMyReservation(reservationId: string): Promise<{ reservationId: string; status: SlotReservationStatus; released: boolean }> {
  const traveller = await requireRole("TRAVELLER");

  return prisma.$transaction(async (tx) => {
    const owned = await tx.slotReservation.findUnique({
      where: { id: reservationId },
      select: { id: true, slotId: true, status: true, booking: { select: { id: true, travellerId: true, status: true } } },
    });
    if (!owned) throw new NotFoundError("Reservation not found.");
    if (owned.booking.travellerId !== traveller.id) throw new NotFoundError("Reservation not found.");

    // Lock before mutating so the release serializes with concurrent reservation creation.
    const { now } = await lockSlot(tx, owned.slotId);

    const outcome = await releaseReservationForBooking(tx, {
      bookingId: owned.booking.id,
      slotId: owned.slotId,
      now,
      actorId: traveller.id,
      actorRole: UserRole.TRAVELLER,
      metadata: { reason: "TRAVELLER_RELEASED" },
    });

    // A traveller releasing their own hold abandons the booking; leaving it live would block the
    // slot indefinitely, and an unpaid booking has no other route out of the state machine.
    if (outcome === "RELEASED") {
      await tx.booking.updateMany({
        where: { id: owned.booking.id, travellerId: traveller.id, status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED] } },
        data: { status: BookingStatus.CANCELLED, cancelledAt: now, updatedAt: now },
      });
      await tx.bookingEvent.create({
        data: { bookingId: owned.booking.id, reservationId: owned.id, type: BookingEventType.STATUS_CHANGED, fromStatus: owned.booking.status, toStatus: BookingStatus.CANCELLED, actorId: traveller.id, actorRole: UserRole.TRAVELLER },
      });
    }

    const current = await tx.slotReservation.findUniqueOrThrow({ where: { id: reservationId }, select: { id: true, status: true } });
    return { reservationId: current.id, status: current.status, released: outcome === "RELEASED" };
  });
}

/**
 * Sweeps lapsed holds. Safe to run repeatedly: a reservation only transitions while it is still HELD,
 * so each hold expires exactly once and emits exactly one RESERVATION_EXPIRED event. No background
 * worker is started in this phase; the service exists so expiry can be driven explicitly.
 */
export async function expireStaleReservations(): Promise<{ expired: number; slotIds: string[] }> {
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>(Prisma.sql`SELECT CURRENT_TIMESTAMP AS "now"`);
  const stale = await prisma.slotReservation.findMany({
    where: { status: SlotReservationStatus.HELD, OR: [{ expiresAt: null }, { expiresAt: { lte: now } }] },
    select: { id: true, slotId: true, bookingId: true },
    orderBy: { slotId: "asc" },
  });
  if (stale.length === 0) return { expired: 0, slotIds: [] };

  const slotIds = [...new Set(stale.map((row) => row.slotId))].sort();
  let expired = 0;
  for (const slotId of slotIds) {
    // One transaction per slot so locks are held for the shortest possible window.
    expired += await prisma.$transaction(async (tx) => {
      const { now: lockedNow } = await lockSlot(tx, slotId);
      let count = 0;
      for (const row of stale.filter((candidate) => candidate.slotId === slotId)) {
        const outcome = await releaseReservationForBooking(tx, {
          bookingId: row.bookingId,
          slotId,
          now: lockedNow,
          actorRole: UserRole.TRAVELLER,
          metadata: { reason: "HOLD_EXPIRED" },
        });
        if (outcome === "EXPIRED") count += 1;
      }
      return count;
    });
  }
  return { expired, slotIds };
}

/**
 * Phase 2D guard. There is deliberately no code path that can move a reservation or a booking to a
 * confirmed state: that transition is owned by the future verified-payment flow.
 */
export function assertPaymentVerificationRequired(): never {
  throw new ConflictError("This reservation cannot be confirmed: payment must be successfully processed and server-side verified first.");
}