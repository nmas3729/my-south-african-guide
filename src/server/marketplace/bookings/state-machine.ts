import { BookingStatus } from "@prisma/client";
import { ConflictError } from "../shared/errors";

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: [BookingStatus.ACCEPTED, BookingStatus.DECLINED, BookingStatus.CANCELLED],
  ACCEPTED: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED],
  CONFIRMED: [BookingStatus.COMPLETED, BookingStatus.CANCELLED],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  PAID: [],
  REFUNDED: [],
  DISPUTED: [],
};

export function canTransitionBooking(from: BookingStatus, to: BookingStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function assertBookingTransition(from: BookingStatus, to: BookingStatus): void {
  if (!canTransitionBooking(from, to)) throw new ConflictError(`Cannot change booking from ${from} to ${to}.`);
}
