import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Clock3, Languages, MapPin, MessageCircle, ShieldCheck, Star, Tag, UsersRound } from "lucide-react";
import type { Experience, Guide, Review } from "@/data/site";
import { ExperienceCard, Footer, Navbar, RequestForm, TrustBadge } from "@/components/marketplace";
import { formatExperiencePrice } from "@/lib/marketplace";

function RatingSummary({ rating, reviewCount }: { rating: number; reviewCount: number }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm text-white/80">
      <span className="flex items-center gap-1.5 font-semibold text-white"><Star size={16} fill="currentColor" className="text-gold" />{rating.toFixed(2)}</span>
      <span className="text-white/50">{reviewCount} traveller reviews</span>
    </div>
  );
}

function DetailHero({ eyebrow, title, image, alt, children }: { eyebrow: string; title: string; image: string; alt: string; children: React.ReactNode }) {
  return (
    <section className="relative overflow-hidden bg-ink text-white">
      <div className="relative min-h-[620px] md:min-h-[700px]">
        <Image src={image} alt={alt} fill priority sizes="100vw" className="object-cover object-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,26,43,.9)_0%,rgba(7,26,43,.58)_48%,rgba(7,26,43,.2)_100%)]" />
        <Navbar />
        <div className="relative mx-auto flex min-h-[620px] max-w-[1320px] items-end px-5 pb-16 pt-32 md:min-h-[700px] md:pb-24 lg:px-8">
          <div className="max-w-3xl"><p className="eyebrow text-gold">{eyebrow}</p><h1 className="mt-5 max-w-3xl font-serif text-6xl leading-[.88] md:text-8xl">{title}</h1>{children}</div>
        </div>
      </div>
    </section>
  );
}

function InfoCard({ icon: Icon, label, children }: { icon: typeof Clock3; label: string; children: React.ReactNode }) {
  return <div className="border border-ink/10 bg-white p-5"><Icon size={19} className="text-gold" /><p className="mt-5 text-[10px] font-bold uppercase tracking-[.16em] text-ink/45">{label}</p><div className="mt-2 text-sm leading-relaxed text-ink">{children}</div></div>;
}

function SectionTitle({ eyebrow, title, copy }: { eyebrow: string; title: string; copy?: string }) {
  return <div className="max-w-2xl"><p className="eyebrow">{eyebrow}</p><h2 className="mt-3 font-serif text-5xl leading-[.95] text-ink md:text-6xl">{title}</h2>{copy && <p className="mt-5 text-base leading-7 text-ink/60">{copy}</p>}</div>;
}

function ReviewPreview({ reviews }: { reviews: Review[] }) {
  if (!reviews.length) return null;
  return <div className="mt-8 space-y-4">{reviews.slice(0, 2).map((review) => <blockquote key={review.id} className="border-l-2 border-gold pl-4 text-sm leading-6 text-ink/70">“{review.comment}”<footer className="mt-2 text-xs text-ink/45">{review.travellerName}, {review.country}</footer></blockquote>)}</div>;
}

function MobileRequestBar({ label }: { label: string }) {
  return <div className="fixed inset-x-0 bottom-0 z-30 border-t border-white/10 bg-ink/95 p-3 backdrop-blur md:hidden"><Link href="#request" className="flex min-h-12 items-center justify-center gap-2 bg-red px-5 text-xs font-bold uppercase tracking-[.14em] text-white">{label}<ArrowRight size={15} /></Link></div>;
}

