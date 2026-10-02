import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

type SeedDestination = {
  slug: string;
  name: string;
  province: string;
  description: string | null;
  image: string | null;
};

type SeedGuide = {
  slug: string;
  name: string;
  firstName: string;
  lastName: string;
  profileImage: string;
  verified: boolean;
  rating: number;
  location: string;
  province: string;
  languages: string[];
  biography: string;
  qualifications: string[];
};

type SeedExperience = {
  slug: string;
  title: string;
  guideSlug: string;
  destinationSlug: string;
  description: string;
  category: string;
  durationMinutes: number;
  location: string;
  meetingPoint: string;
  priceInRands: number;
  currency: string;
  image: string;
  gallery: string[];
  languages: string[];
};

const destinations: SeedDestination[] = [
  {
    slug: "western-cape",
    name: "Cape Town and the Western Cape",
    province: "Western Cape",
    description: "Ocean roads, mountain light and a table worth lingering around.",
    image: "https://images.unsplash.com/photo-1580060839134-75a5edca2e99?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "kwazulu-natal",
    name: "KwaZulu-Natal",
    province: "KwaZulu-Natal",
    description: "Warm Indian Ocean welcomes, golden beaches and dramatic peaks.",
    image: "https://images.unsplash.com/photo-1523805009345-7448845a9e53?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "gauteng",
    name: "Gauteng",
    province: "Gauteng",
    description: "A creative, restless province where history meets tomorrow.",
    image: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=1200&q=85",
  },
  {
    slug: "greater-kruger",
    name: "Greater Kruger",
    province: "Mpumalanga",
    description: null,
    image: null,
  },
];

const guides: SeedGuide[] = [
  {
    slug: "lwazi-mkhize",
    name: "Lwazi Mkhize",
    firstName: "Lwazi",
    lastName: "Mkhize",
    profileImage: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=85",
    verified: true,
    rating: 5,
    location: "Cape Town",
    province: "Western Cape",
    languages: ["English", "isiXhosa", "Zulu"],
    biography: "Lwazi brings Cape Town’s layered history to life through food, neighbourhoods and the voices of the people who call it home.",
    qualifications: [],
  },
  {
    slug: "amelia-van-wyk",
    name: "Amelia van Wyk",
    firstName: "Amelia",
    lastName: "van Wyk",
    profileImage: "https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&w=800&q=85",
    verified: true,
    rating: 4.98,
    location: "Hoedspruit",
    province: "Limpopo",
    languages: ["English", "Afrikaans"],
    biography: "Amelia is a field guide and conservation storyteller who knows the quieter rhythms of the Lowveld.",
    qualifications: [],
  },
  {
    slug: "thabo-molefe",
    name: "Thabo Molefe",
    firstName: "Thabo",
    lastName: "Molefe",
    profileImage: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=85",
    verified: true,
    rating: 4.99,
    location: "Johannesburg",
    province: "Gauteng",
    languages: ["English", "Sesotho", "Zulu"],
    biography: "Thabo connects Johannesburg’s past and present through galleries, public art and the people shaping the city.",
    qualifications: [],
  },
];

const experiences: SeedExperience[] = [
  {
    slug: "cape-peninsula",
    title: "Private Cape Peninsula Experience",
    guideSlug: "lwazi-mkhize",
    destinationSlug: "western-cape",
    description: "A private, unrushed day from city to sea with a local eye for the details.",
    category: "Nature & wildlife",
    durationMinutes: 480,
    location: "Cape Town",
    meetingPoint: "Cape Town",
    priceInRands: 2450,
    currency: "ZAR",
    image: "https://images.unsplash.com/photo-1576485375217-d6a95e34d043?auto=format&fit=crop&w=1200&q=85",
    gallery: [],
    languages: ["English"],
  },
  {
    slug: "kruger-day-safari",
    title: "A Day in the Kruger",
    guideSlug: "amelia-van-wyk",
    destinationSlug: "greater-kruger",
    description: "Read the bushveld with a conservation-minded guide and time for the unexpected.",
    category: "Nature & wildlife",
    durationMinutes: 600,
    location: "Greater Kruger",
    meetingPoint: "Greater Kruger",
    priceInRands: 3900,
    currency: "ZAR",
    image: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=85",
    gallery: [],
    languages: ["English"],
  },
];

