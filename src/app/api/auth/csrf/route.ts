import { NextResponse } from "next/server";
import { issueCsrfToken } from "@/server/auth/csrf";

export async function GET() {
  const token = await issueCsrfToken();
  return NextResponse.json({ csrfToken: token });
}
