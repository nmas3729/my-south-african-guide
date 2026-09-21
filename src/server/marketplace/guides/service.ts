import { VerificationStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/session";
import { NotFoundError } from "@/server/marketplace/shared/errors";
import type { GuidePrivateProfileDto, PublicGuide } from "@/server/marketplace/shared/dtos";
import { guideProfileInputSchema } from "@/server/marketplace/shared/schemas";

const publicGuideSelect = { id: true, slug: true, displayName: true, bio: true, location: true, languages: true, provinces: true, profileImage: true, rating: true, verified: true } as const;
const publicGuideWhere = { verified: true, active: true, verificationStatus: VerificationStatus.APPROVED };

function mapPublicGuide(guide: { id: string; slug: string | null; displayName: string | null; bio: string | null; location: string | null; languages: string[]; provinces: string[]; profileImage: string | null; rating: unknown; verified: boolean }): PublicGuide {
  return { ...guide, displayName: guide.displayName ?? "Local guide", rating: Number(guide.rating) };
}

export async function listPublicGuides(): Promise<PublicGuide[]> {
  const guides = await prisma.guideProfile.findMany({ where: publicGuideWhere, select: publicGuideSelect, orderBy: [{ displayName: "asc" }, { id: "asc" }] });
  return guides.map(mapPublicGuide);
}

export async function getPublicGuideBySlug(slug: string): Promise<PublicGuide> {
  const guide = await prisma.guideProfile.findFirst({ where: { ...publicGuideWhere, slug }, select: publicGuideSelect });
  if (!guide) throw new NotFoundError("Guide not found.");
  return mapPublicGuide(guide);
}

export async function getMyGuideProfile(): Promise<GuidePrivateProfileDto> {
  const user = await requireRole("GUIDE");
  const guide = await prisma.guideProfile.findUnique({ where: { userId: user.id }, select: { userId: true, displayName: true, bio: true, location: true, languages: true, provinces: true, qualifications: true, profileImage: true, verified: true, verificationStatus: true, active: true } });
  if (!guide) throw new NotFoundError("Guide profile not found.");
  return guide;
}

export async function updateMyGuideProfile(input: unknown): Promise<GuidePrivateProfileDto> {
  const user = await requireRole("GUIDE");
  const data = guideProfileInputSchema.parse(input);
  const guide = await prisma.guideProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
  if (!guide) throw new NotFoundError("Guide profile not found.");
  return prisma.guideProfile.update({ where: { id: guide.id }, data, select: { userId: true, displayName: true, bio: true, location: true, languages: true, provinces: true, qualifications: true, profileImage: true, verified: true, verificationStatus: true, active: true } });
}
