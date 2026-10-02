import { createHash } from "node:crypto";
import { SlotReservationStatus } from "@prisma/client";
import { ValidationError } from "../shared/errors";
import { reservationRequestSchema, type ReservationRequest } from "./schemas";

/**
 * Hold duration in minutes. This is the one authoritative hold configuration in the project and it
 * matches the `SlotReservation.expiresAt` column default added in Phase 2A
 * (`CURRENT_TIMESTAMP + '00:30:00'::interval`).
 */
export const RESERVATION_HOLD_MINUTES = 30;

export function assertValidReservationRequest(input: unknown): ReservationRequest {
  const parsed = reservationRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid reservation request.", { cause: parsed.error });
  return parsed.data;
}

/** A reservation consumes capacity only while it is an unexpired hold or a confirmed commitment. */
export function consumesCapacity(status: SlotReservationStatus, expiresAt: Date | null, now: Date): boolean {
  if (status === SlotReservationStatus.CONFIRMED) return true;
  if (status !== SlotReservationStatus.HELD) return false;
  return expiresAt === null || expiresAt > now;
}

/**
 * Stable hash of the material parts of a reservation request. Used to detect an idempotency key
 * reused for a materially different request, which must be rejected rather than replayed.
 */
export function reservationRequestHash(input: { slotId: string; partySize: number }): string {
  return createHash("sha256").update(`v1:${input.slotId}:${input.partySize}`).digest("hex");
}