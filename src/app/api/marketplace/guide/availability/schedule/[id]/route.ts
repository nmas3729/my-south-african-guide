import { readJson, protectMutation } from "@/app/api/auth/_shared";
import { failure, success } from "@/app/api/marketplace/_shared";
import { disableMyScheduleRule, updateMyScheduleRule } from "@/server/marketplace/availability/guide-availability";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Context) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    return success(await updateMyScheduleRule(id, await readJson(request)));
  } catch (error) {
    return failure(error);
  }
}

/** Soft-disables the rule; the row is retained so the change can be reversed. */
export async function DELETE(request: Request, context: Context) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    const { id } = await context.params;
    return success(await disableMyScheduleRule(id));
  } catch (error) {
    return failure(error);
  }
}