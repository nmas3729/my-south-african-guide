import { describe, expect, it } from "vitest";
import { hasRole } from "../../src/server/auth/authorization";

describe("role authorization", () => {
  it("keeps traveller and guide roles out of admin operations", () => {
    expect(hasRole("TRAVELLER", "ADMIN")).toBe(false);
    expect(hasRole("GUIDE", "ADMIN")).toBe(false);
    expect(hasRole("ADMIN", "ADMIN")).toBe(true);
  });
});