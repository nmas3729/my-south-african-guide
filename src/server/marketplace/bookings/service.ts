import { randomUUID } from "node:crypto";
import { Prisma, BookingStatus, ExperienceStatus, VerificationStatus } from "@prisma/client";
import { prisma } from "@/server/db/client";
import { requireRole, requireUser } from "@/server/auth/session";
import { assertBookingTransition } from "@/server/marketplace/bookings/state-machine";
import { AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/server/marketplace/shared/errors";
import type { BookingDto, BookingSummary } from "@/server/marketplace/shared/dtos";
import { bookingRequestSchema } from "@/server/marketplace/shared/schemas";

const bookingSelect = {
  id: true,
  travellerId: true,
  experienceId: true,
  guideId: true,
  bookingDate: true,
  numberOfGuests: true,
  travellerMessage: true,
  status: true,
  totalAmount: true,
  currency: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  declinedAt: true,
  confirmedAt: true,
  completedAt: true,
  cancelledAt: true,
  confirmationReference: true,
  traveller: { select: { id: true, name: true, firstName: true, lastName: true } },
  experience: { select: { id: true, title: true, slug: true, summary: true, category: true } },
  guide: { select: { id: true, slug: true, displayName: true, profileImage: true } },
} as const;

type BookingRecord = Prisma.BookingGetPayload<{ select: typeof bookingSelect }>;

function mapBookingRecord(record: BookingRecord): BookingDto {
  return {
    id: record.id,
    status: record.status,
    bookingDate: record.bookingDate,
    numberOfGuests: record.numberOfGuests,
    travellerMessage: record.travellerMessage,
    totalAmount: record.totalAmount,
    currency: record.currency,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    acceptedAt: record.acceptedAt,
    declinedAt: record.declinedAt,
    confirmedAt: record.confirmedAt,
    completedAt: record.completedAt,
    cancelledAt: record.cancelledAt,
    confirmationReference: record.confirmationReference,
    experience: {
      id: record.experience.id,
      title: record.experience.title,
      slug: record.experience.slug,
      summary: record.experience.summary,
      category: record.experience.category,
    },
    guide: record.guide ? { id: record.guide.id, displayName: record.guide.displayName ?? null, slug: record.guide.slug, profileImage: record.guide.profileImage } : null,
    traveller: record.traveller ? { id: record.traveller.id, name: record.traveller.name, firstName: record.traveller.firstName, lastName: record.traveller.lastName } : null,
  } satisfies BookingSummary;
}

async function findGuideProfileForUser(userId: string) {
  return prisma.guideProfile.findUnique({ where: { userId }, select: { id: true } });
}

export async function createBookingRequest(input: unknown): Promise<BookingDto> {
  const traveller = await requireRole("TRAVELLER");
  const parsed = bookingRequestSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid booking request.", { cause: parsed.error });

  const existingActive = await prisma.booking.findFirst({
    where: {
      travellerId: traveller.id,
      experienceId: parsed.data.experienceId,
      bookingDate: new Date(parsed.data.bookingDate),
      status: { in: [BookingStatus.REQUESTED, BookingStatus.ACCEPTED, BookingStatus.CONFIRMED] },
    },
    select: { id: true },
  });

  if (existingActive) throw new ConflictError("A booking for this experience on the selected date already exists.");

  const experience = await prisma.experience.findFirst({
    where: {
      id: parsed.data.experienceId,
      status: ExperienceStatus.ACTIVE,
      guide: { active: true, verified: true, verificationStatus: VerificationStatus.APPROVED },
      destination: { status: "PUBLISHED" },
    },
    select: {
      id: true,
      guideId: true,
      price: true,
      currency: true,
      groupLimit: true,
      title: true,
      slug: true,
      summary: true,
      category: true,
    },
  });

  if (!experience) throw new NotFoundError("Experience not found.");
  if (experience.groupLimit !== null && parsed.data.numberOfGuests > experience.groupLimit) {
    throw new ConflictError("The requested number of travellers exceeds this experience's group limit.");
  }

  const record: BookingRecord = await prisma.booking.create({
    data: {
      travellerId: traveller.id,
      experienceId: experience.id,
      guideId: experience.guideId,
      bookingDate: new Date(parsed.data.bookingDate),
      numberOfGuests: parsed.data.numberOfGuests,
      travellerMessage: parsed.data.travellerMessage ?? null,
      totalAmount: experience.price * parsed.data.numberOfGuests,
      currency: experience.currency,
      status: BookingStatus.REQUESTED,
    },
    select: bookingSelect,
  });

  return mapBookingRecord(record);
}

export async function getBookingById(bookingId: string): Promise<BookingDto> {
  const user = await requireUser();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
  if (!booking) throw new NotFoundError("Booking not found.");

  if (user.role === "TRAVELLER" && booking.travellerId !== user.id) throw new AuthorizationError();
  if (user.role === "GUIDE") {
    const guide = await findGuideProfileForUser(user.id);
    if (!guide || booking.guideId !== guide.id) throw new AuthorizationError();
  }

  return mapBookingRecord(booking);
}

export async function listMyBookings(): Promise<BookingDto[]> {
  const user = await requireUser();

  if (user.role === "TRAVELLER") {
    const records: BookingRecord[] = await prisma.booking.findMany({
      where: { travellerId: user.id },
      select: bookingSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return records.map((record: BookingRecord) => mapBookingRecord(record));
  }

  if (user.role === "GUIDE") {
    const guide = await findGuideProfileForUser(user.id);
    if (!guide) throw new NotFoundError("Guide profile not found.");
    const records: BookingRecord[] = await prisma.booking.findMany({
      where: { guideId: guide.id },
      select: bookingSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return records.map((record: BookingRecord) => mapBookingRecord(record));
  }

  if (user.role === "ADMIN") {
    const records: BookingRecord[] = await prisma.booking.findMany({
      select: bookingSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });
    return records.map((record: BookingRecord) => mapBookingRecord(record));
  }

  throw new AuthorizationError("This booking view is not available for this role.");
}

export async function listIncomingBookingRequests(): Promise<BookingDto[]> {
  const guideUser = await requireRole("GUIDE");
  const guide = await findGuideProfileForUser(guideUser.id);
  if (!guide) throw new NotFoundError("Guide profile not found.");

  const records: BookingRecord[] = await prisma.booking.findMany({
    where: { guideId: guide.id, status: BookingStatus.REQUESTED },
    select: bookingSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });

  return records.map((record: BookingRecord) => mapBookingRecord(record));
}

export async function acceptBookingRequest(bookingId: string): Promise<BookingDto> {
  const guideUser = await requireRole("GUIDE");
  const guide = await findGuideProfileForUser(guideUser.id);
  if (!guide) throw new NotFoundError("Guide profile not found.");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<BookingDto> => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, guideId: true, status: true } });
    if (!booking) throw new NotFoundError("Booking not found.");
    if (booking.guideId !== guide.id) throw new AuthorizationError();
    assertBookingTransition(booking.status, BookingStatus.ACCEPTED);

    const updated = await tx.booking.updateMany({
      where: { id: bookingId, guideId: guide.id, status: BookingStatus.REQUESTED },
      data: { status: BookingStatus.ACCEPTED, acceptedAt: new Date(), updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictError("This booking can no longer be accepted.");

    const refreshed: BookingRecord | null = await tx.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
    if (!refreshed) throw new NotFoundError("Booking not found.");
    return mapBookingRecord(refreshed);
  });

  return result;
}

export async function declineBookingRequest(bookingId: string): Promise<BookingDto> {
  const guideUser = await requireRole("GUIDE");
  const guide = await findGuideProfileForUser(guideUser.id);
  if (!guide) throw new NotFoundError("Guide profile not found.");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<BookingDto> => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, guideId: true, status: true } });
    if (!booking) throw new NotFoundError("Booking not found.");
    if (booking.guideId !== guide.id) throw new AuthorizationError();
    assertBookingTransition(booking.status, BookingStatus.DECLINED);

    const updated = await tx.booking.updateMany({
      where: { id: bookingId, guideId: guide.id, status: BookingStatus.REQUESTED },
      data: { status: BookingStatus.DECLINED, declinedAt: new Date(), updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictError("This booking can no longer be declined.");

    const refreshed: BookingRecord | null = await tx.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
    if (!refreshed) throw new NotFoundError("Booking not found.");
    return mapBookingRecord(refreshed);
  });

  return result;
}

export async function confirmBooking(bookingId: string): Promise<BookingDto> {
  const traveller = await requireRole("TRAVELLER");

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient): Promise<BookingDto> => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, select: { id: true, travellerId: true, status: true } });
    if (!booking) throw new NotFoundError("Booking not found.");
    if (booking.travellerId !== traveller.id) throw new AuthorizationError();
    assertBookingTransition(booking.status, BookingStatus.CONFIRMED);

    let confirmationReference = `MSAG-${randomUUID().slice(0, 8).toUpperCase()}`;
    let existingReference = await tx.booking.findUnique({ where: { confirmationReference }, select: { id: true } });
    while (existingReference) {
      confirmationReference = `MSAG-${randomUUID().slice(0, 8).toUpperCase()}`;
      existingReference = await tx.booking.findUnique({ where: { confirmationReference }, select: { id: true } });
    }

    const updated = await tx.booking.updateMany({
      where: { id: bookingId, travellerId: traveller.id, status: BookingStatus.ACCEPTED },
      data: { status: BookingStatus.CONFIRMED, confirmedAt: new Date(), confirmationReference, updatedAt: new Date() },
    });
    if (updated.count !== 1) throw new ConflictError("This booking can no longer be confirmed.");

    const refreshed: BookingRecord | null = await tx.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
    if (!refreshed) throw new NotFoundError("Booking not found.");
    return mapBookingRecord(refreshed);
  });

  return result;
}

export async function cancelBookingRequest(bookingId: string): Promise<BookingDto> {
  const user = await requireUser();
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, select: { id: true, travellerId: true, guideId: true, status: true } });
  if (!booking) throw new NotFoundError("Booking not found.");

  if (user.role === "TRAVELLER" && booking.travellerId !== user.id) throw new AuthorizationError();
  if (user.role === "GUIDE") {
    const guide = await findGuideProfileForUser(user.id);
    if (!guide || booking.guideId !== guide.id) throw new AuthorizationError();
  }

  assertBookingTransition(booking.status, BookingStatus.CANCELLED);

  const updated = await prisma.booking.updateMany({
    where: { id: bookingId, status: booking.status },
    data: { status: BookingStatus.CANCELLED, cancelledAt: new Date(), updatedAt: new Date() },
  });
  if (updated.count !== 1) throw new ConflictError("This booking can no longer be cancelled.");

  const refreshed: BookingRecord | null = await prisma.booking.findUnique({ where: { id: bookingId }, select: bookingSelect });
  if (!refreshed) throw new NotFoundError("Booking not found.");
  return mapBookingRecord(refreshed);
}
