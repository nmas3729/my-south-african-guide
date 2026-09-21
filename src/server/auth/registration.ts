import "server-only";
import { z } from "zod";
import { UserRole, VerificationStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { hashPassword, MAX_PASSWORD_BYTES, passwordByteLength } from "@/server/auth/password";
import { createSession } from "@/server/auth/session";
import { issueEmailVerification } from "@/server/auth/token-service";

const registrationFields = {
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(12).max(MAX_PASSWORD_BYTES),
};

export const travellerRegistrationSchema = z.object(registrationFields).superRefine((value, context) => {
  if (passwordByteLength(value.password) > MAX_PASSWORD_BYTES) {
    context.addIssue({ code: "custom", path: ["password"], message: "Password is too long." });
  }
});

export const guideRegistrationSchema = travellerRegistrationSchema;

export type RegistrationInput = z.infer<typeof travellerRegistrationSchema>;

function normalizeRegistration(input: unknown): RegistrationInput {
  return travellerRegistrationSchema.parse(input);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function registerTraveller(input: unknown) {
  const data = normalizeRegistration(input);
  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        passwordHash,
        role: UserRole.TRAVELLER,
        travellerProfile: { create: {} },
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, sessionVersion: true },
    });
    await issueEmailVerification(user.id, user.email);
    await createSession(user);
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role };
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("An account with this email already exists.");
    throw error;
  }
}

export async function registerGuide(input: unknown) {
  const data = normalizeRegistration(input);
  const passwordHash = await hashPassword(data.password);

  try {
    const user = await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        passwordHash,
        role: UserRole.GUIDE,
        guideProfile: {
          create: {
            displayName: `${data.firstName} ${data.lastName}`,
            slug: `${data.firstName}-${data.lastName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `${data.email.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-guide`,
            verificationStatus: VerificationStatus.PENDING,
            verified: false,
            active: true,
          },
        },
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, sessionVersion: true },
    });
    await issueEmailVerification(user.id, user.email);
    await createSession(user);
    return { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role };
  } catch (error) {
    if (isUniqueConstraintError(error)) throw new Error("An account with this email already exists.");
    throw error;
  }
}
