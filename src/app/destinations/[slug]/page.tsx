import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { DetailPage } from "@/components/secondary-page";
import { destinations } from "@/data/site";
import { getDestinationBySlug } from "@/lib/marketplace";
export function generateStaticParams() { return destinations.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const destination = getDestinationBySlug((await params).slug); if (!destination) return { title: "Destination not found | My South African Guide" }; const title = `${destination.name} | My South African Guide`; return { title, description: destination.description, openGraph: { title, description: destination.description, images: [destination.heroImage, ...destination.gallery] } }; }
export default async function DestinationDetail({ params }: { params: Promise<{ slug: string }> }) { const destination = getDestinationBySlug((await params).slug); if (!destination) notFound(); return <DetailPage eyebrow={destination.province} title={destination.name} copy={destination.description} image={destination.heroImage} story={destination.description} highlights={destination.popularExperiences} requestSubject={`Plan a journey in ${destination.province}`} ctaLabel="Plan My Journey" />; }
