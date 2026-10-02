import { readJson, protectMutation } from "@/app/api/auth/_shared";
import { failure, success } from "@/app/api/marketplace/_shared";
import { generateExperienceSlots } from "@/server/marketplace/availability/service";

export async function POST(request: Request) {
  const blocked = await protectMutation(request, "availability");
  if (blocked) return blocked;

  try {
    return success(await generateExperienceSlots(await readJson(request)));
  } catch (error) {
    return failure(error);
  }
}