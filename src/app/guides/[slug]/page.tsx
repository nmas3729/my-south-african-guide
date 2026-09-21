import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { GuideProfilePage } from "@/components/marketplace-details";
import { getExperiencesForGuide, getGuideBySlug, getGuides, getReviewsForGuide } from "@/lib/marketplace";
export function generateStaticParams() { return getGuides().map(({ slug }) => ({ slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const guide = getGuideBySlug((await params).slug); if (!guide) return { title: "Guide not found | My South African Guide" }; const title = `Meet ${guide.name} - Verified South African Tour Guide`; const description = `${guide.biography} ${guide.specialities.join(" and ")} in ${guide.province}.`; return { title, description, openGraph: { title, description, images: [guide.profileImage] } }; }
export default async function GuideDetail({ params }: { params: Promise<{ slug: string }> }) { const guide = getGuideBySlug((await params).slug); if (!guide) notFound(); return <GuideProfilePage guide={guide} experiences={getExperiencesForGuide(guide.slug)} reviews={getReviewsForGuide(guide.slug)} />; }
