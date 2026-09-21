import { jwtVerify, SignJWT } from "jose";
import type { UserRole } from "@prisma/client";

export type SessionClaims = { sub: string; role: UserRole; sv: number };

function isUserRole(value: unknown): value is UserRole {
  return value === "TRAVELLER" || value === "GUIDE" || value === "ADMIN";
}

export async function signSessionToken(claims: SessionClaims, secret: Uint8Array, ttlSeconds: number, now = Date.now()): Promise<string> {
  return new SignJWT({ role: claims.role, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer("my-south-african-guide")
    .setAudience("web")
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor(now / 1000) + ttlSeconds)
    .sign(secret);
}

export async function verifySessionToken(token: string, secret: Uint8Array): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret, { issuer: "my-south-african-guide", audience: "web" });
    if (typeof payload.sub !== "string" || !isUserRole(payload.role) || typeof payload.sv !== "number") return null;
    return { sub: payload.sub, role: payload.role, sv: payload.sv };
  } catch {
    return null;
  }
}