import { destinations, experiences, guides, reviews, wildlifeMoments, type Destination, type Experience, type Guide, type Review, type WildlifeMoment } from "@/data/site";

export type MarketplaceKind = "guides" | "experiences" | "destinations";
export { destinations, experiences, guides, reviews, wildlifeMoments };
export type { Destination, Experience, Guide, Review, WildlifeMoment };

export type GuideFilters = { query?: string; province?: string; language?: string; speciality?: string; verified?: boolean };
export type ExperienceFilters = { query?: string; destination?: string; category?: string; duration?: string; maxPrice?: number; experienceType?: string };

export function getGuides() { return guides; }
export function getGuideBySlug(slug: string) { return guides.find((item) => item.slug === slug); }
export function getExperiences() { return experiences; }
export function getExperienceBySlug(slug: string) { return experiences.find((item) => item.slug === slug); }
export function getDestinations() { return destinations; }
export function getDestinationBySlug(slug: string) { return destinations.find((item) => item.slug === slug); }
export function getFeaturedExperiences(): Experience[] { return experiences.filter((item) => item.status === "published").slice(0, 2); }
export function getExperiencesForGuide(guideSlug: string): Experience[] { return experiences.filter((experience) => experience.guideSlug === guideSlug); }

export function getReviewsForGuide(guideSlug: string): Review[] { return reviews.filter((review) => review.guideSlug === guideSlug); }
export function getReviewsForExperience(experienceSlug: string): Review[] { return reviews.filter((review) => review.experienceSlug === experienceSlug); }

export function getGuideFilterOptions() {
  return {
    provinces: [...new Set(guides.map((guide) => guide.province))].sort(),
    languages: [...new Set(guides.flatMap((guide) => guide.languages))].sort(),
    specialities: [...new Set(guides.flatMap((guide) => guide.specialities))].sort(),
  };
}

export function getExperienceFilterOptions() {
  return {
    destinations: [...new Set(experiences.map((experience) => experience.province))].sort(),
    categories: [...new Set(experiences.map((experience) => experience.category))].sort(),
    durations: [...new Set(experiences.map((experience) => experience.duration))].sort((a, b) => Number.parseInt(a) - Number.parseInt(b)),
    experienceTypes: [...new Set(experiences.flatMap((experience) => experience.experienceType ? [experience.experienceType] : []))].sort(),
  };
}

// --- Discovery / hero search helpers ---------------------------------------------------------
// These derive their options from the existing canonical data (destinations + experiences) so the
// search never introduces a second taxonomy or a fabricated category/destination list.

export type DestinationOption = { slug: string; name: string; province: string };
export type ExperienceCategoryOption = { slug: string; name: string };

/** Normalised, validated search/filter state shared by the hero search and the /experiences page. */
export type ExperienceSearchState = {
  query: string;
  destination: string;
  category: string;
  duration: string;
  experienceType: string;
  maxPrice: string;
  date: string;
};

export type ExperienceSearchInput = URLSearchParams | Record<string, string | string[] | undefined> | null | undefined;

