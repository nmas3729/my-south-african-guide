import type { Metadata } from "next";
import { DM_Sans, Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "My South African Guide | Local Guides, Experiences & Travel",
    template: "%s | My South African Guide",
  },
  description: "Discover South Africa through verified local guides, memorable experiences, stunning destinations and trusted transport planning.",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    title: "My South African Guide | Local Guides, Experiences & Travel",
    description: "Discover South Africa through verified local guides, memorable experiences, stunning destinations and trusted transport planning.",
    siteName: "My South African Guide",
  },
  twitter: {
    card: "summary_large_image",
    title: "My South African Guide | Local Guides, Experiences & Travel",
    description: "Discover South Africa through verified local guides, memorable experiences, stunning destinations and trusted transport planning.",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${dmSans.variable} ${cormorant.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
