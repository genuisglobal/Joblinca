"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Responsive navigation bar that adapts its links based on the user's
 * authentication state and role.  Recruiter‑specific actions are hidden
 * from non‑recruiters, and the CV Builder is hidden from recruiters since
 * they typically don't need to build a resume.  The nav also swaps
 * between login/get started and dashboard/logout depending on whether
 * a session exists.  On mobile, the menu is stacked for better spacing.
 */
export default function NavBar() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    async function fetchUser() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setIsAuthenticated(false);
          setUserRole(null);
          setLoading(false);
          return;
        }
        setIsAuthenticated(true);
        // Fetch the profile to determine role
        const { data: profile, error } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();
        if (error || !profile) {
          setUserRole(null);
        } else {
          setUserRole(profile.role as string);
        }
      } catch (err) {
        // In case of network or client errors, treat as unauthenticated
        setIsAuthenticated(false);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    }
    fetchUser();
  }, [supabase]);

  if (loading) {
    return (
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4" />
    );
  }

  const isRecruiter = userRole === "recruiter";
  const isTalent = userRole === "talent";
  const isJobSeeker = userRole === "job_seeker";

  return (
    <>
      {/* Desktop navigation */}
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center">
          {/* Separate icon and wordmark for clearer branding.  We avoid
             including a dark box around the logo; instead, the SVG/PNG
             itself has transparent background.  */}
          <Image
            src="/assets/logo-icon.png"
            alt="JobLinca icon"
            width={32}
            height={32}
            className="mr-2"
          />
          <Image
            src="/assets/logo-wordmark.png"
            alt="JobLinca"
            width={140}
            height={40}
            priority
          />
        </Link>
        {/* Primary nav links */}
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
          {/* Show CV Builder only for job seekers or talent */}
          {!isRecruiter && (
            <li>
              <Link href="/resume" className="hover:text-yellow-400 transition-colors">
                CV Builder
              </Link>
            </li>
          )}
        </ul>
        {/* Auth / dashboard actions */}
        <div className="hidden md:flex items-center space-x-4">
          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded text-sm font-medium hover:underline"
              >
                Dashboard
              </Link>
              <Link
                href="/auth/logout"
                className="px-4 py-2 rounded text-sm font-medium bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Logout
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="px-4 py-2 rounded text-sm font-medium hover:underline"
              >
                Login
              </Link>
              <Link
                href="/auth/register"
                className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </nav>
      {/* Mobile navigation */}
      <div className="md:hidden px-4 pb-6">
        <nav className="flex flex-col space-y-4 text-base font-medium mt-4">
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
          {/* CV Builder hidden for recruiters on mobile as well */}
          {!isRecruiter && (
            <Link href="/resume" className="hover:text-yellow-400">
              CV Builder
            </Link>
          )}
          {isAuthenticated ? (
            <>
              <Link href="/dashboard" className="hover:text-yellow-400">
                Dashboard
              </Link>
              <Link href="/auth/logout" className="hover:text-yellow-400">
                Logout
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="hover:text-yellow-400">
                Login
              </Link>
              <Link href="/auth/register" className="hover:text-yellow-400">
                Get Started
              </Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}