import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ExperienceDetailPage } from "@/components/marketplace-details";
import { experiences } from "@/data/site";
import { getExperienceBySlug, getGuideBySlug, getReviewsForExperience } from "@/lib/marketplace";
export function generateStaticParams() { return experiences.map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const item = getExperienceBySlug((await params).slug); if (!item) return { title: "Experience not found | My South African Guide" }; const description = `${item.description} ${item.category} in ${item.province}, lasting ${item.duration}.`; return { title: `${item.title} | My South African Guide`, description, openGraph: { title: item.title, description, images: [item.image, ...item.gallery] } }; }
export default async function ExperienceDetail({ params }: { params: Promise<{ slug: string }> }) { const item = getExperienceBySlug((await params).slug); if (!item) notFound(); return <ExperienceDetailPage experience={item} guide={item.guideSlug ? getGuideBySlug(item.guideSlug) : undefined} reviews={getReviewsForExperience(item.slug)} />; }
