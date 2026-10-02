-- Phase 1 follow-up: preserve UTC semantics while tightening future writes.
-- Existing timestamp-without-time-zone values are interpreted as UTC.

-- Drop one-payment-per-booking and globally-scoped provider event uniqueness.
DROP INDEX "Payment_bookingId_key";
DROP INDEX "PaymentEvent_providerEventId_key";

-- Convert new booking-domain timestamps deterministically rather than relying on
-- the PostgreSQL server/session timezone.
ALTER TABLE "AvailabilityException"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "AvailabilityRule"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "BookingEvent"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "GuideScheduleRule"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "GuideUnavailability"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Invoice"
  ALTER COLUMN "issuedAt" TYPE TIMESTAMPTZ(3) USING "issuedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "dueAt" TYPE TIMESTAMPTZ(3) USING "dueAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "Payment"
  ALTER COLUMN "failedAt" TYPE TIMESTAMPTZ(3) USING "failedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "paidAt" TYPE TIMESTAMPTZ(3) USING "paidAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "PaymentEvent"
  ALTER COLUMN "processedAt" TYPE TIMESTAMPTZ(3) USING "processedAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC';

ALTER TABLE "SlotReservation"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

ALTER TABLE "TourSlot"
  ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ(3) USING "createdAt" AT TIME ZONE 'UTC',
  ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ(3) USING "updatedAt" AT TIME ZONE 'UTC';

-- Restore defaults after PostgreSQL rewrites the column types.
ALTER TABLE "AvailabilityException" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "AvailabilityRule" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "BookingEvent" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GuideScheduleRule" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "GuideUnavailability" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Invoice" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "PaymentEvent" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "SlotReservation" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "TourSlot" ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP, ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

-- Schedule inputs and concrete time ranges must be internally valid.
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_day_of_week_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_start_time_format" CHECK ("startTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_duration_positive" CHECK ("durationMinutes" IS NULL OR "durationMinutes" > 0);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_capacity_positive" CHECK ("capacityOverride" IS NULL OR "capacityOverride" > 0);
ALTER TABLE "AvailabilityRule" ADD CONSTRAINT "AvailabilityRule_season_order" CHECK ("seasonStartDate" IS NULL OR "seasonEndDate" IS NULL OR "seasonStartDate" <= "seasonEndDate");
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_time_order" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");
ALTER TABLE "AvailabilityException" ADD CONSTRAINT "AvailabilityException_capacity_positive" CHECK ("capacityOverride" IS NULL OR "capacityOverride" > 0);
ALTER TABLE "TourSlot" ADD CONSTRAINT "TourSlot_time_order" CHECK ("startsAt" < "endsAt");
ALTER TABLE "GuideScheduleRule" ADD CONSTRAINT "GuideScheduleRule_day_of_week_range" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
ALTER TABLE "GuideScheduleRule" ADD CONSTRAINT "GuideScheduleRule_start_time_format" CHECK ("startTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "GuideScheduleRule" ADD CONSTRAINT "GuideScheduleRule_end_time_format" CHECK ("endTimeLocal" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
ALTER TABLE "GuideScheduleRule" ADD CONSTRAINT "GuideScheduleRule_effective_order" CHECK ("effectiveFrom" IS NULL OR "effectiveTo" IS NULL OR "effectiveFrom" <= "effectiveTo");
ALTER TABLE "GuideUnavailability" ADD CONSTRAINT "GuideUnavailability_time_order" CHECK ("startsAt" < "endsAt");
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_time_order" CHECK ("startsAt" IS NULL OR "endsAt" IS NULL OR "startsAt" < "endsAt");

-- Payment retries are separate attempts; webhook event IDs are unique per provider.
CREATE INDEX "Payment_bookingId_idx" ON "Payment"("bookingId");
CREATE UNIQUE INDEX "PaymentEvent_provider_providerEventId_key" ON "PaymentEvent"("provider", "providerEventId");
