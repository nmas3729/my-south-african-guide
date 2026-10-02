import { z } from "zod";
import { ValidationError } from "../shared/errors";
import { addCalendarDays, assertValidIanaTimezone, assertValidIsoDate, assertValidLocalTime, resolveLocalDateTime } from "./time";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const generateAvailabilityInputSchema = z.object({
  experienceId: z.string().trim().min(1).max(128),
  dateFrom: isoDate,
  dateTo: isoDate,
  guideId: z.string().trim().min(1).max(128).optional(),
  capacity: z.number().int().min(1).max(1_000).optional(),
}).strict();

export const availabilityRangeSchema = z.object({
  dateFrom: isoDate,
  dateTo: isoDate,
}).strict();

export type GenerateAvailabilityInput = z.infer<typeof generateAvailabilityInputSchema>;
export type AvailabilityRangeInput = z.infer<typeof availabilityRangeSchema>;

// A guide never supplies their own identifier: it is always derived from the authenticated session.
// Both schemas are `.strict()`, so a client-supplied `guideId` is rejected outright.
const guideScheduleRuleFields = {
  dayOfWeek: z.number().int().min(0).max(6),
  startTimeLocal: z.string().trim().min(1).max(5),
  endTimeLocal: z.string().trim().min(1).max(5),
  effectiveFrom: isoDate.nullable().optional(),
  effectiveTo: isoDate.nullable().optional(),
};

export const guideScheduleRuleInputSchema = z.object(guideScheduleRuleFields).strict();
export const guideScheduleRuleUpdateSchema = z.object(guideScheduleRuleFields).partial().strict().refine((value) => Object.keys(value).length > 0, { message: "At least one field must be supplied." });

const instantSchema = z.union([z.string().min(1), z.coerce.date()]).transform((value) => (value instanceof Date ? value : new Date(value)));

