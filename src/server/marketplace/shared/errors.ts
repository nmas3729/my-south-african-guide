import { Prisma } from "@prisma/client";
import { ZodError } from "zod";

function isAuthenticationError(value: unknown): value is { code: "UNAUTHENTICATED" | "FORBIDDEN" | "CONFIGURATION" } {
  return typeof value === "object" && value !== null && "code" in value && (value.code === "UNAUTHENTICATED" || value.code === "FORBIDDEN" || value.code === "CONFIGURATION");
}

export type DomainErrorCode = "VALIDATION" | "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "INTERNAL";

export class DomainError extends Error {
  constructor(public readonly code: DomainErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "DomainError";
  }
}

export class ValidationError extends DomainError {
  constructor(message = "Invalid request.", options?: { cause?: unknown }) { super("VALIDATION", message, options); }
}

export class AuthorizationError extends DomainError {
  constructor(message = "You are not allowed to perform this action.", options?: { cause?: unknown }) { super("FORBIDDEN", message, options); }
}

export class NotFoundError extends DomainError {
  constructor(message = "Resource not found.", options?: { cause?: unknown }) { super("NOT_FOUND", message, options); }
}

export class ConflictError extends DomainError {
  constructor(message = "The requested resource conflicts with existing data.", options?: { cause?: unknown }) { super("CONFLICT", message, options); }
}

export function mapDomainError(error: unknown): { status: number; body: { error: { code: DomainErrorCode; message: string } } } {
  if (isAuthenticationError(error)) {
    const code = error.code === "FORBIDDEN" ? "FORBIDDEN" : "UNAUTHENTICATED";
    return { status: code === "FORBIDDEN" ? 403 : 401, body: { error: { code, message: code === "FORBIDDEN" ? "You are not allowed to perform this action." : "Authentication required." } } };
  }
  if (error instanceof ZodError) return { status: 400, body: { error: { code: "VALIDATION", message: "Invalid request." } } };
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case "P2002":
        return { status: 409, body: { error: { code: "CONFLICT", message: "The requested resource already exists." } } };
      case "P2003":
        return { status: 409, body: { error: { code: "CONFLICT", message: "The requested operation violates a database constraint." } } };
      case "P2025":
        return { status: 404, body: { error: { code: "NOT_FOUND", message: "Resource not found." } } };
      default:
        return { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong." } } };
    }
  }
  if (error instanceof DomainError) {
    const status = error.code === "VALIDATION" ? 400 : error.code === "UNAUTHENTICATED" ? 401 : error.code === "FORBIDDEN" ? 403 : error.code === "NOT_FOUND" ? 404 : error.code === "CONFLICT" ? 409 : 500;
    return { status, body: { error: { code: error.code, message: error.message } } };
  }
  return { status: 500, body: { error: { code: "INTERNAL", message: "Something went wrong." } } };
}
