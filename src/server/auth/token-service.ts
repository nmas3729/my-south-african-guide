import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { createOpaqueToken, hashOpaqueToken } from "@/server/auth/token-core";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/server/email/service";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

function invalidTokenError(): Error {
  return new Error("Invalid or expired token.");
}

export async function issueEmailVerification(userId: string, email: string): Promise<void> {
  const rawToken = createOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS) },
  });
  await sendVerificationEmail({ email, token: rawToken });
}

export async function verifyEmailToken(rawToken: string): Promise<void> {
  const token = await prisma.emailVerificationToken.findUnique({ where: { tokenHash: hashOpaqueToken(rawToken) } });
  if (!token || token.consumedAt || token.expiresAt <= new Date()) throw invalidTokenError();

  const consumedAt = new Date();
  const consumed = await prisma.emailVerificationToken.updateMany({
    where: { id: token.id, consumedAt: null, expiresAt: { gt: consumedAt } },
    data: { consumedAt },
  });
  if (consumed.count !== 1) throw invalidTokenError();
  await prisma.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: consumedAt } });
}

export async function requestPasswordReset(email: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, status: true } });
  if (!user || user.status !== "ACTIVE") return;

  const rawToken = createOpaqueToken();
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hashOpaqueToken(rawToken), expiresAt: new Date(Date.now() + RESET_TTL_MS) },
  });
  await sendPasswordResetEmail({ email: user.email, token: rawToken });
}

export async function resetPassword(rawToken: string, password: string): Promise<void> {
  const token = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashOpaqueToken(rawToken) } });
  if (!token || token.consumedAt || token.expiresAt <= new Date()) throw invalidTokenError();

  const consumedAt = new Date();
  const passwordHash = await hashPassword(password);
  const result = await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
    const consumed = await transaction.passwordResetToken.updateMany({
      where: { id: token.id, consumedAt: null, expiresAt: { gt: consumedAt } },
      data: { consumedAt },
    });
    if (consumed.count !== 1) return false;
    await transaction.user.update({ where: { id: token.userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    return true;
  });
  if (!result) throw invalidTokenError();
}