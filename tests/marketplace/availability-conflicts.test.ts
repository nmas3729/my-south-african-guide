import { describe, expect, it } from "vitest";
import { isGuideOverlapConstraintViolation, throwMappedSlotGenerationError } from "../../src/server/marketplace/availability/conflicts";

describe("guide overlap conflict mapping", () => {
  it("recognizes PostgreSQL exclusion violations and hides database details", () => {
    const databaseError = { code: "23P01", constraint: "TourSlot_guide_no_overlap", message: "conflicting key value violates exclusion constraint" };
    expect(isGuideOverlapConstraintViolation(databaseError)).toBe(true);
    expect(() => throwMappedSlotGenerationError(databaseError)).toThrow("The assigned guide already has an overlapping departure.");
  });

  it("does not rewrite unrelated database failures", () => {
    const error = new Error("unrelated failure");
    expect(isGuideOverlapConstraintViolation(error)).toBe(false);
    expect(() => throwMappedSlotGenerationError(error)).toThrow(error);
  });
});