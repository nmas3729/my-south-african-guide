import { MarketplacePage } from "@/components/secondary-page";
import type { Metadata } from "next";
export const metadata: Metadata = {
  title: "South Africa Destinations",
  description: "Explore all nine provinces of South Africa, from Cape Town and the coast to vibrant cities, mountain landscapes and wildlife regions.",
  alternates: { canonical: "/destinations" },
};
export default function DestinationsPage() { return <MarketplacePage kind="destinations" />; }