export function GuideProfilePage({ guide, experiences, reviews = [] }: { guide: Guide; experiences: Experience[]; reviews?: Review[] }) {
  return (
    <main className="pb-20 md:pb-0">
      <DetailHero eyebrow={guide.specialities.join(" · ")} title={guide.name} image={guide.profileImage} alt={`Portrait of ${guide.name}`}>
        <div className="mt-7 flex flex-wrap items-center gap-3">{guide.verified && <TrustBadge>Verified local guide</TrustBadge>}<span className="flex items-center gap-2 text-sm text-white/75"><MapPin size={15} className="text-gold" />{guide.location}, {guide.province}</span></div>
        <div className="mt-5"><RatingSummary rating={guide.rating} reviewCount={guide.reviewCount} /></div>
        <Link href="#request" className="mt-8 inline-flex min-h-12 items-center gap-3 bg-red px-5 text-xs font-bold uppercase tracking-[.14em] text-white">Request this guide <ArrowRight size={16} /></Link>
      </DetailHero>
      <section className="bg-cream px-5 py-16 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-3 sm:grid-cols-2 lg:grid-cols-4"><InfoCard icon={Languages} label="Languages">{guide.languages.join(" · ")}</InfoCard><InfoCard icon={MapPin} label="Area covered">{guide.province}</InfoCard><InfoCard icon={Tag} label="Specialities">{guide.specialities.join(" · ")}</InfoCard><InfoCard icon={Star} label="Traveller rating"><span className="font-semibold">{guide.rating.toFixed(2)}</span> from {guide.reviewCount} reviews</InfoCard></div></section>
      <section className="bg-white px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[1.1fr_.9fr]"><div><SectionTitle eyebrow="About the guide" title={`A local perspective on ${guide.province}.`} /><div className="mt-7 max-w-2xl space-y-5 text-base leading-8 text-ink/65"><p>{guide.biography}</p>{guide.yearsExperience > 0 && <p>{guide.name} brings {guide.yearsExperience} years of experience to locally led journeys around {guide.location}.</p>}</div></div><div className="border-l border-ink/10 pl-7 lg:pl-10"><p className="eyebrow">Guide information</p><ul className="mt-6 space-y-5 text-sm leading-6 text-ink/70"><li className="flex gap-3"><Check size={17} className="mt-1 shrink-0 text-gold" />{guide.specialities.join(" and ")}</li>{guide.responseTime && <li className="flex gap-3"><Check size={17} className="mt-1 shrink-0 text-gold" />{guide.responseTime}</li>}{guide.qualifications.length > 0 && <li className="flex gap-3"><Check size={17} className="mt-1 shrink-0 text-gold" />{guide.qualifications.join(" · ")}</li>}</ul></div></div></section>
      <section className="bg-[#eee9df] px-5 py-20 lg:px-8"><div className="mx-auto max-w-[1200px]"><SectionTitle eyebrow="Trust and transparency" title="A profile you can travel with." copy="The details below are based on the current demo marketplace profile." /><div className="mt-10 grid gap-4 md:grid-cols-3"><InfoCard icon={ShieldCheck} label="Verification status">{guide.verified ? "Verified local guide" : "Verification pending"}</InfoCard>{guide.yearsExperience > 0 && <InfoCard icon={Clock3} label="Experience">{guide.yearsExperience} years in the field</InfoCard>}{guide.experienceCount > 0 && <InfoCard icon={Tag} label="Published experiences">{guide.experienceCount}</InfoCard>}</div><ReviewPreview reviews={reviews} /></div></section>
      {experiences.length > 0 && <section className="bg-cream px-5 py-20 lg:px-8"><div className="mx-auto max-w-[1200px]"><SectionTitle eyebrow="From this guide" title="Experiences by this guide." /><div className="mt-10 grid gap-5 md:grid-cols-2">{experiences.map((experience) => <ExperienceCard key={experience.slug} experience={experience} />)}</div></div></section>}
      <section id="request" className="bg-green px-5 py-20 text-white lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-start"><div><p className="eyebrow text-gold">Start a conversation</p><h2 className="mt-4 font-serif text-5xl leading-[.95] md:text-6xl">Ask about travelling with {guide.name.split(" ")[0]}.</h2><p className="mt-6 max-w-md text-sm leading-7 text-white/65">Send an enquiry with your plans. This is a request for more information, not a confirmed booking.</p><div className="mt-7 flex items-center gap-3 text-sm text-white/75"><MessageCircle size={18} className="text-gold" />WhatsApp is available when configured.</div></div><RequestForm title="Request this guide" subject={`Enquiry for ${guide.name}`} /></div></section>
      <Footer /><MobileRequestBar label="Request this guide" />
    </main>
  );
}

