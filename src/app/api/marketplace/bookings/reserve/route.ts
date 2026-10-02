import { NextResponse } from "next/server";
import { protectMutation, readJson } from "@/app/api/auth/_shared";
import { failure } from "@/app/api/marketplace/_shared";
import { reserveSlot } from "@/server/marketplace/availability/reservation-service";

/**
 * Places a hold on a concrete departure for the authenticated traveller. The traveller identity is
 * never accepted from the request, and an `idempotencyKey` is required so a retry is safe.
 */
export async function POST(request: Request) {
  const blocked = await protectMutation(request, "reservation");
  if (blocked) return blocked;

  try {
    return NextResponse.json({ data: await reserveSlot(await readJson(request)) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}