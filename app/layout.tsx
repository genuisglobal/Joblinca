import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import ClientLayout from "@/components/ClientLayout";
import { getRequestLocale } from "@/lib/i18n/server";

// Client-only NavBar (uses Supabase browser client)
const NavBar = dynamic(() => import("../components/NavBar"), { ssr: false });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0ea5e9",
};

export const metadata: Metadata = {
  title: {
    default: "Joblinca — Cameroon's Job Marketplace",
    template: "%s | Joblinca",
  },
  description:
    "Find jobs, internships, and gigs in Cameroon. Free for job seekers. Post your first job free.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Joblinca",
  },
  icons: {
    icon: "/assets/logo-icon.png",
    apple: "/assets/logo-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Joblinca",
    title: "Joblinca — Cameroon's Job Marketplace",
    description:
      "Find jobs, internships, and gigs in Cameroon. Free for job seekers.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getRequestLocale();

  return (
    <html lang={locale}>
      <body className="bg-gray-900 text-gray-100 relative">
        <ClientLayout initialLocale={locale}>
          <header className="sticky top-0 w-full z-50 bg-neutral-950/90 backdrop-blur-lg border-b border-neutral-800/50">
            <NavBar />
          </header>

          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
