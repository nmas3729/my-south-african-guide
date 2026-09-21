export type MarketplaceContentMode = "demo";
export const marketplaceContentMode: MarketplaceContentMode = "demo";

export interface Guide {
  id: string;
  slug: string;
  name: string;
  profileImage: string;
  verified: boolean;
  rating: number;
  reviewCount: number;
  location: string;
  province: string;
  languages: string[];
  specialities: string[];
  biography: string;
  qualifications: string[];
  yearsExperience: number;
  responseTime: string;
  experienceCount: number;
}

export type ExperienceStatus = "draft" | "published" | "archived";
export type ExperienceDifficulty = "easy" | "moderate" | "challenging";

export interface Experience {
  id: string;
  slug: string;
  title: string;
  image: string;
  gallery: string[];
  category: string;
  experienceType?: string;
  location: string;
  province: string;
  duration: string;
  price: number;
  currency: "ZAR";
  rating: number;
  reviewCount: number;
  guideSlug?: string;
  description: string;
  highlights: string[];
  meetingPoint: string;
  groupSize: string;
  languages: string[];
  included: string[];
  excluded: string[];
  difficulty: ExperienceDifficulty;
  status: ExperienceStatus;
}

export interface Destination {
  id: string;
  slug: string;
  name: string;
  province: string;
  description: string;
  heroImage: string;
  gallery: string[];
  popularExperiences: string[];
}

export interface Review {
  id: string;
  travellerName: string;
  country: string;
  rating: number;
  comment: string;
  date: string;
  experienceSlug?: string;
  guideSlug?: string;
}

export interface WildlifeMoment {
  name: string;
  location: string;
  image: string;
  description: string;
}

