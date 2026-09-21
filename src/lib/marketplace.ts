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
