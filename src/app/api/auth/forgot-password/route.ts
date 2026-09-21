import { NextResponse } from "next/server";
import { z } from "zod";
import { requestPasswordReset } from "@/server/auth/token-service";
import { protectMutation, readJson } from "@/app/api/auth/_shared";

const emailInput = z.object({ email: z.string().trim().toLowerCase().email().max(320) });
const genericResponse = { message: "If an account exists, password reset instructions will be sent." };

export async function POST(request: Request) {
  let input: z.infer<typeof emailInput>;
  try {
    input = emailInput.parse(await readJson(request));
  } catch {
    return NextResponse.json(genericResponse);
  }
  const blocked = await protectMutation(request, "passwordReset", input.email);
  if (blocked) return blocked;
  try {
    await requestPasswordReset(input.email);
  } catch {
    // Keep account existence and provider failures out of the public response.
  }
  return NextResponse.json(genericResponse);
}
