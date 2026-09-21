import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrfToken } from "@/server/auth/csrf";
import { authRateLimits, consumeRateLimit } from "@/server/auth/rate-limit";

export function clientKey(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
}

export async function protectMutation(request: Request, operation: keyof typeof authRateLimits, identity = ""): Promise<NextResponse | null> {
  try {
    await assertCsrfToken();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 403 });
  }

  const result = consumeRateLimit(`${operation}:${clientKey(request)}:${identity}`, authRateLimits[operation]);
  if (!result.allowed) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } });
  return null;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([{ code: "custom", path: [], message: "Invalid JSON." }]);
  }
}

export function invalidInput(): NextResponse {
  return NextResponse.json({ error: "Invalid request." }, { status: 400 });
}