async function seedDestinations(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const destination of destinations) {
    const record = await prisma.destination.upsert({
      where: { slug: destination.slug },
      update: {
        name: destination.name,
        province: destination.province,
        description: destination.description,
        image: destination.image,
        status: "PUBLISHED",
      },
      create: {
        ...destination,
        status: "PUBLISHED",
        publishedAt: new Date(),
      },
    });
    ids.set(destination.slug, record.id);
  }

  console.log(`Destinations seeded: ${destinations.length}`);
  return ids;
}

async function seedGuides(): Promise<Map<string, string>> {
  const ids = new Map<string, string>();

  for (const guide of guides) {
    const email = `seed-${guide.slug}@example.invalid`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: guide.name,
        firstName: guide.firstName,
        lastName: guide.lastName,
        role: "GUIDE",
        status: "ACTIVE",
        profileImage: guide.profileImage,
      },
      create: {
        email,
        name: guide.name,
        firstName: guide.firstName,
        lastName: guide.lastName,
        role: "GUIDE",
        status: "ACTIVE",
        profileImage: guide.profileImage,
      },
    });

    const profile = await prisma.guideProfile.upsert({
      where: { userId: user.id },
      update: {
        slug: guide.slug,
        displayName: guide.name,
        timezone: "Africa/Johannesburg",
        bio: guide.biography,
        location: guide.location,
        languages: guide.languages,
        provinces: [guide.province],
        qualifications: guide.qualifications,
        profileImage: guide.profileImage,
        verified: guide.verified,
        verificationStatus: guide.verified ? "APPROVED" : "DRAFT",
        rating: guide.rating,
        active: true,
      },
      create: {
        userId: user.id,
        slug: guide.slug,
        displayName: guide.name,
        timezone: "Africa/Johannesburg",
        bio: guide.biography,
        location: guide.location,
        languages: guide.languages,
        provinces: [guide.province],
        qualifications: guide.qualifications,
        profileImage: guide.profileImage,
        verified: guide.verified,
        verificationStatus: guide.verified ? "APPROVED" : "DRAFT",
        verificationDate: guide.verified ? new Date() : null,
        rating: guide.rating,
        active: true,
      },
    });
    ids.set(guide.slug, profile.id);
  }

  console.log(`Guides seeded: ${guides.length}`);
  return ids;
}

async function seedExperiences(
  guideIds: Map<string, string>,
  destinationIds: Map<string, string>,
): Promise<void> {
  for (const experience of experiences) {
    const guideId = guideIds.get(experience.guideSlug);
    const destinationId = destinationIds.get(experience.destinationSlug);
    if (!guideId || !destinationId) {
      throw new Error(`Missing seed relation for experience "${experience.slug}".`);
    }

    const record = await prisma.experience.upsert({
      where: { slug: experience.slug },
      update: {
        title: experience.title,
        description: experience.description,
        category: experience.category,
        duration: experience.durationMinutes,
        location: experience.location,
        meetingPoint: experience.meetingPoint,
        groupLimit: null,
        timezone: null,
        languages: experience.languages,
        pricingModel: null,
        price: experience.priceInRands * 100,
        currency: experience.currency,
        status: "ACTIVE",
        guideId,
        destinationId,
      },
      create: {
        slug: experience.slug,
        title: experience.title,
        description: experience.description,
        category: experience.category,
        duration: experience.durationMinutes,
        location: experience.location,
        meetingPoint: experience.meetingPoint,
        groupLimit: null,
        timezone: null,
        languages: experience.languages,
        pricingModel: null,
        price: experience.priceInRands * 100,
        currency: experience.currency,
        status: "ACTIVE",
        guideId,
        destinationId,
        publishedAt: new Date(),
      },
    });

    const images = [experience.image, ...experience.gallery];
    for (const [order, url] of images.entries()) {
      await prisma.experienceImage.upsert({
        where: {
          experienceId_order: { experienceId: record.id, order },
        },
        update: { url, altText: experience.title },
        create: {
          experienceId: record.id,
          order,
          url,
          altText: experience.title,
        },
      });
    }
  }

  console.log(`Experiences seeded: ${experiences.length}`);
}

async function main(): Promise<void> {
  console.log("Seeding marketplace reference data (idempotent; no deletes)...");
  const destinationIds = await seedDestinations();
  const guideIds = await seedGuides();
  await seedExperiences(guideIds, destinationIds);
  console.log("Seed complete. Bookings, payments, reservations, and tour slots were not changed.");
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