export function slugify(value: string): string {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Where-selector options: the existing destination records (all provinces). */
export function getDestinationOptions(): DestinationOption[] {
  return destinations.map((destination) => ({ slug: destination.slug, name: destination.name, province: destination.province }));
}

/** Experience-selector options: only categories that already exist in the experience dataset. */
export function getExperienceCategoryOptions(): ExperienceCategoryOption[] {
  return [...new Set(experiences.map((experience) => experience.category))].sort().map((name) => ({ slug: slugify(name), name }));
}

/** Resolve any destination reference (slug, name or province) to its canonical option. */
export function getDestinationOption(value: string | null | undefined): DestinationOption | undefined {
  const needle = value?.trim();
  if (!needle) return undefined;
  const lower = needle.toLowerCase();
  const options = getDestinationOptions();
  return (
    options.find((option) => option.slug.toLowerCase() === lower) ??
    options.find((option) => slugify(option.name) === slugify(needle)) ??
    options.find((option) => slugify(option.province) === slugify(needle)) ??
    options.find((option) => option.province.toLowerCase() === lower)
  );
}

/** Resolve a destination slug/name to the province value the experience filter expects. */
export function resolveDestinationProvince(value: string | null | undefined): string {
  return getDestinationOption(value)?.province ?? "";
}

/** Resolve a category slug/name to the exact category value the experience filter expects. */
export function resolveExperienceCategory(value: string | null | undefined): string {
  const needle = value?.trim();
  if (!needle) return "";
  const lower = needle.toLowerCase();
  const options = getExperienceCategoryOptions();
  return (options.find((option) => option.slug === lower) ?? options.find((option) => option.name.toLowerCase() === lower))?.name ?? "";
}

/** Strict YYYY-MM-DD validation that rejects impossible calendar dates. */
export function isValidIsoDate(value: string | null | undefined): boolean {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  return date.toISOString().slice(0, 10) === value;
}

function toSearchRecord(input: ExperienceSearchInput): Record<string, string> {
  const record: Record<string, string> = {};
  if (!input) return record;
  if (typeof (input as URLSearchParams).get === "function" && typeof (input as URLSearchParams).forEach === "function") {
    (input as URLSearchParams).forEach((value, key) => {
      record[key] = value;
    });
    return record;
  }
  for (const [key, value] of Object.entries(input as Record<string, string | string[] | undefined>)) {
    const single = Array.isArray(value) ? value[0] : value;
    if (typeof single === "string") record[key] = single;
  }
  return record;
}

/**
 * Parse (and sanitise) search params into validated state. Unknown/invalid values degrade to an
 * empty string instead of throwing, so directly opening or refreshing a malformed URL is safe.
 */
export function parseExperienceSearchParams(input: ExperienceSearchInput): ExperienceSearchState {
  const record = toSearchRecord(input);
  const options = getExperienceFilterOptions();
  const rawDuration = record.duration ?? "";
  const rawExperienceType = record.experienceType ?? "";
  const rawMaxPrice = record.maxPrice ?? "";
  const rawCategorySlug = slugify(record.category ?? "");
  return {
    query: (record.query ?? "").trim(),
    destination: getDestinationOption(record.destination)?.slug ?? "",
    category: getExperienceCategoryOptions().find((option) => option.slug === rawCategorySlug)?.slug ?? "",
    duration: options.durations.includes(rawDuration) ? rawDuration : "",
    experienceType: options.experienceTypes.includes(rawExperienceType) ? rawExperienceType : "",
    maxPrice: /^\d+$/.test(rawMaxPrice) ? rawMaxPrice : "",
    date: isValidIsoDate(record.date) ? (record.date as string) : "",
  };
}

/** Build a stable, shareable query string, omitting empty values. */
export function buildExperienceSearchQuery(state: Partial<ExperienceSearchState>): string {
  const params = new URLSearchParams();
  if (state.query) params.set("query", state.query);
  if (state.destination) params.set("destination", state.destination);
  if (state.category) params.set("category", state.category);
  if (state.duration) params.set("duration", state.duration);
  if (state.experienceType) params.set("experienceType", state.experienceType);
  if (state.maxPrice) params.set("maxPrice", state.maxPrice);
  if (state.date) params.set("date", state.date);
  return params.toString();
}

/** Human-readable form of a validated search date (e.g. "15 November 2026"). */
export function formatSearchDate(value: string): string {
  if (!isValidIsoDate(value)) return "";
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00.000Z`));
}

export function formatExperiencePrice(experience: Experience): string {
  return `From ${new Intl.NumberFormat("en-ZA", { style: "currency", currency: experience.currency, maximumFractionDigits: 0 }).format(experience.price)}`;
}

export function searchGuides(filters: GuideFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return guides.filter((guide) => {
    const matchesQuery = !query || [guide.name, guide.location, guide.province, ...guide.specialities, ...guide.languages].join(" ").toLowerCase().includes(query);
    return matchesQuery && (!filters.province || guide.province === filters.province) && (!filters.language || guide.languages.includes(filters.language)) && (!filters.speciality || guide.specialities.includes(filters.speciality)) && (filters.verified === undefined || guide.verified === filters.verified);
  });
}

export function searchExperiences(filters: ExperienceFilters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return experiences.filter((experience) => {
    const matchesQuery = !query || [experience.title, experience.location, experience.province, experience.description, experience.category, experience.experienceType ?? "", ...experience.highlights].join(" ").toLowerCase().includes(query);
    return matchesQuery && (!filters.destination || experience.province === filters.destination) && (!filters.category || experience.category === filters.category) && (!filters.duration || experience.duration === filters.duration) && (!filters.maxPrice || experience.price <= filters.maxPrice) && (!filters.experienceType || experience.experienceType === filters.experienceType);
  });
}

export const whatsappNumber = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? "";
export const contactEmail = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "";
export function getWhatsAppHref(message: string) { return whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}?text=${encodeURIComponent(message)}` : null; }

export const getExperience = getExperienceBySlug;
export const getGuide = getGuideBySlug;
export const getDestination = getDestinationBySlug;
export function getMarketplaceItems(kind: MarketplaceKind) {
  return kind === "guides" ? guides : kind === "experiences" ? experiences : destinations;
}
