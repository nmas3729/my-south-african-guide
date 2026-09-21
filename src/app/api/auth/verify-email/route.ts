import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyEmailToken } from "@/server/auth/token-service";
import { protectMutation, readJson } from "@/app/api/auth/_shared";

const tokenInput = z.object({ token: z.string().min(1).max(512) });

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "emailVerification");
  if (blocked) return blocked;
  try {
    const { token } = tokenInput.parse(await readJson(request));
    await verifyEmailToken(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
  }
}
