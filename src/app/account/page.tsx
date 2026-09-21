import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/auth-forms";
import { getCurrentUser } from "@/server/auth/session";

export const metadata = { title: "Your account | My South African Guide" };

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?returnTo=/account");
  return <main className="min-h-screen bg-cream px-5 py-10 text-ink lg:px-8"><div className="mx-auto max-w-[900px]"><div className="flex items-center justify-between gap-6"><Link href="/" className="text-[11px] font-bold uppercase tracking-[.18em] text-red">My South African Guide</Link><LogoutButton /></div><section className="mt-16 rounded bg-white p-6 shadow-lg md:p-10"><p className="eyebrow">Your account</p><h1 className="mt-4 font-serif text-6xl leading-[.9]">Welcome{user.firstName ? `, ${user.firstName}` : " back"}.</h1><div className="mt-10 grid gap-4 sm:grid-cols-2"><div className="border border-ink/10 p-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-ink/45">Name</p><p className="mt-2 text-sm">{[user.firstName, user.lastName].filter(Boolean).join(" ") || "Not provided"}</p></div><div className="border border-ink/10 p-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-ink/45">Email</p><p className="mt-2 break-words text-sm">{user.email}</p></div><div className="border border-ink/10 p-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-ink/45">Account type</p><p className="mt-2 text-sm">{user.role}</p></div><div className="border border-ink/10 p-5"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-ink/45">Email status</p><p className="mt-2 text-sm">{user.emailVerifiedAt ? "Verified" : "Awaiting verification"}</p></div></div><p className="mt-8 text-sm text-ink/60">Your account is active. Account tools will be added in a later phase.</p></section></div></main>;
}
