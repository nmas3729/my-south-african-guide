import "server-only";
import { z } from "zod";
import { prisma } from "@/server/db/client";
import { createSession } from "@/server/auth/session";
import { verifyPassword } from "@/server/auth/password";

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(320),
  password: z.string().min(1),
});

const loginUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  role: true,
  status: true,
  passwordHash: true,
  sessionVersion: true,
} as const;

export type LoginInput = z.infer<typeof loginSchema>;

export async function authenticateUser(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await prisma.user.findUnique({ where: { email: data.email }, select: loginUserSelect });

  if (!user || user.status !== "ACTIVE" || !user.passwordHash || !(await verifyPassword(data.password, user.passwordHash))) {
    throw new Error("Invalid email or password.");
  }

  await createSession(user);
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    status: user.status,
  };
}
