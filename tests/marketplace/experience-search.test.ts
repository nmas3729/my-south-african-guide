import { describe, expect, it } from "vitest";
import {
  buildExperienceSearchQuery,
  formatSearchDate,
  getDestinationOptions,
  getExperienceCategoryOptions,
  isValidIsoDate,
  parseExperienceSearchParams,
  resolveDestinationProvince,
  resolveExperienceCategory,
  searchExperiences,
} from "../../src/lib/marketplace";

const PROVINCE_SLUGS = [
  "eastern-cape",
  "free-state",
  "gauteng",
  "kwazulu-natal",
  "limpopo",
  "mpumalanga",
  "north-west",
  "northern-cape",
  "western-cape",
];

describe("hero experience search", () => {
  it("offers all nine provinces from the canonical destination data", () => {
    const slugs = getDestinationOptions().map((option) => option.slug);
    expect(slugs).toHaveLength(9);
    for (const slug of PROVINCE_SLUGS) expect(slugs).toContain(slug);
  });

  it("derives experience categories from the existing dataset only", () => {
    const names = getExperienceCategoryOptions().map((option) => option.name).sort();
    expect(names).toEqual([...new Set(searchExperiences().map((experience) => experience.category))].sort());
    expect(names).toEqual(["Food & wine", "Nature & wildlife"]);
    expect(getExperienceCategoryOptions().find((option) => option.name === "Food & wine")?.slug).toBe("food-wine");
  });

  it("resolves destination slugs and province names to the filter value", () => {
    expect(resolveDestinationProvince("western-cape")).toBe("Western Cape");
    expect(resolveDestinationProvince("Western Cape")).toBe("Western Cape");
    expect(resolveDestinationProvince("north-west")).toBe("North West");
    expect(resolveDestinationProvince("not-real")).toBe("");
    expect(resolveDestinationProvince("")).toBe("");
  });

  it("resolves category slugs and names to the filter value", () => {
    expect(resolveExperienceCategory("food-wine")).toBe("Food & wine");
    expect(resolveExperienceCategory("Food & wine")).toBe("Food & wine");
    expect(resolveExperienceCategory("nature-wildlife")).toBe("Nature & wildlife");
    expect(resolveExperienceCategory("unknown")).toBe("");
  });

  it("validates ISO dates strictly", () => {
    expect(isValidIsoDate("2026-11-15")).toBe(true);
    expect(isValidIsoDate("2026-02-30")).toBe(false);
    expect(isValidIsoDate("2026-2-3")).toBe(false);
    expect(isValidIsoDate("15/11/2026")).toBe(false);
    expect(isValidIsoDate("")).toBe(false);
    expect(isValidIsoDate(null)).toBe(false);
  });

  it("parses and sanitises search params", () => {
    const state = parseExperienceSearchParams({ destination: "western-cape", category: "food-wine", date: "2026-11-15" });
    expect(state).toEqual({ query: "", destination: "western-cape", category: "food-wine", duration: "", experienceType: "", maxPrice: "", date: "2026-11-15" });
  });

  it("fails safe on invalid params instead of throwing", () => {
    const state = parseExperienceSearchParams({ destination: "atlantis", category: "space-travel", date: "not-a-date", duration: "999", maxPrice: "free" });
    expect(state).toEqual({ query: "", destination: "", category: "", duration: "", experienceType: "", maxPrice: "", date: "" });
  });

  it("builds a stable query string, omitting empty values", () => {
    expect(buildExperienceSearchQuery({ destination: "western-cape", category: "food-wine", date: "2026-11-15" })).toBe("destination=western-cape&category=food-wine&date=2026-11-15");
    expect(buildExperienceSearchQuery({ destination: "", category: "", date: "" })).toBe("");
  });

  it("round-trips a search URL through parse (refresh safety)", () => {
    const query = buildExperienceSearchQuery({ destination: "western-cape", category: "food-wine", date: "2026-11-15" });
    const state = parseExperienceSearchParams(new URLSearchParams(query));
    expect(state.destination).toBe("western-cape");
    expect(state.category).toBe("food-wine");
    expect(state.date).toBe("2026-11-15");
  });

  it("filters the real dataset using the parsed values", () => {
    const state = parseExperienceSearchParams({ destination: "western-cape", category: "food-wine" });
    const results = searchExperiences({ destination: resolveDestinationProvince(state.destination), category: resolveExperienceCategory(state.category) });
    expect(results.map((item) => item.slug)).toEqual(["winelands-slowly"]);

    const safari = searchExperiences({ destination: resolveDestinationProvince(parseExperienceSearchParams({ destination: "mpumalanga" }).destination) });
    expect(safari.map((item) => item.slug)).toEqual(["kruger-day-safari"]);
  });

  it("formats a search date for display", () => {
    expect(formatSearchDate("2026-11-15")).toContain("November 2026");
    expect(formatSearchDate("bad")).toBe("");
  });
});