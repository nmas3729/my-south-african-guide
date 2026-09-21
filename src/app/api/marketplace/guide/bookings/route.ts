import { listIncomingBookingRequests } from "@/server/marketplace/bookings/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try {
    return success(await listIncomingBookingRequests());
  } catch (error) {
    return failure(error);
  }
}
