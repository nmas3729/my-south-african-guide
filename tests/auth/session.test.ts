import { describe, expect, it } from "vitest";
import { signSessionToken, verifySessionToken } from "../../src/server/auth/session-token";

const secret = new TextEncoder().encode("test-session-secret-that-is-long-enough");
const claims = { sub: "user_123", role: "TRAVELLER" as const, sv: 0 };

describe("signed sessions", () => {
  it("accepts valid claims and rejects tampering", async () => {
    const token = await signSessionToken(claims, secret, 60);
    expect(await verifySessionToken(token, secret)).toEqual(claims);
    expect(await verifySessionToken(`${token}tampered`, secret)).toBeNull();
  });

  it("rejects expired sessions", async () => {
    const token = await signSessionToken(claims, secret, -1);
    expect(await verifySessionToken(token, secret)).toBeNull();
  });

  it("carries the session revision used for invalidation", async () => {
    const token = await signSessionToken({ ...claims, sv: 4 }, secret, 60);
    expect((await verifySessionToken(token, secret))?.sv).toBe(4);
  });
});