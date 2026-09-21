import { describe, expect, it } from "vitest";
import { consumeRateLimitCore } from "../../src/server/auth/rate-limit-core";

describe("rate limiting", () => {
  it("limits repeated attempts and resets after the window", () => {
    const entries = new Map();
    const options = { limit: 2, windowMs: 1000 };
    expect(consumeRateLimitCore(entries, "login:ip", options, 0).allowed).toBe(true);
    expect(consumeRateLimitCore(entries, "login:ip", options, 1).allowed).toBe(true);
    expect(consumeRateLimitCore(entries, "login:ip", options, 2).allowed).toBe(false);
    expect(consumeRateLimitCore(entries, "login:ip", options, 1001).allowed).toBe(true);
  });
});