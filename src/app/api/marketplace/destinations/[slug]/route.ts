import { getPublishedDestinationBySlug, listPublishedExperiencesForDestination } from "@/server/marketplace/destinations/service";
import { failure, success } from "@/app/api/marketplace/_shared";

type Context = { params: Promise<{ slug: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    const destination = await getPublishedDestinationBySlug(slug);
    const experiences = await listPublishedExperiencesForDestination(destination.id);
    return success({ destination, experiences });
  } catch (error) { return failure(error); }
}
