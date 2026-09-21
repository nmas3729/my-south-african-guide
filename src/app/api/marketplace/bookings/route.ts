import { NextResponse } from "next/server";
import { protectMutation, readJson } from "@/app/api/auth/_shared";
import { createBookingRequest, listMyBookings } from "@/server/marketplace/bookings/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try {
    return success(await listMyBookings());
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "booking");
  if (blocked) return blocked;

  try {
    const input = await readJson(request);
    const booking = await createBookingRequest(input);
    return NextResponse.json({ data: booking }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
