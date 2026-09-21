/*
  Warnings:

  - A unique constraint covering the columns `[slug]` on the table `GuideProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "slug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "GuideProfile_slug_key" ON "GuideProfile"("slug");
