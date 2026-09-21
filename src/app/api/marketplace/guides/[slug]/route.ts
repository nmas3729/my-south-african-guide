import { getPublicGuideBySlug } from "@/server/marketplace/guides/service";
import { failure, success } from "@/app/api/marketplace/_shared";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try { return success(await getPublicGuideBySlug((await context.params).slug)); } catch (error) { return failure(error); }
}
