import { protectMutation } from "@/app/api/auth/_shared";
import { confirmBooking } from "@/server/marketplace/bookings/service";
import { failure, success } from "@/app/api/marketplace/_shared";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: Context) {
  const blocked = await protectMutation(request, "booking");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    return success(await confirmBooking(id));
  } catch (error) {
    return failure(error);
  }
}
