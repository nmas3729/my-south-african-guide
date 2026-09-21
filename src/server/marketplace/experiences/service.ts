import { DestinationStatus, ExperienceStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { NotFoundError } from "@/server/marketplace/shared/errors";
import type { PublicExperience } from "@/server/marketplace/shared/dtos";
import { mapPublicExperience } from "@/server/marketplace/experiences/dto";

const publicDestinationSelect = { id: true, name: true, province: true, slug: true } as const;
const publicGuideSelect = { id: true, slug: true, displayName: true, location: true, profileImage: true, rating: true, verified: true } as const;
const publicExperienceSelect = {
  id: true, title: true, slug: true, summary: true, description: true, category: true, duration: true, location: true, meetingPoint: true, groupLimit: true, price: true, currency: true, status: true, publishedAt: true,
  destination: { select: publicDestinationSelect },
  guide: { select: publicGuideSelect },
  images: { select: { url: true, altText: true, order: true }, orderBy: { order: "asc" as const } },
} as const;

const publishedWhere = {
  status: ExperienceStatus.ACTIVE,
  destination: { status: DestinationStatus.PUBLISHED },
  guide: { verified: true, active: true, verificationStatus: VerificationStatus.APPROVED },
};

export async function listPublishedExperiences(): Promise<PublicExperience[]> {
  const records = await prisma.experience.findMany({ where: publishedWhere, select: publicExperienceSelect, orderBy: [{ title: "asc" }, { id: "asc" }] });
  return records.map(mapPublicExperience);
}

export async function getPublishedExperienceBySlug(slug: string): Promise<PublicExperience> {
  const record = await prisma.experience.findFirst({ where: { slug, ...publishedWhere }, select: publicExperienceSelect });
  if (!record) throw new NotFoundError("Experience not found.");
  return mapPublicExperience(record);
}

export async function listPublishedExperiencesByDestination(destinationId: string): Promise<PublicExperience[]> {
  const records = await prisma.experience.findMany({ where: { ...publishedWhere, destinationId }, select: publicExperienceSelect, orderBy: [{ title: "asc" }, { id: "asc" }] });
  return records.map(mapPublicExperience);
}

export async function listPublishedExperiencesByGuide(guideId: string): Promise<PublicExperience[]> {
  const records = await prisma.experience.findMany({ where: { ...publishedWhere, guideId }, select: publicExperienceSelect, orderBy: [{ title: "asc" }, { id: "asc" }] });
  return records.map(mapPublicExperience);
}
