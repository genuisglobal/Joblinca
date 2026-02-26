import "@/app/globals.css";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import ClientLayout from "@/components/ClientLayout";

// Client-only NavBar (uses Supabase browser client)
const NavBar = dynamic(() => import("../components/NavBar"), { ssr: false });

export const metadata: Metadata = {
  title: "JobLinca",
  description: "National-scale hiring platform for Cameroon – connect recruiters and job seekers.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-gray-100 relative">
        <ClientLayout>
          <header className="w-full z-50">
            <NavBar />
          </header>

          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
