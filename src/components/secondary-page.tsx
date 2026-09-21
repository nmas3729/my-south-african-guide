import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, MapPin, Star } from "lucide-react";
import { destinations } from "@/lib/marketplace";
import { Footer, MarketplaceResults, Navbar, RequestForm, TrustBadge } from "@/components/marketplace";

const pageImages: Record<string, string> = {
  guides: "https://images.unsplash.com/photo-1516026672322-bc52d61a55d5?auto=format&fit=crop&w=2000&q=85",
  experiences: "https://images.unsplash.com/photo-1539650116574-75c0c6d73f6e?auto=format&fit=crop&w=2000&q=85",
  destinations: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=2000&q=85",
  transport: "https://images.unsplash.com/photo-1518684079-3c830dcef090?auto=format&fit=crop&w=2000&q=85",
};

export function PageHero({ eyebrow, title, copy, image }: { eyebrow: string; title: string; copy: string; image?: string }) {
  return <section className="relative flex min-h-[500px] items-end overflow-hidden bg-ink pb-16 pt-32 text-white"><Image src={image ?? pageImages.experiences} alt="South African landscape" fill priority sizes="100vw" className="object-cover object-center" /><div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,26,43,.88)_0%,rgba(7,26,43,.62)_52%,rgba(7,26,43,.3)_100%)]" /><div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-ink/60 to-transparent" /><Navbar /><div className="relative mx-auto w-full max-w-[1320px] px-5 lg:px-8"><div className="max-w-3xl"><p className="eyebrow text-gold">{eyebrow}</p><h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[.9] tracking-[-0.02em] md:text-7xl xl:text-8xl">{title}</h1><p className="mt-6 max-w-xl text-base leading-relaxed text-white/72 md:text-lg">{copy}</p></div></div></section>;
}

export function MarketplacePage({ kind }: { kind: "guides" | "experiences" | "destinations" }) {
  const config = {
    guides: ["The people who know", "Meet your local experts.", "Historians, conservationists, creatives and storytellers, ready to show you their South Africa."],
    experiences: ["Go deeper", "Find your kind of South Africa.", "Thoughtful, local-led experiences for travellers who want to feel a place, not just see it."],
    destinations: ["Nine provinces, one remarkable country", "Where will your story begin?", "Explore landscapes, cities and communities, each with their own distinct rhythm and welcome."],
  }[kind];
  return <main><PageHero eyebrow={config[0]} title={config[1]} copy={config[2]} image={pageImages[kind]} /><section className="bg-cream px-5 py-20 lg:px-8"><div className="mx-auto max-w-[1320px]">{kind !== "destinations" ? <MarketplaceResults kind={kind} /> : <div className="grid gap-4 md:grid-cols-3">{destinations.map((item) => <Link href={`/destinations/${item.slug}`} key={item.slug} className="ambient-card group relative block aspect-[.82] overflow-hidden rounded-[6px] border border-ink/10"><Image src={item.heroImage} alt={item.name} fill sizes="33vw" className="object-cover transition duration-700 group-hover:scale-105" /><div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent" /><div className="absolute bottom-0 p-6 text-white"><p className="eyebrow text-gold">{item.province}</p><h2 className="mt-2 font-serif text-3xl">{item.name}</h2><p className="mt-2 text-xs text-white/70">{item.description}</p></div></Link>)}</div>}</div></section><Footer /></main>;
}

export function DetailPage({ title, eyebrow, copy, image, story, highlights = [], requestSubject = title, ctaLabel = "Request to Book" }: { title: string; eyebrow: string; copy: string; image: string; story?: string; highlights?: string[]; requestSubject?: string; ctaLabel?: string }) {
  return <main><PageHero eyebrow={eyebrow} title={title} copy={copy} image={image} /><section className="bg-cream px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-[1100px] gap-12 lg:grid-cols-[1.2fr_.8fr]"><div><p className="eyebrow">The story</p><h2 className="mt-3 font-serif text-5xl text-ink">A little more than a holiday.</h2><p className="mt-6 text-base leading-8 text-ink/65">{story ?? "The best journeys are made of the details: the road your guide chooses, the table you would never find alone, the story that changes how you see a place. We make room for all of it."}</p><p className="mt-5 text-base leading-8 text-ink/65">Every host on My South African Guide is verified, locally rooted and committed to sharing a thoughtful version of home.</p><Link href="#request" className="mt-8 inline-flex items-center gap-3 bg-red px-6 py-4 text-xs font-bold uppercase tracking-[.14em] text-white transition hover:bg-[#961a1f]">{ctaLabel} <ArrowRight size={16} /></Link></div><div className="rounded-[6px] border border-ink/10 bg-white p-6 shadow-[0_15px_35px_rgba(7,26,43,0.05)]"><TrustBadge>Verified local host</TrustBadge><div className="mt-8 space-y-5 text-sm text-ink/65"><p className="flex gap-3"><MapPin size={17} className="shrink-0 text-gold" />South Africa, seen through local eyes</p><p className="flex gap-3"><Star size={17} className="shrink-0 text-gold" />Thoughtful, highly rated experiences</p><p className="flex gap-3"><Check size={17} className="shrink-0 text-gold" />Personal support from first hello to last day</p>{highlights.map((highlight) => <p key={highlight} className="flex gap-3"><Check size={17} className="shrink-0 text-gold" />{highlight}</p>)}</div></div><div id="request" className="lg:col-span-2"><RequestForm title={ctaLabel} subject={requestSubject} /></div></div></section><Footer /></main>;
}