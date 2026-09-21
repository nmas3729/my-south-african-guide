import "server-only";
import { cookies, headers } from "next/headers";
import { randomBytes, timingSafeEqual } from "node:crypto";

const CSRF_COOKIE = "msag_csrf";
const CSRF_HEADER = "x-csrf-token";

export async function issueCsrfToken(): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  (await cookies()).set(CSRF_COOKIE, token, {
    httpOnly: false,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
  });
  return token;
}

export async function assertCsrfToken(): Promise<void> {
  const cookieToken = (await cookies()).get(CSRF_COOKIE)?.value;
  const headerToken = (await headers()).get(CSRF_HEADER);
  if (!cookieToken || !headerToken) throw new Error("Invalid CSRF token.");
  const expected = Buffer.from(cookieToken);
  const supplied = Buffer.from(headerToken);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error("Invalid CSRF token.");
}

export { CSRF_COOKIE, CSRF_HEADER };