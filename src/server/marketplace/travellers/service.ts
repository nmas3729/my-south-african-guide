import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole } from "@/server/auth/session";
import { NotFoundError, ValidationError } from "@/server/marketplace/shared/errors";
import type { TravellerProfileDto } from "@/server/marketplace/shared/dtos";
import { travellerProfileInputSchema } from "@/server/marketplace/shared/schemas";

const profileSelect = { userId: true, country: true, phone: true, preferences: true } as const;

export async function getMyTravellerProfile(): Promise<TravellerProfileDto> {
  const user = await requireRole("TRAVELLER");
  const profile = await prisma.travellerProfile.findUnique({ where: { userId: user.id }, select: profileSelect });
  if (!profile) throw new NotFoundError("Traveller profile not found.");
  return profile;
}

export async function createOrUpdateMyTravellerProfile(input: unknown): Promise<TravellerProfileDto> {
  const user = await requireRole("TRAVELLER");
  const parsed = travellerProfileInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid traveller profile.", { cause: parsed.error });

  const preferences = parsed.data.preferences === null ? Prisma.JsonNull : parsed.data.preferences ? JSON.parse(JSON.stringify(parsed.data.preferences)) : undefined;

  const profileData = {
    country: parsed.data.country ?? undefined,
    phone: parsed.data.phone ?? undefined,
    preferences,
  };

  return prisma.travellerProfile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...profileData },
    update: profileData,
    select: profileSelect,
  });
}
