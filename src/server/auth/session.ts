import "server-only";
import { cookies } from "next/headers";
import type { User, UserRole } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { signSessionToken, verifySessionToken, type SessionClaims } from "@/server/auth/session-token";

const SESSION_COOKIE = "msag_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

export type AuthenticatedUser = Pick<User, "id" | "email" | "firstName" | "lastName" | "role" | "status" | "emailVerifiedAt">;

export class AuthenticationError extends Error {
  constructor(public readonly code: "UNAUTHENTICATED" | "FORBIDDEN" | "CONFIGURATION") {
    super(code);
    this.name = "AuthenticationError";
  }
}

function getSessionSecret(): Uint8Array {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new AuthenticationError("CONFIGURATION");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(user: Pick<User, "id" | "role" | "sessionVersion">): Promise<void> {
  const token = await signSessionToken({ sub: user.id, role: user.role, sv: user.sessionVersion }, getSessionSecret(), SESSION_TTL_SECONDS);

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_TTL_SECONDS,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: new Date(0),
    path: "/",
  });
}

async function readSessionClaims(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    return await verifySessionToken(token, getSessionSecret());
  } catch {
    return null;
  }
}

const userSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  sessionVersion: true,
} as const;

export async function getCurrentUser(): Promise<AuthenticatedUser | null> {
  const claims = await readSessionClaims();
  if (!claims) return null;

  const user = await prisma.user.findUnique({ where: { id: claims.sub }, select: userSelect });
  if (!user || user.status !== "ACTIVE" || user.role !== claims.role || user.sessionVersion !== claims.sv) return null;
  return user;
}

export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError("UNAUTHENTICATED");
  return user;
}

export async function requireRole(...roles: UserRole[]): Promise<AuthenticatedUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new AuthenticationError("FORBIDDEN");
  return user;
}

export async function incrementSessionVersion(userId: string): Promise<void> {
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}

export { SESSION_COOKIE };
