import { describe, expect, it } from "vitest";
import { bookingRequestSchema, destinationInputSchema, experienceInputSchema } from "../../src/server/marketplace/shared/schemas";

describe("marketplace validation", () => {
  it("accepts valid destination and experience inputs", () => {
    expect(destinationInputSchema.parse({ slug: "cape-town", name: "Cape Town", province: "Western Cape" }).slug).toBe("cape-town");
    expect(experienceInputSchema.parse({ title: "Walk", slug: "walk", description: "A walk", duration: 120, destinationId: "d1", guideId: "g1" }).duration).toBe(120);
  });

  it("rejects invalid booking requests", () => {
    expect(bookingRequestSchema.safeParse({ experienceId: "e1", bookingDate: "not-a-date", numberOfGuests: 0 }).success).toBe(false);
  });
});