import { readJson, protectMutation } from "@/app/api/auth/_shared";
import { NextResponse } from "next/server";
import { failure, success } from "@/app/api/marketplace/_shared";
import { createMyScheduleRule, listMyScheduleRules } from "@/server/marketplace/availability/guide-availability";

export async function GET() {
  try {
    return success(await listMyScheduleRules());
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    return NextResponse.json({ data: await createMyScheduleRule(await readJson(request)) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}