-- CreateEnum
CREATE TYPE "TourSlotStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SlotReservationStatus" AS ENUM ('HELD', 'PENDING_PAYMENT', 'COMMITTED', 'RELEASED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AvailabilityExceptionType" AS ENUM ('BLOCKED', 'SPECIAL_DEPARTURE', 'CAPACITY_OVERRIDE');

-- CreateEnum
CREATE TYPE "BookingEventType" AS ENUM ('BOOKING_CREATED', 'STATUS_CHANGED', 'PAYMENT_INITIATED', 'PAYMENT_CONFIRMED', 'PAYMENT_FAILED', 'CANCELLED', 'REFUNDED', 'NOTE');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "discountAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "endsAt" TIMESTAMPTZ(3),
ADD COLUMN     "extrasAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "guideFeeAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "privateGuide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "slotId" TEXT,
ADD COLUMN     "startsAt" TIMESTAMPTZ(3),
ADD COLUMN     "subtotalAmount" INTEGER,
ADD COLUMN     "timezone" VARCHAR(64),
ADD COLUMN     "unitPriceAmount" INTEGER,
ADD COLUMN     "vatAmount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRateBps" INTEGER;

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "languages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pricingModel" TEXT,
ADD COLUMN     "timezone" VARCHAR(64);

-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "timezone" VARCHAR(64);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "failedAt" TIMESTAMP(3),
ADD COLUMN     "failureCode" TEXT,
ADD COLUMN     "failureMessage" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "paidAt" TIMESTAMP(3),
ADD COLUMN     "providerPaymentId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "AvailabilityRule" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTimeLocal" VARCHAR(5) NOT NULL,
    "durationMinutes" INTEGER,
    "capacityOverride" INTEGER,
    "seasonStartDate" DATE,
    "seasonEndDate" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "type" "AvailabilityExceptionType" NOT NULL,
    "date" DATE,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "capacityOverride" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourSlot" (
    "id" TEXT NOT NULL,
    "experienceId" TEXT NOT NULL,
    "guideId" TEXT,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "timezone" VARCHAR(64),
    "capacity" INTEGER NOT NULL,
    "committedSeats" INTEGER NOT NULL DEFAULT 0,
    "heldSeats" INTEGER NOT NULL DEFAULT 0,
    "status" "TourSlotStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TourSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SlotReservation" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "bookingId" TEXT,
    "partySize" INTEGER NOT NULL,
    "status" "SlotReservationStatus" NOT NULL DEFAULT 'HELD',
    "expiresAt" TIMESTAMPTZ(3),
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SlotReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideScheduleRule" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTimeLocal" VARCHAR(5) NOT NULL,
    "endTimeLocal" VARCHAR(5) NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideScheduleRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideUnavailability" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "startsAt" TIMESTAMPTZ(3) NOT NULL,
    "endsAt" TIMESTAMPTZ(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GuideUnavailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingEvent" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "type" "BookingEventType" NOT NULL,
    "fromStatus" "BookingStatus",
    "toStatus" "BookingStatus",
    "actorId" TEXT,
    "actorRole" "UserRole",
    "paymentReference" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT,
    "provider" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "eventType" TEXT,
    "payload" JSONB,
    "signatureVerified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "customerUserId" TEXT,
    "customerName" TEXT,
    "customerEmail" TEXT,
    "customerBillingAddress" JSONB,
    "customerVatNumber" TEXT,
    "experienceTitle" TEXT,
    "experienceStartsAt" TIMESTAMPTZ(3),
    "guideName" TEXT,
    "subtotalAmount" INTEGER NOT NULL,
    "guideFeeAmount" INTEGER NOT NULL DEFAULT 0,
    "extrasAmount" INTEGER NOT NULL DEFAULT 0,
    "discountAmount" INTEGER NOT NULL DEFAULT 0,
    "vatRateBps" INTEGER,
    "vatAmount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'ZAR',
    "paymentReference" TEXT,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "issuedAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "pdfStorageRef" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityRule_experienceId_active_idx" ON "AvailabilityRule"("experienceId", "active");

-- CreateIndex
CREATE INDEX "AvailabilityRule_experienceId_dayOfWeek_idx" ON "AvailabilityRule"("experienceId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "AvailabilityException_experienceId_date_idx" ON "AvailabilityException"("experienceId", "date");

-- CreateIndex
CREATE INDEX "AvailabilityException_experienceId_startsAt_endsAt_idx" ON "AvailabilityException"("experienceId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "TourSlot_experienceId_status_startsAt_idx" ON "TourSlot"("experienceId", "status", "startsAt");

-- CreateIndex
CREATE INDEX "TourSlot_guideId_startsAt_idx" ON "TourSlot"("guideId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "TourSlot_experienceId_startsAt_key" ON "TourSlot"("experienceId", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "SlotReservation_bookingId_key" ON "SlotReservation"("bookingId");

-- CreateIndex
CREATE INDEX "SlotReservation_slotId_status_idx" ON "SlotReservation"("slotId", "status");

-- CreateIndex
CREATE INDEX "SlotReservation_status_expiresAt_idx" ON "SlotReservation"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "GuideScheduleRule_guideId_active_idx" ON "GuideScheduleRule"("guideId", "active");

-- CreateIndex
CREATE INDEX "GuideScheduleRule_guideId_dayOfWeek_idx" ON "GuideScheduleRule"("guideId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "GuideUnavailability_guideId_startsAt_endsAt_idx" ON "GuideUnavailability"("guideId", "startsAt", "endsAt");

-- CreateIndex
CREATE INDEX "BookingEvent_bookingId_createdAt_idx" ON "BookingEvent"("bookingId", "createdAt");

-- CreateIndex
CREATE INDEX "BookingEvent_type_idx" ON "BookingEvent"("type");

-- CreateIndex
CREATE INDEX "BookingEvent_actorId_idx" ON "BookingEvent"("actorId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_providerEventId_key" ON "PaymentEvent"("providerEventId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_idx" ON "PaymentEvent"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_key" ON "Invoice"("invoiceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_bookingId_key" ON "Invoice"("bookingId");

-- CreateIndex
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Invoice_customerUserId_idx" ON "Invoice"("customerUserId");

-- CreateIndex
CREATE INDEX "Booking_slotId_idx" ON "Booking"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TourSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TourSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideScheduleRule" ADD CONSTRAINT "GuideScheduleRule_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GuideUnavailability" ADD CONSTRAINT "GuideUnavailability_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_customerUserId_fkey" FOREIGN KEY ("customerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ===== Phase 1: database-level integrity constraints (raw SQL) =====
-- Prisma schema language cannot express CHECK or EXCLUDE constraints, so they are
-- added here. These operate on newly created (empty) tables and are non-destructive.

-- Required for equality predicates on non-range columns inside a GiST index.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Capacity cannot be non-positive and seat counters must stay within [0, capacity].
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_capacity_positive" CHECK ("capacity" > 0);
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_seats_nonnegative" CHECK ("committedSeats" >= 0 AND "heldSeats" >= 0);
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_seats_within_capacity" CHECK ("committedSeats" + "heldSeats" <= "capacity");
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_party_size_positive" CHECK ("partySize" > 0);

-- A guide cannot be assigned to two non-cancelled slots whose time ranges overlap.
-- Adjacent ranges do not overlap ([) is half-open). Rows without a guide never conflict.
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_guide_no_overlap"
  EXCLUDE USING gist ("guideId" WITH =, tstzrange("startsAt", "endsAt", '[)') WITH &&)
  WHERE ("status" <> 'CANCELLED'::"TourSlotStatus" AND "guideId" IS NOT NULL);
