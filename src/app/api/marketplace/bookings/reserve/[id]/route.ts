import { protectMutation } from "@/app/api/auth/_shared";
import { failure, success } from "@/app/api/marketplace/_shared";
import { releaseMyReservation } from "@/server/marketplace/availability/reservation-lifecycle";

type Context = { params: Promise<{ id: string }> };

/**
 * Releases the authenticated traveller's own hold. No body is accepted, so capacity, status and
 * ownership are never client-controllable. This endpoint cannot confirm a reservation.
 */
export async function DELETE(request: Request, context: Context) {
  const blocked = await protectMutation(request, "reservation");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    return success(await releaseMyReservation(id));
  } catch (error) {
    return failure(error);
  }
}