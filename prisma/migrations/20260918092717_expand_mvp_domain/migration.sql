/*
  Warnings:

  - A unique constraint covering the columns `[confirmationReference]` on the table `Booking` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'REJECTED', 'HIDDEN');

-- CreateEnum
CREATE TYPE "DestinationStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "BookingStatus" ADD VALUE 'DECLINED';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "acceptedAt" TIMESTAMP(3),
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "completedAt" TIMESTAMP(3),
ADD COLUMN     "confirmationReference" TEXT,
ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "declinedAt" TIMESTAMP(3),
ADD COLUMN     "travellerMessage" TEXT;

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "DestinationStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Experience" ADD COLUMN     "category" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "summary" TEXT;

-- AlterTable
ALTER TABLE "ExperienceImage" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "profileImage" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "verificationDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ReviewStatus" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "firstName" TEXT,
ADD COLUMN     "lastName" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "VerificationDocument" RENAME COLUMN "documentUrl" TO "storageReference";

ALTER TABLE "VerificationDocument" ADD COLUMN "rejectionReason" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Booking_confirmationReference_key" ON "Booking"("confirmationReference");

-- CreateIndex
CREATE INDEX "Destination_status_province_idx" ON "Destination"("status", "province");

-- CreateIndex
CREATE INDEX "GuideProfile_active_verificationStatus_idx" ON "GuideProfile"("active", "verificationStatus");

-- CreateIndex
CREATE INDEX "Review_status_createdAt_idx" ON "Review"("status", "createdAt");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE INDEX "User_emailVerifiedAt_idx" ON "User"("emailVerifiedAt");
