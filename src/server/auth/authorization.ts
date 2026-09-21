import type { UserRole } from "@prisma/client";

export function hasRole(role: UserRole, ...allowedRoles: UserRole[]): boolean {
  return allowedRoles.includes(role);
}