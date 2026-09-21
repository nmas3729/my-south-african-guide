import { z } from "zod";
import { BookingStatus, DestinationStatus, ExperienceStatus } from "@prisma/client";

export const destinationInputSchema = z.object({
  slug: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(160),
  province: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2_000).nullable().optional(),
  image: z.string().trim().url().max(2_000).nullable().optional(),
  status: z.nativeEnum(DestinationStatus).optional(),
});

export const experienceInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: z.string().trim().min(1).max(180),
  summary: z.string().trim().max(500).nullable().optional(),
  description: z.string().trim().min(1).max(10_000),
  category: z.string().trim().max(120).nullable().optional(),
  duration: z.number().int().positive(),
  location: z.string().trim().max(160).nullable().optional(),
  destinationId: z.string().min(1),
  guideId: z.string().min(1),
  status: z.nativeEnum(ExperienceStatus).optional(),
});

export const travellerProfileInputSchema = z.object({
  country: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  preferences: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const guideProfileInputSchema = z.object({
  displayName: z.string().trim().max(160).nullable().optional(),
  bio: z.string().trim().max(10_000).nullable().optional(),
  location: z.string().trim().max(160).nullable().optional(),
  languages: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  provinces: z.array(z.string().trim().min(1).max(120)).max(20).optional(),
  qualifications: z.array(z.string().trim().min(1).max(160)).max(30).optional(),
  profileImage: z.string().trim().url().max(2_000).nullable().optional(),
});

export const bookingRequestSchema = z.object({
  experienceId: z.string().min(1),
  bookingDate: z.union([z.string().min(1), z.coerce.date()]).transform((value) => (value instanceof Date ? value : new Date(value))),
  numberOfGuests: z.number().int().positive().max(100),
  travellerMessage: z.string().trim().max(5_000).nullable().optional(),
}).refine((value) => !Number.isNaN(value.bookingDate.getTime()), { message: "Invalid booking date.", path: ["bookingDate"] });

export const bookingStatusSchema = z.nativeEnum(BookingStatus);
