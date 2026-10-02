import { protectMutation } from "@/app/api/auth/_shared";
import { failure, success } from "@/app/api/marketplace/_shared";
import { removeMyUnavailability } from "@/server/marketplace/availability/guide-availability";

type Context = { params: Promise<{ id: string }> };

/**
 * Hard delete: `GuideUnavailability` has no soft-delete column. Removing a window never reopens
 * the departures it closed; those require an explicit ADMIN close reversal decision.
 */
export async function DELETE(request: Request, context: Context) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    await removeMyUnavailability(id);
    return success({ id, removed: true });
  } catch (error) {
    return failure(error);
  }
}