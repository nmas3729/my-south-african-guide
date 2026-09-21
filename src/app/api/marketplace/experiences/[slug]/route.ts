import { getPublishedExperienceBySlug } from "@/server/marketplace/experiences/service";
import { failure, success } from "@/app/api/marketplace/_shared";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try { return success(await getPublishedExperienceBySlug((await context.params).slug)); } catch (error) { return failure(error); }
}
