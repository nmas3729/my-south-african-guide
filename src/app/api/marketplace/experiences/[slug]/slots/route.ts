import { failure, success } from "@/app/api/marketplace/_shared";
import { listBookableSlots } from "@/server/marketplace/availability/slots";

type Context = { params: Promise<{ slug: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { slug } = await context.params;
    const searchParams = new URL(request.url).searchParams;
    return success(await listBookableSlots(slug, {
      dateFrom: searchParams.get("dateFrom"),
      dateTo: searchParams.get("dateTo"),
    }));
  } catch (error) {
    return failure(error);
  }
}