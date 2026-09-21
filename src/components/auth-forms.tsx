"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AuthUser = { firstName: string | null; lastName: string | null; email: string; role: string; status: string; emailVerifiedAt: string | null };
type FormState = { error: string; success: string; loading: boolean };

const emptyState: FormState = { error: "", success: "", loading: false };

async function csrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!response.ok) throw new Error("Unable to start this request.");
  const data = await response.json() as { csrfToken?: string };
  if (!data.csrfToken) throw new Error("Unable to start this request.");
  return data.csrfToken;
}

async function postAuth(path: string, body: Record<string, string>) {
  const token = await csrfToken();
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-csrf-token": token },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({})) as { error?: string; message?: string; user?: AuthUser };
  if (!response.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data;
}

function AuthShell({ eyebrow, title, copy, children }: { eyebrow: string; title: string; copy: string; children: React.ReactNode }) {
  return <main className="min-h-screen bg-cream px-5 py-10 text-ink lg:px-8"><div className="mx-auto max-w-[1100px]"><Link href="/" className="inline-flex text-[11px] font-bold uppercase tracking-[.18em] text-red">My South African Guide</Link><div className="mt-16 grid gap-12 lg:grid-cols-[.9fr_1.1fr] lg:items-start"><div><p className="eyebrow">{eyebrow}</p><h1 className="mt-4 max-w-xl font-serif text-6xl leading-[.9]">{title}</h1><p className="mt-6 max-w-md text-sm leading-7 text-ink/60">{copy}</p></div><div className="rounded bg-white p-6 shadow-lg md:p-8">{children}</div></div></div></main>;
}

function FormMessage({ state }: { state: FormState }) {
  return <>{state.error && <p role="alert" className="rounded border border-red/20 bg-red/5 px-4 py-3 text-sm text-red">{state.error}</p>}{state.success && <p role="status" className="rounded border border-green/20 bg-green/5 px-4 py-3 text-sm text-green">{state.success}</p>}</>;
}

function PasswordField({ id, label, autoComplete = "new-password" }: { id: string; label: string; autoComplete?: string }) {
  return <div><label htmlFor={id} className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">{label}</label><input id={id} name={id} required type="password" autoComplete={autoComplete} minLength={12} className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div>;
}

export function LoginForm() {
  const [state, setState] = useState(emptyState);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ ...emptyState, loading: true });
    const form = new FormData(event.currentTarget);
    try {
      await postAuth("/api/auth/login", { email: String(form.get("email")), password: String(form.get("password")) });
      const returnTo = new URLSearchParams(window.location.search).get("returnTo");
      window.location.assign(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account");
    } catch (error) { setState({ error: error instanceof Error ? error.message : "Unable to sign in.", success: "", loading: false }); }
  }
  return <AuthShell eyebrow="Welcome back" title="Sign in to your account." copy="Keep your journey details close, with one secure account for every way you travel with us."><form onSubmit={submit} className="space-y-5" noValidate><FormMessage state={state} /><div><label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Email address</label><input id="email" name="email" required type="email" autoComplete="email" className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><PasswordField id="password" label="Password" autoComplete="current-password" /><button disabled={state.loading} className="w-full bg-red px-5 py-4 text-xs font-bold uppercase tracking-[.14em] text-white disabled:cursor-wait disabled:opacity-60">{state.loading ? "Signing in..." : "Sign in"}</button><div className="flex justify-between gap-4 text-xs text-ink/60"><Link href="/forgot-password" className="text-red hover:underline">Forgot password?</Link><Link href="/register" className="text-red hover:underline">Create an account</Link></div></form></AuthShell>;
}

function RegistrationForm({ role }: { role: "TRAVELLER" | "GUIDE" }) {
  const [state, setState] = useState(emptyState);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState({ ...emptyState, loading: true });
    const form = new FormData(event.currentTarget);
    if (form.get("password") !== form.get("confirmPassword")) { setState({ error: "Passwords do not match.", success: "", loading: false }); return; }
    try {
      await postAuth("/api/auth/register", { role, firstName: String(form.get("firstName")), lastName: String(form.get("lastName")), email: String(form.get("email")), password: String(form.get("password")) });
      setState({ error: "", success: role === "GUIDE" ? "Your guide account is ready. Please verify your email; your guide application will then be reviewed." : "Your account is ready. Please check your email to verify your address before signing in.", loading: false });
      event.currentTarget.reset();
    } catch (error) { setState({ error: error instanceof Error ? error.message : "Unable to create your account.", success: "", loading: false }); }
  }
  return <AuthShell eyebrow={role === "GUIDE" ? "For the ones who know" : "Start your journey"} title={role === "GUIDE" ? "Share your South Africa." : "Create your account."} copy={role === "GUIDE" ? "Register as a guide and tell us about the places you know. Guide accounts are subject to verification and approval." : "A simple account for keeping your travel conversations and plans together."}><form onSubmit={submit} className="space-y-5" noValidate><FormMessage state={state} /><div className="grid gap-5 sm:grid-cols-2"><div><label htmlFor="firstName" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">First name</label><input id="firstName" name="firstName" required autoComplete="given-name" maxLength={80} className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><div><label htmlFor="lastName" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Last name</label><input id="lastName" name="lastName" required autoComplete="family-name" maxLength={80} className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div></div><div><label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Email address</label><input id="email" name="email" required type="email" autoComplete="email" className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><PasswordField id="password" label="Password" /><div><label htmlFor="confirmPassword" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Confirm password</label><input id="confirmPassword" name="confirmPassword" required type="password" autoComplete="new-password" minLength={12} className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><button disabled={state.loading} className="w-full bg-red px-5 py-4 text-xs font-bold uppercase tracking-[.14em] text-white disabled:cursor-wait disabled:opacity-60">{state.loading ? "Creating account..." : role === "GUIDE" ? "Apply as a guide" : "Create account"}</button><p className="text-center text-xs text-ink/60">Already have an account? <Link href="/login" className="text-red hover:underline">Sign in</Link></p></form></AuthShell>;
}

