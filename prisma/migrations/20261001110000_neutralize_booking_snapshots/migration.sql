-- Do not encode unapproved private-tour, fee, discount, or VAT decisions as defaults.
-- Existing values are intentionally preserved for review; only future writes become nullable.
ALTER TABLE "Booking"
  ALTER COLUMN "discountAmount" DROP NOT NULL,
  ALTER COLUMN "discountAmount" DROP DEFAULT,
  ALTER COLUMN "extrasAmount" DROP NOT NULL,
  ALTER COLUMN "extrasAmount" DROP DEFAULT,
  ALTER COLUMN "guideFeeAmount" DROP NOT NULL,
  ALTER COLUMN "guideFeeAmount" DROP DEFAULT,
  ALTER COLUMN "privateGuide" DROP NOT NULL,
  ALTER COLUMN "privateGuide" DROP DEFAULT,
  ALTER COLUMN "vatAmount" DROP NOT NULL,
  ALTER COLUMN "vatAmount" DROP DEFAULT;
