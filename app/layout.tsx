import '@/app/globals.css';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';

// Dynamically import the NavBar to avoid issues during static build.  The
// NavBar uses Supabase client (a browser‑only module) so it must be
// loaded on the client side.  Using next/dynamic with ssr: false
// ensures it won't run during server rendering.
const NavBar = dynamic(() => import('../components/NavBar'), { ssr: false });

export const metadata: Metadata = {
  title: 'JobLinca',
  description: 'National‑scale hiring platform for Cameroon – connect recruiters and job seekers.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-900 text-gray-100 relative">
        {/* Global site header with dynamic navigation */}
        <header className="w-full z-50">
          <NavBar />
        </header>
        {children}
      </body>
    </html>
  );
}