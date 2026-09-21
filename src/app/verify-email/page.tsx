import { VerifyEmailForm } from "@/components/auth-forms";
import { Suspense } from "react";

export const metadata = { title: "Verify your email | My South African Guide" };

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="min-h-screen bg-cream" />}><VerifyEmailForm /></Suspense>;
}
