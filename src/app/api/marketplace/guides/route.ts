import { listPublicGuides } from "@/server/marketplace/guides/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try { return success(await listPublicGuides()); } catch (error) { return failure(error); }
}
