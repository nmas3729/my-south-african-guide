export type RateLimitOptions = { limit: number; windowMs: number };
export type RateLimitEntry = { count: number; resetAt: number };

export function consumeRateLimitCore(entries: Map<string, RateLimitEntry>, key: string, options: RateLimitOptions, now = Date.now()): { allowed: boolean; retryAfterSeconds: number } {
  const current = entries.get(key);
  const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + options.windowMs } : current;
  entry.count += 1;
  entries.set(key, entry);
  return { allowed: entry.count <= options.limit, retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}