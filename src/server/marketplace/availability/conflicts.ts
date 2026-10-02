import { ConflictError } from "../shared/errors";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function isGuideOverlapConstraintViolation(error: unknown, depth = 0): boolean {
  if (!isRecord(error) || depth > 5) return false;
  if (error.code === "23P01" || error.constraint === "TourSlot_guide_no_overlap") return true;
  if (typeof error.message === "string" && (error.message.includes("23P01") || error.message.includes("TourSlot_guide_no_overlap"))) return true;
  return isGuideOverlapConstraintViolation(error.cause, depth + 1)
    || isGuideOverlapConstraintViolation(error.meta, depth + 1)
    || isGuideOverlapConstraintViolation(error.originalError, depth + 1);
}

export function throwMappedSlotGenerationError(error: unknown): never {
  if (isGuideOverlapConstraintViolation(error)) {
    throw new ConflictError("The assigned guide already has an overlapping departure.", { cause: error });
  }
  throw error;
}