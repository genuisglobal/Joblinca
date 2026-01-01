import '@/app/globals.css';
import React from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';

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
        {/* Global site header */}
        <header className="w-full z-50">
          <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
            <Link href="/" className="flex items-center space-x-2">
              {/* Display the JobLinca icon and wordmark side by side for stronger branding */}
              <Image
                src="/assets/logo-icon.png"
                alt="JobLinca icon"
                width={32}
                height={32}
                priority
              />
              <Image
                src="/assets/logo-wordmark.png"
                alt="JobLinca wordmark"
                width={100}
                height={32}
                priority
                className="hidden sm:block"
              />
            </Link>
            {/* Primary navigation */}
            <ul className="hidden md:flex items-center space-x-8 text-sm font-medium">
              <li>
                <Link href="/" className="hover:text-yellow-400 transition-colors">
                  Home
                </Link>
              </li>
              <li>
                <Link href="/jobs" className="hover:text-yellow-400 transition-colors">
                  Jobs
                </Link>
              </li>
              <li>
                <Link href="/learn-more/jobseekers" className="hover:text-yellow-400 transition-colors">
                  For Job Seekers
                </Link>
              </li>
              <li>
                <Link href="/learn-more/recruiters" className="hover:text-yellow-400 transition-colors">
                  For Recruiters
                </Link>
              </li>
              <li>
                <Link href="/global-jobs" className="hover:text-yellow-400 transition-colors">
                  Global Jobs
                </Link>
              </li>
              <li>
                <Link href="/resume" className="hover:text-yellow-400 transition-colors">
                  CV Builder
                </Link>
              </li>
            </ul>
            {/* Auth actions */}
            <div className="hidden md:flex items-center space-x-4">
              <Link
                href="/auth/login"
                className="px-4 py-2 rounded text-sm font-medium hover:underline"
              >
                Login
              </Link>
              <Link
                href="/auth/register?role=candidate"
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Get Started
              </Link>
            </div>
          </nav>
        </header>
        {/* Mobile navigation */}
        <div className="md:hidden px-4 pb-4">
          {/* simple stacked nav for small screens */}
          <nav className="flex flex-col space-y-2 text-sm font-medium mt-4">
            <Link href="/" className="hover:text-yellow-400">
              Home
            </Link>
            <Link href="/jobs" className="hover:text-yellow-400">
              Jobs
            </Link>
            <Link href="/learn-more/jobseekers" className="hover:text-yellow-400">
              Job Seekers
            </Link>
            <Link href="/learn-more/recruiters" className="hover:text-yellow-400">
              Recruiters
            </Link>
            <Link href="/global-jobs" className="hover:text-yellow-400">
              Global Jobs
            </Link>
            <Link href="/resume" className="hover:text-yellow-400">
              CV Builder
            </Link>
            <Link href="/auth/login" className="hover:text-yellow-400">
              Login
            </Link>
            <Link href="/auth/register?role=candidate" className="hover:text-yellow-400">
              Get Started
            </Link>
          </nav>
        </div>
        {children}
      </body>
    </html>
  );
}