import { describe, expect, it } from "vitest";
import { mapPublicExperience } from "../../src/server/marketplace/experiences/dto";

describe("marketplace DTOs", () => {
  it("maps public experience data without private guide fields", () => {
    const dto = mapPublicExperience({
      id: "e1", title: "Experience", slug: "experience", summary: null, description: "Description", category: null, duration: 60, location: null, meetingPoint: null, groupLimit: null, price: 100, currency: "ZAR", status: "ACTIVE", publishedAt: null, images: [], destination: { id: "d1", name: "Destination", province: "Province", slug: "destination" }, guide: { id: "g1", slug: "guide", displayName: "Guide", location: "Cape Town", profileImage: null, rating: 4.5, verified: true },
    });
    expect(dto.guide).not.toHaveProperty("verificationStatus");
    expect(dto.guide).not.toHaveProperty("storageReference");
    expect(dto.guide.displayName).toBe("Guide");
  });
});