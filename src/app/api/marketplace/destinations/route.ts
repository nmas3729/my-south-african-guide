import { listPublishedDestinations } from "@/server/marketplace/destinations/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try { return success(await listPublishedDestinations()); } catch (error) { return failure(error); }
}
