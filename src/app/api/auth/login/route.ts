import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateUser } from "@/server/auth/credentials";
import { protectMutation, readJson } from "@/app/api/auth/_shared";

const loginInput = z.object({ email: z.string().trim().toLowerCase().email().max(320), password: z.string().min(1) });

export async function POST(request: Request) {
  let input: z.infer<typeof loginInput>;
  try {
    input = loginInput.parse(await readJson(request));
  } catch {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 400 });
  }
  const blocked = await protectMutation(request, "login", input.email);
  if (blocked) return blocked;
  try {
    const user = await authenticateUser(input);
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
}
