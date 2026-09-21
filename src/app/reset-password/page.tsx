import { ResetPasswordForm } from "@/components/auth-forms";
import { Suspense } from "react";

export const metadata = { title: "Choose a new password | My South African Guide" };

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="min-h-screen bg-cream" />}><ResetPasswordForm /></Suspense>;
}
