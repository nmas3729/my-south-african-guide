import { NextResponse } from "next/server";
import { z } from "zod";
import { registerGuide, registerTraveller } from "@/server/auth/registration";
import { protectMutation, readJson } from "@/app/api/auth/_shared";

const requestSchema = z.object({ role: z.enum(["TRAVELLER", "GUIDE"]) }).passthrough();

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "registration");
  if (blocked) return blocked;
  try {
    const input = requestSchema.parse(await readJson(request));
    const user = input.role === "GUIDE" ? await registerGuide(input) : await registerTraveller(input);
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid registration details." }, { status: 400 });
    if (error instanceof Error && error.message.includes("already exists")) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Unable to create account." }, { status: 500 });
  }
}
