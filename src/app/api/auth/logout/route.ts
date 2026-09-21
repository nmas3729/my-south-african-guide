import { NextResponse } from "next/server";
import { destroySession } from "@/server/auth/session";
import { protectMutation } from "@/app/api/auth/_shared";

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "login");
  if (blocked) return blocked;
  await destroySession();
  return NextResponse.json({ ok: true });
}
