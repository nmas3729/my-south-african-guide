import { describe, expect, it } from "vitest";
import { hashPasswordCore, verifyPasswordCore } from "../../src/server/auth/password-core";

describe("password security", () => {
  it("hashes and verifies a valid password", async () => {
    const hash = await hashPasswordCore("Correct Horse Battery Staple");
    expect(hash).not.toContain("Correct Horse Battery Staple");
    expect(await verifyPasswordCore("Correct Horse Battery Staple", hash)).toBe(true);
  });

  it("rejects an invalid or malformed password hash", async () => {
    const hash = await hashPasswordCore("Correct Horse Battery Staple");
    expect(await verifyPasswordCore("wrong password", hash)).toBe(false);
    expect(await verifyPasswordCore("anything", "not-a-scrypt-hash")).toBe(false);
  });
});