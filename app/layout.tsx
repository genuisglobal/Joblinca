import "@/app/globals.css";
import type { Metadata, Viewport } from "next";
import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import ClientLayout from "@/components/ClientLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import { getRequestBaseUrl } from "@/lib/app-url";
import { getRequestLocale } from "@/lib/i18n/server";
import { getServerT } from "@/lib/i18n/server-t";
import {
  LOCALE_PREFERENCE_COOKIE_NAME,
  hasExplicitLocalePreference,
} from "@/lib/i18n/locale";

const NavBar = dynamic(() => import("../components/NavBar"), { ssr: false });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  themeColor: "#0ea5e9",
};

export function generateMetadata(): Metadata {
  const locale = getRequestLocale();
  const t = getServerT(locale);
  const baseUrl = getRequestBaseUrl();
  const title = t("meta.defaultTitle");
  const description = t("meta.defaultDescription");

  return {
    metadataBase: new URL(baseUrl),
    title: {
      default: title,
      template: "%s | Joblinca",
    },
    description,
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
      locale: locale === "fr" ? "fr_CM" : "en_CM",
      siteName: "Joblinca",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = getRequestLocale();
  const hasExplicitLocalePreferenceCookie = hasExplicitLocalePreference(
    cookies().get(LOCALE_PREFERENCE_COOKIE_NAME)?.value
  );

  return (
    <html lang={locale}>
      <body className="bg-gray-900 text-gray-100 relative">
        <ClientLayout
          initialLocale={locale}
          initialHasExplicitLocalePreference={hasExplicitLocalePreferenceCookie}
        >
          <header className="sticky top-0 w-full z-50 bg-neutral-950/90 backdrop-blur-lg border-b border-neutral-800/50">
            <ErrorBoundary label="navbar" fallback={null}>
              <NavBar />
            </ErrorBoundary>
          </header>

          <ErrorBoundary label="page-content">{children}</ErrorBoundary>
        </ClientLayout>
      </body>
    </html>
  );
}
