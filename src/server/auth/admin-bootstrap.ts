import "server-only";
import { timingSafeEqual } from "node:crypto";
import { UserRole } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { hashPassword } from "@/server/auth/password";
import { travellerRegistrationSchema } from "@/server/auth/registration";

export async function createAdminUser(input: unknown, bootstrapSecret: string) {
  const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
  if (!configuredSecret || !bootstrapSecret) throw new Error("Admin bootstrap is not configured.");
  const configured = Buffer.from(configuredSecret);
  const supplied = Buffer.from(bootstrapSecret);
  if (configured.length !== supplied.length || !timingSafeEqual(configured, supplied)) throw new Error("Invalid admin bootstrap secret.");

  const data = travellerRegistrationSchema.parse(input);
  try {
    return await prisma.user.create({
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        name: `${data.firstName} ${data.lastName}`,
        email: data.email,
        passwordHash: await hashPassword(data.password),
        role: UserRole.ADMIN,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true },
    });
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") throw new Error("An account with this email already exists.");
    throw error;
  }
}