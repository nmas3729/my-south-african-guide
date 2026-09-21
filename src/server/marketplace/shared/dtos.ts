import type { BookingStatus, DestinationStatus, ExperienceStatus, ReviewStatus, UserRole, UserStatus, VerificationStatus } from "@prisma/client";

export type PublicDestination = {
  id: string;
  name: string;
  province: string;
  description: string | null;
  image: string | null;
  slug: string;
  status: DestinationStatus;
};

export type PublicGuide = {
  id: string;
  slug: string | null;
  displayName: string;
  bio: string | null;
  location: string | null;
  languages: string[];
  provinces: string[];
  profileImage: string | null;
  rating: number;
  verified: boolean;
};

export type PublicExperience = {
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
  status: ExperienceStatus;
  publishedAt: Date | null;
  destination: Pick<PublicDestination, "id" | "name" | "province" | "slug">;
  guide: Pick<PublicGuide, "id" | "displayName" | "location" | "profileImage" | "rating" | "verified">;
  images: Array<{ url: string; altText: string; order: number }>;
};

export type TravellerProfileDto = {
  userId: string;
  country: string | null;
  phone: string | null;
  preferences: unknown;
};

export type GuidePrivateProfileDto = {
  userId: string;
  displayName: string | null;
  bio: string | null;
  location: string | null;
  languages: string[];
  provinces: string[];
  qualifications: string[];
  profileImage: string | null;
  verified: boolean;
  verificationStatus: VerificationStatus;
  active: boolean;
};

export type BookingSummary = {
  id: string;
  status: BookingStatus;
  bookingDate: Date;
  numberOfGuests: number;
  travellerMessage: string | null;
  totalAmount: number;
  currency: string;
  createdAt: Date;
  updatedAt: Date;
  acceptedAt: Date | null;
  declinedAt: Date | null;
  confirmedAt: Date | null;
  completedAt: Date | null;
  cancelledAt: Date | null;
  confirmationReference: string | null;
  experience: { id: string; title: string; slug: string; summary: string | null; category: string | null };
  guide: { id: string; displayName: string | null; slug: string | null; profileImage: string | null } | null;
  traveller: { id: string; name: string | null; firstName: string | null; lastName: string | null } | null;
};

export type BookingDto = BookingSummary;
export type TravellerBookingDTO = BookingSummary;
export type GuideBookingDTO = BookingSummary;
export type BookingDetailDTO = BookingSummary;

export type SafeAccountDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt: Date | null;
};

export type ReviewDto = { id: string; rating: number; comment: string; status: ReviewStatus; createdAt: Date; updatedAt: Date };
