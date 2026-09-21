import type { PublicExperience } from "@/server/marketplace/shared/dtos";

type PublicExperienceRecord = {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  description: string;
  category: string | null;
  duration: number;
  location: string | null;
  meetingPoint: string | null;
  groupLimit: number | null;
  price: number;
  currency: string;
  status: PublicExperience["status"];
  publishedAt: Date | null;
  images: Array<{ url: string; altText: string; order: number }>;
  destination: PublicExperience["destination"];
  guide: { id: string; slug: string | null; displayName: string | null; location: string | null; profileImage: string | null; rating: unknown; verified: boolean };
};

export function mapPublicExperience(record: PublicExperienceRecord): PublicExperience {
  return {
    ...record,
    guide: { ...record.guide, displayName: record.guide.displayName ?? "Local guide", rating: Number(record.guide.rating) },
  };
}
