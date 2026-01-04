"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function NavbarClient() {
  // Create the Supabase client ONCE (prevents re-subscribing loops)
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      setIsAuthed(!!data.session?.user);
      setLoading(false);
    }

    init();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Update local state
      setIsAuthed(!!session?.user);

      // DO NOT refresh on TOKEN_REFRESHED (this is what causes constant refreshing)
      // Only refresh on real auth boundary changes.
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") {
        router.refresh();
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase, router]);

  async function handleLogout() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);

    if (error) {
      console.error("Logout error:", error.message);
      return;
    }

    router.push("/");
    router.refresh();
  }

  const linkClass = (href: string) =>
    `${pathname === href ? "text-yellow-400" : ""} hover:text-yellow-400 transition-colors`;

  return (
    <>
      <header className="w-full z-50">
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/header-logo.png"
              alt="JobLinca logo"
              width={220}
              height={60}
              priority
              className="object-contain"
            />
          </Link>

          <ul className="hidden md:flex items-center space-x-8 text-sm font-medium">
            <li><Link href="/" className={linkClass("/")}>Home</Link></li>
            <li><Link href="/jobs" className={linkClass("/jobs")}>Jobs</Link></li>
            <li><Link href="/learn-more/jobseekers" className={linkClass("/learn-more/jobseekers")}>For Job Seekers</Link></li>
            <li><Link href="/learn-more/recruiters" className={linkClass("/learn-more/recruiters")}>For Recruiters</Link></li>
            <li><Link href="/global-jobs" className={linkClass("/global-jobs")}>Global Jobs</Link></li>
            <li><Link href="/resume" className={linkClass("/resume")}>CV Builder</Link></li>
          </ul>

          <div className="hidden md:flex items-center space-x-4">
            {loading ? (
              <span className="text-sm text-gray-400">Loading...</span>
            ) : isAuthed ? (
              <>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 rounded text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Dashboard
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded text-sm font-medium border border-gray-600 hover:bg-gray-800 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="px-4 py-2 rounded text-sm font-medium hover:underline">
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
      </header>

      <div className="md:hidden px-4 pb-6">
        <nav className="flex flex-col space-y-4 text-base font-medium mt-4">
          <Link href="/" className="hover:text-yellow-400">Home</Link>
          <Link href="/jobs" className="hover:text-yellow-400">Jobs</Link>
          <Link href="/learn-more/jobseekers" className="hover:text-yellow-400">Job Seekers</Link>
          <Link href="/learn-more/recruiters" className="hover:text-yellow-400">Recruiters</Link>
          <Link href="/global-jobs" className="hover:text-yellow-400">Global Jobs</Link>
          <Link href="/resume" className="hover:text-yellow-400">CV Builder</Link>

          {loading ? (
            <span className="text-sm text-gray-400">Loading...</span>
          ) : isAuthed ? (
            <>
              <Link href="/dashboard" className="hover:text-yellow-400">Dashboard</Link>
              <button type="button" onClick={handleLogout} className="text-left hover:text-yellow-400">
                Logout
              </button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="hover:text-yellow-400">Login</Link>
              <Link href="/auth/register" className="hover:text-yellow-400">Get Started</Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}
