import { BookingStatus } from "@prisma/client";
import { ConflictError } from "../shared/errors";

const transitions: Record<BookingStatus, readonly BookingStatus[]> = {
  REQUESTED: [BookingStatus.ACCEPTED, BookingStatus.DECLINED, BookingStatus.CANCELLED],
  // ACCEPTED -> CONFIRMED is deliberately absent. A booking may only become CONFIRMED once payment has
  // been successfully processed and server-side verified at 100%. No traveller, guide or admin
  // operation may create that transition; the payment phase will reintroduce it behind a verified
  // payment precondition. See docs/booking-lifecycle.md.
  ACCEPTED: [BookingStatus.CANCELLED],
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
