import { failure, success } from "@/app/api/marketplace/_shared";
import { getMyReservationStatus } from "@/server/marketplace/availability/reservation-lifecycle";

type Context = { params: Promise<{ id: string }> };

/** Read-only status for the owning traveller. Exposes no lifecycle capability. */
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return success(await getMyReservationStatus(id));
  } catch (error) {
    return failure(error);
  }
}