export const guideUnavailabilityInputSchema = z.object({
  startsAt: instantSchema,
  endsAt: instantSchema,
  allDay: z.boolean().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict().refine((value) => !Number.isNaN(value.startsAt.getTime()) && !Number.isNaN(value.endsAt.getTime()), {
  message: "Invalid unavailability instants.",
  path: ["startsAt"],
});

export type GuideScheduleRuleInput = Omit<z.infer<typeof guideScheduleRuleInputSchema>, "effectiveFrom" | "effectiveTo"> & {
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
};
export type GuideScheduleRuleUpdate = z.infer<typeof guideScheduleRuleUpdateSchema>;
export type GuideUnavailabilityInput = z.infer<typeof guideUnavailabilityInputSchema>;

// Phase 2C reservation input. The traveller is never supplied by the client: ownership is derived
// from the authenticated session. `idempotencyKey` is required so a retry is always safe.
export const reservationRequestSchema = z.object({
  slotId: z.string().trim().min(1).max(128),
  partySize: z.number().int().min(1).max(100),
  idempotencyKey: z.string().trim().min(8).max(128),
  travellerMessage: z.string().trim().max(5_000).nullable().optional(),
}).strict();

export type ReservationRequest = z.infer<typeof reservationRequestSchema>;

export function configuredAvailabilityHorizonDays(): number {
  const configured = process.env.AVAILABILITY_GENERATION_HORIZON_DAYS;
  if (configured === undefined || configured === "") return 90;
  if (!/^\d+$/.test(configured)) throw new ValidationError("AVAILABILITY_GENERATION_HORIZON_DAYS must be an integer from 1 to 365.");
  const days = Number(configured);
  if (!Number.isSafeInteger(days) || days < 1 || days > 365) throw new ValidationError("AVAILABILITY_GENERATION_HORIZON_DAYS must be an integer from 1 to 365.");
  return days;
}

export function validateAvailabilityDateRange(dateFrom: string, dateTo: string, timezone: string, now = new Date(), horizonDays = configuredAvailabilityHorizonDays()): void {
  assertValidIsoDate(dateFrom);
  assertValidIsoDate(dateTo);
  const canonicalTimezone = assertValidIanaTimezone(timezone);
  const fromMs = Date.parse(`${dateFrom}T00:00:00.000Z`);
  const toMs = Date.parse(`${dateTo}T00:00:00.000Z`);
  const windowDays = (toMs - fromMs) / 86_400_000;
  if (windowDays <= 0) throw new ValidationError("dateTo must be later than dateFrom.");
  if (windowDays > horizonDays) throw new ValidationError(`The requested date range cannot exceed ${horizonDays} days.`);

  const today = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-nu-latn", { timeZone: canonicalTimezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  if (dateFrom < today) throw new ValidationError("Availability generation cannot start before today in the experience timezone.");
  if (dateTo > addCalendarDays(today, horizonDays)) throw new ValidationError(`Availability generation cannot extend beyond ${horizonDays} days from today.`);
}

export function assertValidAvailabilityGenerationInput(input: unknown): GenerateAvailabilityInput {
  const parsed = generateAvailabilityInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid availability generation request.", { cause: parsed.error });
  return parsed.data;
}

export function assertValidAvailabilityRange(input: unknown): AvailabilityRangeInput {
  const parsed = availabilityRangeSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("A valid dateFrom and dateTo range is required.", { cause: parsed.error });
  return parsed.data;
}

/** Applies the same wall-time and DST rules the generator uses to a schedule rule payload. */
function assertUsableScheduleWindow(input: { startTimeLocal: string; endTimeLocal: string }, timezone: string): void {
  const startMinute = assertValidLocalTime(input.startTimeLocal);
  const endMinute = assertValidLocalTime(input.endTimeLocal);
  if (startMinute >= endMinute) throw new ValidationError("A schedule window must end after it starts.");
  // Surfaces nonexistent and ambiguous wall times today, matching generator behaviour.
  resolveLocalDateTime("2026-01-01", input.startTimeLocal, timezone);
  resolveLocalDateTime("2026-01-01", input.endTimeLocal, timezone);
}

/** `YYYY-MM-DD` -> a UTC-midnight instant, which is how `@db.Date` columns are stored and read back. */
function toDateColumnValue(date: string): Date {
  return new Date(`${assertValidIsoDate(date)}T00:00:00.000Z`);
}

export function assertValidGuideScheduleRuleInput(input: unknown, timezone: string): GuideScheduleRuleInput {
  const parsed = guideScheduleRuleInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid guide schedule rule.", { cause: parsed.error });
  const data = parsed.data;
  const effectiveFrom = data.effectiveFrom === undefined || data.effectiveFrom === null ? null : toDateColumnValue(data.effectiveFrom);
  const effectiveTo = data.effectiveTo === undefined || data.effectiveTo === null ? null : toDateColumnValue(data.effectiveTo);
  if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) throw new ValidationError("effectiveFrom cannot be later than effectiveTo.");
  assertUsableScheduleWindow(data, timezone);
  return { ...data, effectiveFrom, effectiveTo };
}

export function assertValidGuideScheduleRuleUpdate(input: unknown, timezone: string): GuideScheduleRuleUpdate {
  const parsed = guideScheduleRuleUpdateSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid guide schedule rule update.", { cause: parsed.error });
  const data = parsed.data;
  if (data.startTimeLocal !== undefined && data.endTimeLocal !== undefined) assertUsableScheduleWindow({ startTimeLocal: data.startTimeLocal, endTimeLocal: data.endTimeLocal }, timezone);
  for (const key of ["effectiveFrom", "effectiveTo"] as const) {
    if (data[key] !== undefined && data[key] !== null) toDateColumnValue(data[key] as string);
  }
  return data;
}

export function assertValidGuideUnavailabilityInput(input: unknown): GuideUnavailabilityInput {
  const parsed = guideUnavailabilityInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid guide unavailability window.", { cause: parsed.error });
  const data = parsed.data;
  if (data.startsAt >= data.endsAt) throw new ValidationError("An unavailability window must end after it starts.");
  return data;
}