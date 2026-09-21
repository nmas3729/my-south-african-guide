-- AlterEnum
ALTER TYPE "VerificationStatus" ADD VALUE 'PENDING';

-- AlterTable
ALTER TABLE "Destination" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Review" ALTER COLUMN "updatedAt" DROP DEFAULT;
