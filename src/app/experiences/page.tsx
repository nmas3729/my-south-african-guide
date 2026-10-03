import { MarketplacePage } from "@/components/secondary-page";
import { parseExperienceSearchParams } from "@/lib/marketplace";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "South African Experiences",
  description: "Browse private, local-led experiences across South Africa, from Cape Town to the Kruger and the Winelands.",
  alternates: { canonical: "/experiences" },
};
export default async function ExperiencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const initialSearch = parseExperienceSearchParams(await searchParams);
  return <MarketplacePage kind="experiences" initialSearch={initialSearch} />;
}