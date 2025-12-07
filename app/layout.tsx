import '@/app/globals.css';
import React from 'react';
import type { Metadata } from 'next';

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
      <body className="bg-gray-50 text-gray-900 dark:bg-gray-900 dark:text-gray-100">
        {/* The children prop will be populated by the page content */}
        {children}
      </body>
    </html>
  );
}