export function ExperienceDetailPage({ experience, guide, reviews = [] }: { experience: Experience; guide?: Guide; reviews?: Review[] }) {
  const overview = [[Clock3, "Duration", experience.duration], [MapPin, "Location", experience.location], [UsersRound, "Group size", experience.groupSize], [Tag, "Difficulty", experience.difficulty]] as const;
  return (
    <main className="pb-20 md:pb-0">
      <DetailHero eyebrow={experience.category} title={experience.title} image={experience.image} alt={experience.title}>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-white/75"><span className="flex items-center gap-2"><MapPin size={15} className="text-gold" />{experience.location}, {experience.province}</span><span>{experience.category}</span></div>
        <div className="mt-5"><RatingSummary rating={experience.rating} reviewCount={experience.reviewCount} /></div>
        <div className="mt-6 flex flex-wrap items-end gap-5"><div><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/55">Price indicator</p><p className="mt-1 font-serif text-3xl text-gold">{formatExperiencePrice(experience)}</p></div><Link href="#request" className="inline-flex min-h-12 items-center gap-3 bg-red px-5 text-xs font-bold uppercase tracking-[.14em] text-white">Request booking <ArrowRight size={16} /></Link></div>
      </DetailHero>
      <section className="bg-cream px-5 py-16 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-3 sm:grid-cols-2 lg:grid-cols-4">{overview.map(([Icon, label, value]) => <InfoCard key={label} icon={Icon} label={label}>{value}</InfoCard>)}{experience.languages.length > 0 && <InfoCard icon={Languages} label="Languages">{experience.languages.join(" · ")}</InfoCard>}</div></section>
      <section className="bg-white px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[1.1fr_.9fr]"><div><SectionTitle eyebrow="The experience" title="A day with room for the unexpected." /><p className="mt-7 max-w-2xl text-base leading-8 text-ink/65">{experience.description}</p>{guide && <Link href={`/guides/${guide.slug}`} className="mt-8 inline-flex items-center gap-3 border-b border-ink/20 pb-2 text-xs font-bold uppercase tracking-[.14em] text-red">Meet {guide.name}<ArrowRight size={15} /></Link>}</div><div><p className="eyebrow">Highlights</p><ul className="mt-6 space-y-4">{experience.highlights.map((highlight) => <li key={highlight} className="flex gap-3 border-b border-ink/10 pb-4 text-sm leading-6 text-ink/70"><Check size={17} className="mt-1 shrink-0 text-gold" />{highlight}</li>)}</ul></div></div></section>
      {(experience.included.length > 0 || experience.excluded.length > 0) && <section className="bg-[#eee9df] px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-12 md:grid-cols-2">{experience.included.length > 0 && <div><SectionTitle eyebrow="Included" title="What is part of the experience." /><ul className="mt-7 space-y-4">{experience.included.map((item) => <li key={item} className="flex gap-3 text-sm text-ink/70"><Check size={17} className="mt-1 shrink-0 text-green" />{item}</li>)}</ul></div>}{experience.excluded.length > 0 && <div><SectionTitle eyebrow="Not included" title="What to plan for separately." /><ul className="mt-7 space-y-4">{experience.excluded.map((item) => <li key={item} className="flex gap-3 text-sm text-ink/70"><span className="mt-1 text-red">×</span>{item}</li>)}</ul></div>}</div></section>}
      <section className="bg-cream px-5 py-20 lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[1fr_.8fr]"><div><SectionTitle eyebrow="Meeting point" title={`Start from ${experience.meetingPoint}.`} copy="The exact meeting arrangements can be confirmed during your enquiry. No availability or booking has been assumed." /><div className="mt-8 flex min-h-44 items-center justify-center border border-dashed border-ink/20 bg-white p-8 text-center"><div><MapPin size={24} className="mx-auto text-gold" /><p className="mt-3 text-sm font-semibold text-ink">{experience.meetingPoint}</p><p className="mt-1 text-xs text-ink/55">Map integration can be added here later.</p></div></div></div><div className="border border-ink/10 bg-white p-7"><p className="eyebrow">Good to know</p><div className="mt-6 space-y-5 text-sm leading-6 text-ink/65"><p className="flex gap-3"><Clock3 size={17} className="mt-1 shrink-0 text-gold" />{experience.duration} of local-led exploring</p><p className="flex gap-3"><ShieldCheck size={17} className="mt-1 shrink-0 text-gold" />Enquiry first, with no payment taken here</p><p className="flex gap-3"><Star size={17} className="mt-1 shrink-0 text-gold" />Rated {experience.rating.toFixed(2)} by {experience.reviewCount} travellers</p></div></div></div></section>
      {reviews.length > 0 && <section className="bg-white px-5 py-20 lg:px-8"><div className="mx-auto max-w-[1200px]"><SectionTitle eyebrow="Traveller notes" title="A preview of recent feedback." /><ReviewPreview reviews={reviews} /></div></section>}
      <section id="request" className="bg-green px-5 py-20 text-white lg:px-8"><div className="mx-auto grid max-w-[1200px] gap-12 lg:grid-cols-[.85fr_1.15fr] lg:items-start"><div><p className="eyebrow text-gold">Plan the details</p><h2 className="mt-4 font-serif text-5xl leading-[.95] md:text-6xl">Interested in this experience?</h2><p className="mt-6 max-w-md text-sm leading-7 text-white/65">Choose your dates in the message and send an enquiry. A response is not a booking confirmation.</p></div><RequestForm title="Send an enquiry" subject={`Enquiry for ${experience.title}`} /></div></section>
      <Footer /><MobileRequestBar label="Request this experience" />
    </main>
  );
}