export const destinations: Destination[] = [
  { id: "destination-western-cape", slug: "western-cape", name: "Cape Town and the Western Cape", province: "Western Cape", heroImage: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1200&q=85", gallery: [], description: "Ocean roads, mountain light and a table worth lingering around.", popularExperiences: ["cape-peninsula", "winelands-slowly"] },
  { id: "destination-kwazulu-natal", slug: "kwazulu-natal", name: "KwaZulu-Natal", province: "KwaZulu-Natal", heroImage: "https://images.unsplash.com/photo-1523805009345-7448845a9e53?auto=format&fit=crop&w=1200&q=85", gallery: [], description: "Warm Indian Ocean welcomes, golden beaches and dramatic peaks.", popularExperiences: [] },
  { id: "destination-gauteng", slug: "gauteng", name: "Gauteng", province: "Gauteng", heroImage: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1200&q=85", gallery: [], description: "A creative, restless province where history meets tomorrow.", popularExperiences: [] },
];

export const experiences: Experience[] = [
  { id: "experience-cape-peninsula", slug: "cape-peninsula", title: "Private Cape Peninsula Experience", image: "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&w=1200&q=85", gallery: [], category: "Nature & wildlife", experienceType: "Private day tour", location: "Cape Town", province: "Western Cape", duration: "8 hours", price: 2450, currency: "ZAR", rating: 4.98, reviewCount: 126, guideSlug: "lwazi-mkhize", description: "A private, unrushed day from city to sea with a local eye for the details.", highlights: ["Chapman’s Peak and Cape Point", "Penguins at Boulders Beach", "Flexible, private itinerary"], meetingPoint: "Cape Town", groupSize: "Private group", languages: ["English"], included: ["Private guide", "Private vehicle"], excluded: ["Personal expenses"], difficulty: "easy", status: "published" },
  { id: "experience-kruger-day-safari", slug: "kruger-day-safari", title: "A Day in the Kruger", image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=85", gallery: [], category: "Nature & wildlife", experienceType: "Safari", location: "Greater Kruger", province: "Mpumalanga", duration: "10 hours", price: 3900, currency: "ZAR", rating: 5, reviewCount: 89, guideSlug: "amelia-van-wyk", description: "Read the bushveld with a conservation-minded guide and time for the unexpected.", highlights: ["Private open safari vehicle", "Expert wildlife tracking", "Sunrise and sunset drives"], meetingPoint: "Greater Kruger", groupSize: "Private group", languages: ["English"], included: ["Field guide", "Open safari vehicle"], excluded: ["Meals", "Personal expenses"], difficulty: "moderate", status: "published" },
  { id: "experience-winelands-slowly", slug: "winelands-slowly", title: "The Winelands, Slowly", image: "https://images.unsplash.com/photo-1572449043416-55f4685c9bb7?auto=format&fit=crop&w=1200&q=85", gallery: [], category: "Food & wine", experienceType: "Private day tour", location: "Franschhoek", province: "Western Cape", duration: "7 hours", price: 2850, currency: "ZAR", rating: 4.97, reviewCount: 74, description: "A generous day of small producers, beautiful food and mountain-backed roads.", highlights: ["Two boutique wine farms", "Long lunch in Franschhoek", "Tasting fees included"], meetingPoint: "Franschhoek", groupSize: "Private group", languages: ["English"], included: ["Local guide"], excluded: ["Personal purchases"], difficulty: "easy", status: "published" },
];

export const guides: Guide[] = [
  { id: "guide-lwazi-mkhize", slug: "lwazi-mkhize", name: "Lwazi Mkhize", profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=85", verified: true, rating: 5, reviewCount: 64, location: "Cape Town", province: "Western Cape", languages: ["English", "isiXhosa", "Zulu"], specialities: ["Culture", "City stories"], biography: "Lwazi brings Cape Town’s layered history to life through food, neighbourhoods and the voices of the people who call it home.", qualifications: [], yearsExperience: 8, responseTime: "Usually replies within a day", experienceCount: 1 },
  { id: "guide-amelia-van-wyk", slug: "amelia-van-wyk", name: "Amelia van Wyk", profileImage: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=800&q=85", verified: true, rating: 4.98, reviewCount: 41, location: "Hoedspruit", province: "Limpopo", languages: ["English", "Afrikaans"], specialities: ["Wildlife", "Conservation"], biography: "Amelia is a field guide and conservation storyteller who knows the quieter rhythms of the Lowveld.", qualifications: [], yearsExperience: 10, responseTime: "Usually replies within a day", experienceCount: 1 },
  { id: "guide-thabo-molefe", slug: "thabo-molefe", name: "Thabo Molefe", profileImage: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=85", verified: true, rating: 4.99, reviewCount: 52, location: "Johannesburg", province: "Gauteng", languages: ["English", "Sesotho", "Zulu"], specialities: ["History", "Contemporary art"], biography: "Thabo connects Johannesburg’s past and present through galleries, public art and the people shaping the city.", qualifications: [], yearsExperience: 7, responseTime: "Usually replies within two days", experienceCount: 0 },
];

export const wildlifeMoments: WildlifeMoment[] = [
  { name: "Lion country", location: "Greater Kruger, Mpumalanga", image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=85", description: "Dawn belongs to the pride, before the bushveld warms." },
  { name: "Elephant paths", location: "Addo Elephant National Park, Eastern Cape", image: "https://images.unsplash.com/photo-1557050543-4d5f4e07ef46?auto=format&fit=crop&w=1200&q=85", description: "Follow ancient routes through thicket and red earth." },
  { name: "Giraffe country", location: "Limpopo", image: "https://images.unsplash.com/photo-1535338454770-8be927b5a00b?auto=format&fit=crop&w=1200&q=85", description: "A quiet sighting, framed by the wide Lowveld sky." },
];

export const reviews: Review[] = [
  { id: "review-demo-cape-001", travellerName: "Maya R.", country: "United Kingdom", rating: 5, comment: "A thoughtful day with exactly the right balance of landmarks and local detail.", date: "2026-02-12", experienceSlug: "cape-peninsula", guideSlug: "lwazi-mkhize" },
  { id: "review-demo-kruger-001", travellerName: "Daniel K.", country: "Germany", rating: 5, comment: "Patient, observant and generous with the context behind every sighting.", date: "2026-01-28", experienceSlug: "kruger-day-safari", guideSlug: "amelia-van-wyk" },
];