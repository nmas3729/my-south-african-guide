import { readJson, protectMutation } from "@/app/api/auth/_shared";
import { NextResponse } from "next/server";
import { failure, success } from "@/app/api/marketplace/_shared";
import { createMyUnavailability, listMyUnavailability } from "@/server/marketplace/availability/guide-availability";

export async function GET() {
  try {
    return success(await listMyUnavailability());
  } catch (error) {
    return failure(error);
  }
}

/** Creating a window also closes the affected future departures in the same transaction. */
export async function POST(request: Request) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    return NextResponse.json({ data: await createMyUnavailability(await readJson(request)) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}