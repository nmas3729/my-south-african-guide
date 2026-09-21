import { getMyTravellerProfile } from "@/server/marketplace/travellers/service";
import { failure, success } from "@/app/api/marketplace/_shared";

export async function GET() {
  try { return success(await getMyTravellerProfile()); } catch (error) { return failure(error); }
}
