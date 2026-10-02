/*
  Warnings:

  - A unique constraint covering the columns `[travellerId,reservationIdempotencyKey]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `endTimeLocal` to the `AvailabilityRule` table without a default value. This is not possible if the table is not empty.
  - Made the column `bookingId` on table `SlotReservation` required. This step will fail if there are existing NULL values in that column.
  - Made the column `guideId` on table `TourSlot` required. This step will fail if there are existing NULL values in that column.
  - Made the column `timezone` on table `TourSlot` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingEventType" ADD VALUE 'RESERVATION_HELD';
ALTER TYPE "BookingEventType" ADD VALUE 'RESERVATION_CONFIRMED';
ALTER TYPE "BookingEventType" ADD VALUE 'RESERVATION_RELEASED';
ALTER TYPE "BookingEventType" ADD VALUE 'RESERVATION_EXPIRED';
ALTER TYPE "BookingEventType" ADD VALUE 'RESERVATION_CANCELLED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SlotReservationStatus" ADD VALUE 'CONFIRMED';
ALTER TYPE "SlotReservationStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_slotId_fkey";

-- DropForeignKey
ALTER TABLE "SlotReservation" DROP CONSTRAINT "SlotReservation_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "TourSlot" DROP CONSTRAINT "TourSlot_guideId_fkey";

-- DropIndex
DROP INDEX "SlotReservation_slotId_status_idx";

-- AlterTable
ALTER TABLE "AvailabilityRule" ADD COLUMN     "endTimeLocal" VARCHAR(5) NOT NULL;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "reservationIdempotencyKey" VARCHAR(128),
ADD COLUMN     "reservationRequestHash" VARCHAR(64);

-- AlterTable
ALTER TABLE "BookingEvent" ADD COLUMN     "reservationId" TEXT;

-- AlterTable
ALTER TABLE "SlotReservation" ALTER COLUMN "bookingId" SET NOT NULL,
ALTER COLUMN "expiresAt" SET DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 minutes');

-- AlterTable
ALTER TABLE "TourSlot" ADD COLUMN     "privateBookingEnabled" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "guideId" SET NOT NULL,
ALTER COLUMN "timezone" SET NOT NULL;

-- CreateTable
CREATE TABLE "ExperienceGuide" (
    "experienceId" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExperienceGuide_pkey" PRIMARY KEY ("experienceId","guideId")
);

-- CreateIndex
CREATE INDEX "ExperienceGuide_guideId_experienceId_idx" ON "ExperienceGuide"("guideId", "experienceId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_travellerId_reservationIdempotencyKey_key" ON "Booking"("travellerId", "reservationIdempotencyKey");

-- CreateIndex
CREATE INDEX "BookingEvent_reservationId_createdAt_idx" ON "BookingEvent"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "SlotReservation_slotId_status_expiresAt_idx" ON "SlotReservation"("slotId", "status", "expiresAt");

-- CreateIndex
CREATE INDEX "TourSlot_status_startsAt_idx" ON "TourSlot"("status", "startsAt");

-- AddForeignKey
ALTER TABLE "ExperienceGuide" ADD CONSTRAINT "ExperienceGuide_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "Experience"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExperienceGuide" ADD CONSTRAINT "ExperienceGuide_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TourSlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_guideId_fkey" FOREIGN KEY ("guideId") REFERENCES "GuideProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SlotReservation" ADD CONSTRAINT "SlotReservation_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookingEvent" ADD CONSTRAINT "BookingEvent_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "SlotReservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Recurring availability is a same-day local-time range. Canonical HH:mm strings
-- make lexicographic ordering equivalent to wall-clock ordering.
ALTER TABLE "AvailabilityRule"
  ADD CONSTRAINT "AvailabilityRule_end_time_format"
    CHECK ("endTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "AvailabilityRule_time_range"
    CHECK ("startTimeLocal" < "endTimeLocal");

-- Held reservations always carry a future expiry relative to their creation.
ALTER TABLE "SlotReservation"
  ADD CONSTRAINT "SlotReservation_held_expiry_valid"
    CHECK ("status" <> 'HELD'::"SlotReservationStatus" OR ("expiresAt" IS NOT NULL AND "expiresAt" > "createdAt"));

-- A slot-linked booking carries the complete concrete slot snapshot.
ALTER TABLE "Booking"
  ADD CONSTRAINT "Booking_slot_snapshot_complete"
    CHECK ("slotId" IS NULL OR ("startsAt" IS NOT NULL AND "endsAt" IS NOT NULL AND "timezone" IS NOT NULL AND length(btrim("timezone")) > 0));

ALTER TABLE "TourSlot"
  ADD CONSTRAINT "TourSlot_timezone_nonempty"
    CHECK (length(btrim("timezone")) > 0);
