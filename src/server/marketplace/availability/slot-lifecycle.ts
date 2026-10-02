import { TourSlotStatus } from "@prisma/client";
import { prisma } from "../../db/client";
import { requireRole } from "../../auth/session";
import { ConflictError, NotFoundError } from "../shared/errors";

export type ClosedSlotDto = {
  id: string;
  experienceId: string;
  guideId: string;
  startsAt: Date;
  endsAt: Date;
  status: TourSlotStatus;
};

/**
 * Closes a future OPEN slot so it stops being offered.
 *
 * This is the only supported way to take a concrete departure out of service. There is deliberately
 * no client-supplied status, and generator-owned fields (times, guide, timezone, capacity) are never
 * written. Closure is refused once bookings reference the slot, because closing it would silently
 * invalidate an existing customer booking.
 */
export async function closeTourSlot(slotId: string, now = new Date()): Promise<ClosedSlotDto> {
  await requireRole("ADMIN");

  const result = await prisma.$transaction(async (tx) => {
    const slot = await tx.tourSlot.findUnique({
      where: { id: slotId },
      select: { id: true, experienceId: true, guideId: true, startsAt: true, endsAt: true, status: true },
    });
    if (!slot) throw new NotFoundError("Tour slot not found.");
    if (slot.status !== TourSlotStatus.OPEN) throw new ConflictError("Only an open tour slot can be closed.");
    if (slot.startsAt <= now) throw new ConflictError("A departure that has already started cannot be closed.");

    const bookingCount = await tx.booking.count({ where: { slotId: slot.id } });
    if (bookingCount > 0) throw new ConflictError("This departure has bookings and cannot be closed.");

    // Conditional update: two concurrent closures cannot both succeed.
    const closed = await tx.tourSlot.updateMany({
      where: { id: slot.id, status: TourSlotStatus.OPEN },
      data: { status: TourSlotStatus.CLOSED, updatedAt: now },
    });
    if (closed.count !== 1) throw new ConflictError("This departure can no longer be closed.");

    const refreshed = await tx.tourSlot.findUnique({
      where: { id: slot.id },
      select: { id: true, experienceId: true, guideId: true, startsAt: true, endsAt: true, status: true },
    });
    if (!refreshed) throw new NotFoundError("Tour slot not found.");
    return refreshed;
  });

  return result;
}