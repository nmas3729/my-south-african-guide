import { NextResponse } from "next/server";
import { mapDomainError } from "@/server/marketplace/shared/errors";

export function success<T>(data: T): NextResponse {
  return NextResponse.json({ data });
}

export function failure(error: unknown): NextResponse {
  const mapped = mapDomainError(error);
  return NextResponse.json(mapped.body, { status: mapped.status });
}
