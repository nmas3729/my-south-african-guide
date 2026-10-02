import { BookingEventType, BookingStatus, ExperienceStatus, Prisma, SlotReservationStatus, TourSlotStatus, UserRole, VerificationStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { requireRole } from "../../auth/session";
import { ConflictError, NotFoundError } from "../shared/errors";
import { assertValidReservationRequest, consumesCapacity, reservationRequestHash, RESERVATION_HOLD_MINUTES } from "./reservation";

export type ReservationDto = {
  reservationId: string;
  bookingId: string;
  slotId: string;
  partySize: number;
  status: SlotReservationStatus;
  expiresAt: Date | null;
  startsAt: Date;
  endsAt: Date;
  timezone: string;
  remainingCapacity: number;
};

const reservationSelect = { id: true, bookingId: true, slotId: true, partySize: true, status: true, expiresAt: true } as const;

/**
 * Locks the authoritative TourSlot row for the remainder of the transaction.
 *
 * `SELECT ... FOR UPDATE` is the concurrency authority: two concurrent reservations for the same
 * slot serialize here, so the capacity read that follows cannot interleave. No application mutex or
 * in-memory lock is involved. The database transaction time is also read here so hold expiry is
 * evaluated against a single consistent clock rather than the application host's.
 */
async function lockSlot(tx: Prisma.TransactionClient, slotId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string; experienceId: string; guideId: string; startsAt: Date; endsAt: Date; timezone: string; capacity: number; status: TourSlotStatus; dbNow: Date }>>(Prisma.sql`
    SELECT "id", "experienceId", "guideId", "startsAt", "endsAt", "timezone", "capacity", "status", CURRENT_TIMESTAMP AS "dbNow"
    FROM "TourSlot"
    WHERE "id" = ${slotId}
    FOR UPDATE
  `);
  const slot = rows[0];
  if (!slot) throw new NotFoundError("Departure not found.");
  return slot;
}

/** Moves stale holds to EXPIRED inside the caller's transaction so they stop consuming capacity. */
async function expireStaleHolds(tx: Prisma.TransactionClient, slotId: string, now: Date): Promise<number> {
  const stale = await tx.slotReservation.findMany({
    where: { slotId, status: SlotReservationStatus.HELD, OR: [{ expiresAt: null }, { expiresAt: { lte: now } }] },
    select: { id: true, bookingId: true },
  });
  if (stale.length === 0) return 0;

  await tx.slotReservation.updateMany({
    where: { id: { in: stale.map((row) => row.id) }, status: SlotReservationStatus.HELD },
    data: { status: SlotReservationStatus.EXPIRED, releasedAt: now, updatedAt: now },
  });

  // One lifecycle event per expired hold, created atomically with the transition.
  await tx.bookingEvent.createMany({
    data: stale.map((row) => ({
      bookingId: row.bookingId,
      reservationId: row.id,
      type: BookingEventType.RESERVATION_EXPIRED,
      actorRole: UserRole.TRAVELLER,
      metadata: { reason: "HOLD_EXPIRED" },
    })),
  });
  return stale.length;
}

/** Active capacity is derived from reservation rows, never from the pre-transaction mirror. */
async function activeReservedSeats(tx: Prisma.TransactionClient, slotId: string, now: Date): Promise<number> {
  const rows = await tx.slotReservation.findMany({
    where: { slotId, status: { in: [SlotReservationStatus.HELD, SlotReservationStatus.CONFIRMED] } },
    select: { status: true, partySize: true, expiresAt: true },
  });
  return rows.filter((row) => consumesCapacity(row.status, row.expiresAt, now)).reduce((total, row) => total + row.partySize, 0);
}

/** Keeps the Phase 2A mirror columns consistent with the authoritative reservation rows. */
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

/** Replays the stored result for a repeated idempotency key without consuming capacity again. */
async function replayExistingReservation(tx: Prisma.TransactionClient, bookingId: string, now: Date): Promise<ReservationDto> {
  const reservation = await tx.slotReservation.findUniqueOrThrow({ where: { bookingId }, select: reservationSelect });
  const slot = await tx.tourSlot.findUniqueOrThrow({ where: { id: reservation.slotId }, select: { startsAt: true, endsAt: true, timezone: true, capacity: true } });
  const used = await activeReservedSeats(tx, reservation.slotId, now);
  return {
    reservationId: reservation.id,
    bookingId: reservation.bookingId,
    slotId: reservation.slotId,
    partySize: reservation.partySize,
    status: reservation.status,
    expiresAt: reservation.expiresAt,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    timezone: slot.timezone,
    remainingCapacity: Math.max(0, slot.capacity - used),
  };
}

