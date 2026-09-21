import "server-only";
import { consumeRateLimitCore, type RateLimitEntry, type RateLimitOptions } from "@/server/auth/rate-limit-core";

const entries = new Map<string, RateLimitEntry>();

export function consumeRateLimit(key: string, options: RateLimitOptions): { allowed: boolean; retryAfterSeconds: number } {
  return consumeRateLimitCore(entries, key, options);
}

export function resetRateLimits(): void {
  entries.clear();
}

export const authRateLimits = {
  login: { limit: 5, windowMs: 15 * 60 * 1000 },
  registration: { limit: 5, windowMs: 60 * 60 * 1000 },
  passwordReset: { limit: 5, windowMs: 60 * 60 * 1000 },
  emailVerification: { limit: 10, windowMs: 60 * 60 * 1000 },
  booking: { limit: 30, windowMs: 60 * 60 * 1000 },
} satisfies Record<string, RateLimitOptions>;