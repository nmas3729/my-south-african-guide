import { NextResponse } from "next/server";
import { z } from "zod";
import { resetPassword } from "@/server/auth/token-service";
import { travellerRegistrationSchema } from "@/server/auth/registration";
import { protectMutation, readJson } from "@/app/api/auth/_shared";

const resetInput = z.object({ token: z.string().min(1).max(512), password: travellerRegistrationSchema.shape.password });

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "passwordReset");
  if (blocked) return blocked;
  try {
    const input = resetInput.parse(await readJson(request));
    await resetPassword(input.token, input.password);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid password reset details." }, { status: 400 });
    return NextResponse.json({ error: "Invalid or expired token." }, { status: 400 });
  }
}
