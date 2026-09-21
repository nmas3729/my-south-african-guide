import { getBookingById } from "@/server/marketplace/bookings/service";
import { failure, success } from "@/app/api/marketplace/_shared";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return success(await getBookingById(id));
  } catch (error) {
    return failure(error);
  }
}