/**
 * Places a reservation hold on a concrete departure.
 *
 * Transaction sequence: lock the TourSlot row -> reject a non-OPEN slot -> expire stale holds ->
 * replay or reject a repeated idempotency key -> recalculate active capacity -> verify the party
 * fits -> create the Booking and SlotReservation -> emit lifecycle events -> commit atomically.
 *
 * Ownership is derived from the authenticated session; the traveller is never client-supplied.
 */
export async function reserveSlot(input: unknown): Promise<ReservationDto> {
  const traveller = await requireRole("TRAVELLER");
  const parsed = assertValidReservationRequest(input);
  const requestHash = reservationRequestHash({ slotId: parsed.slotId, partySize: parsed.partySize });

  return prisma.$transaction(async (tx): Promise<ReservationDto> => {
    const slot = await lockSlot(tx, parsed.slotId);
    const now = slot.dbNow;

    if (slot.status !== TourSlotStatus.OPEN) throw new ConflictError("This departure is not open for reservations.");
    if (slot.startsAt <= now) throw new ConflictError("This departure has already started.");

    await expireStaleHolds(tx, slot.id, now);

    // Idempotency is evaluated after expiry so a replay reflects current capacity.
    const existingBooking = await tx.booking.findUnique({
      where: { travellerId_reservationIdempotencyKey: { travellerId: traveller.id, reservationIdempotencyKey: parsed.idempotencyKey } },
      select: { id: true, reservationRequestHash: true, slotReservation: { select: { id: true } } },
    });
    if (existingBooking) {
      if (existingBooking.reservationRequestHash !== requestHash) {
        throw new ConflictError("This idempotency key was already used for a different reservation request.");
      }
      if (!existingBooking.slotReservation) throw new ConflictError("A reservation for this idempotency key is still in progress.");
      return replayExistingReservation(tx, existingBooking.id, now);
    }

    const used = await activeReservedSeats(tx, slot.id, now);
    const remaining = slot.capacity - used;
    if (parsed.partySize > remaining) {
      throw new ConflictError(remaining <= 0 ? "This departure is fully booked." : `Only ${remaining} place(s) remain on this departure.`);
    }

    const experience = await tx.experience.findFirst({
      where: { id: slot.experienceId, status: ExperienceStatus.ACTIVE, destination: { status: "PUBLISHED" }, guide: { active: true, verified: true, verificationStatus: VerificationStatus.APPROVED } },
      select: { id: true, guideId: true, price: true, currency: true },
    });
    if (!experience) throw new ConflictError("This experience is not currently bookable.");
    if (experience.guideId !== slot.guideId) throw new ConflictError("The assigned guide no longer matches this departure.");

    const expiresAt = new Date(now.getTime() + RESERVATION_HOLD_MINUTES * 60_000);
    const booking = await tx.booking.create({
      data: {
        travellerId: traveller.id,
        experienceId: experience.id,
        guideId: slot.guideId,
        // `bookingDate` remains compatibility data; `startsAt`/`endsAt` are authoritative.
        bookingDate: slot.startsAt,
        startsAt: slot.startsAt,
        endsAt: slot.endsAt,
        timezone: slot.timezone,
        slotId: slot.id,
        numberOfGuests: parsed.partySize,
        travellerMessage: parsed.travellerMessage ?? null,
        totalAmount: experience.price * parsed.partySize,
        currency: experience.currency,
        status: BookingStatus.REQUESTED,
        reservationIdempotencyKey: parsed.idempotencyKey,
        reservationRequestHash: requestHash,
      },
      select: { id: true },
    });

    const reservation = await tx.slotReservation.create({
      data: { slotId: slot.id, bookingId: booking.id, partySize: parsed.partySize, status: SlotReservationStatus.HELD, expiresAt },
      select: reservationSelect,
    });

    await tx.bookingEvent.createMany({
      data: [
        { bookingId: booking.id, type: BookingEventType.BOOKING_CREATED, toStatus: BookingStatus.REQUESTED, actorId: traveller.id, actorRole: UserRole.TRAVELLER },
        { bookingId: booking.id, reservationId: reservation.id, type: BookingEventType.RESERVATION_HELD, actorId: traveller.id, actorRole: UserRole.TRAVELLER, metadata: { partySize: parsed.partySize, holdMinutes: RESERVATION_HOLD_MINUTES } },
      ],
    });

    await syncSeatMirrors(tx, slot.id, now);

    return {
      reservationId: reservation.id,
      bookingId: booking.id,
      slotId: reservation.slotId,
      partySize: reservation.partySize,
      status: reservation.status,
      expiresAt: reservation.expiresAt,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: slot.timezone,
      remainingCapacity: remaining - parsed.partySize,
    };
  });
}