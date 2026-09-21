import { listPublishedExperiences } from "@/server/marketplace/experiences/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try { return success(await listPublishedExperiences()); } catch (error) { return failure(error); }
}
