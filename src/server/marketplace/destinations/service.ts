import { DestinationStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/marketplace/shared/errors";
import type { PublicDestination, PublicExperience } from "@/server/marketplace/shared/dtos";
import { mapPublicExperience } from "@/server/marketplace/experiences/dto";

const destinationSelect = {
  id: true,
  name: true,
  province: true,
  description: true,
  image: true,
  slug: true,
  status: true,
} as const;

export async function listPublishedDestinations(): Promise<PublicDestination[]> {
  return prisma.destination.findMany({ where: { status: DestinationStatus.PUBLISHED }, select: destinationSelect, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

export async function getPublishedDestinationBySlug(slug: string): Promise<PublicDestination> {
  const destination = await prisma.destination.findFirst({ where: { slug, status: DestinationStatus.PUBLISHED }, select: destinationSelect });
  if (!destination) throw new NotFoundError("Destination not found.");
  return destination;
}

export async function listPublishedExperiencesForDestination(destinationId: string): Promise<PublicExperience[]> {
  const experiences = await prisma.experience.findMany({
    where: { destinationId, status: "ACTIVE", destination: { status: DestinationStatus.PUBLISHED }, guide: { verified: true, active: true, verificationStatus: "APPROVED" } },
    select: { ...experienceSelectForDestination, guide: { select: publicGuideSelect }, destination: { select: publicDestinationRefSelect } },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  });
  return experiences.map(mapPublicExperience);
}

const publicDestinationRefSelect = { id: true, name: true, province: true, slug: true } as const;
const publicGuideSelect = { id: true, slug: true, displayName: true, location: true, profileImage: true, rating: true, verified: true } as const;
const experienceSelectForDestination = { id: true, title: true, slug: true, summary: true, description: true, category: true, duration: true, location: true, meetingPoint: true, groupLimit: true, price: true, currency: true, status: true, publishedAt: true, images: { select: { url: true, altText: true, order: true }, orderBy: { order: "asc" as const } } } as const;
