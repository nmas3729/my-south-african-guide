import { describe, expect, it } from "vitest";
import { createOpaqueToken, hashOpaqueToken } from "../../src/server/auth/token-core";

describe("opaque auth tokens", () => {
  it("generates random tokens and one-way hashes", () => {
    const first = createOpaqueToken();
    const second = createOpaqueToken();
    expect(first).not.toBe(second);
    expect(hashOpaqueToken(first)).not.toContain(first);
    expect(hashOpaqueToken(first)).toBe(hashOpaqueToken(first));
  });
});