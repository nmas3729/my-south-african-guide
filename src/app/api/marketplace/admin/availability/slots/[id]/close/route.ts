import { protectMutation } from "@/app/api/auth/_shared";
import { failure, success } from "@/app/api/marketplace/_shared";
import { closeTourSlot } from "@/server/marketplace/availability/slot-lifecycle";

type Context = { params: Promise<{ id: string }> };

/**
 * Takes a concrete departure out of service. The request body is deliberately ignored: the only
 * outcome is OPEN -> CLOSED, and generator-owned fields are never writable here.
 */
export async function POST(request: Request, context: Context) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    return success(await closeTourSlot(id));
  } catch (error) {
    return failure(error);
  }
}