export function TravellerRegistrationForm() { return <RegistrationForm role="TRAVELLER" />; }
export function GuideRegistrationForm() { return <RegistrationForm role="GUIDE" />; }

export function ForgotPasswordForm() {
  const [state, setState] = useState(emptyState);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setState({ ...emptyState, loading: true }); const form = new FormData(event.currentTarget); try { const data = await postAuth("/api/auth/forgot-password", { email: String(form.get("email")) }); setState({ error: "", success: data.message ?? "If an account exists, password reset instructions will be sent.", loading: false }); } catch { setState({ error: "Unable to submit the request. Please try again.", success: "", loading: false }); } }
  return <AuthShell eyebrow="Find your way back" title="Reset your password." copy="Enter your email and, if an account exists, we will send reset instructions."><form onSubmit={submit} className="space-y-5" noValidate><FormMessage state={state} /><div><label htmlFor="email" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Email address</label><input id="email" name="email" required type="email" autoComplete="email" className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><button disabled={state.loading} className="w-full bg-red px-5 py-4 text-xs font-bold uppercase tracking-[.14em] text-white disabled:cursor-wait disabled:opacity-60">{state.loading ? "Sending..." : "Send reset instructions"}</button><p className="text-center text-xs text-ink/60"><Link href="/login" className="text-red hover:underline">Back to sign in</Link></p></form></AuthShell>;
}

export function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? ""; const [state, setState] = useState(emptyState);
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); setState({ ...emptyState, loading: true }); const form = new FormData(event.currentTarget); if (!token) { setState({ error: "This reset link is missing or invalid.", success: "", loading: false }); return; } if (form.get("password") !== form.get("confirmPassword")) { setState({ error: "Passwords do not match.", success: "", loading: false }); return; } try { await postAuth("/api/auth/reset-password", { token, password: String(form.get("password")) }); setState({ error: "", success: "Your password has been changed. You can now sign in.", loading: false }); } catch (error) { setState({ error: error instanceof Error ? error.message : "This reset link is invalid or expired.", success: "", loading: false }); } }
  return <AuthShell eyebrow="A fresh start" title="Choose a new password." copy="Use a strong password you do not use elsewhere. Reset links expire and can only be used once."><form onSubmit={submit} className="space-y-5" noValidate><FormMessage state={state} /><PasswordField id="password" label="New password" /><div><label htmlFor="confirmPassword" className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-ink/60">Confirm password</label><input id="confirmPassword" name="confirmPassword" required type="password" autoComplete="new-password" minLength={12} className="w-full border border-ink/15 bg-cream px-4 py-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-gold" /></div><button disabled={state.loading || Boolean(state.success)} className="w-full bg-red px-5 py-4 text-xs font-bold uppercase tracking-[.14em] text-white disabled:cursor-wait disabled:opacity-60">{state.loading ? "Changing password..." : "Change password"}</button>{state.success && <p className="text-center text-xs"><Link href="/login" className="text-red hover:underline">Go to sign in</Link></p>}</form></AuthShell>;
}

export function VerifyEmailForm() {
  const token = useSearchParams().get("token") ?? ""; const [state, setState] = useState<FormState>({ ...emptyState, loading: true });
  useEffect(() => {
    void (async () => {
      if (!token) {
        setState({ error: "This verification link is missing or invalid.", success: "", loading: false });
        return;
      }
      try {
        await postAuth("/api/auth/verify-email", { token });
        setState({ error: "", success: "Your email has been verified. You can now sign in.", loading: false });
      } catch {
        setState({ error: "This verification link is invalid, expired, or already used.", success: "", loading: false });
      }
    })();
  }, [token]);
  return <AuthShell eyebrow="One last step" title="Verify your email." copy="Email verification keeps your account secure and helps us keep future conversations connected to you."><div className="space-y-5"><FormMessage state={state} />{state.loading && <p role="status" className="text-sm text-ink/60">Checking your verification link...</p>}{state.success && <Link href="/login" className="inline-flex w-full justify-center bg-red px-5 py-4 text-xs font-bold uppercase tracking-[.14em] text-white">Continue to sign in</Link>}</div></AuthShell>;
}

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() { setLoading(true); try { await postAuth("/api/auth/logout", {}); } finally { router.push("/"); router.refresh(); } }
  return <button type="button" onClick={logout} disabled={loading} className="text-left text-red hover:underline disabled:opacity-60">{loading ? "Signing out..." : "Sign out"}</button>;
}
