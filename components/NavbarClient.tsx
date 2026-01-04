"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, useCallback } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Role = "job_seeker" | "talent" | "recruiter" | "admin" | "staff" | null;

export default function NavbarClient() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [isAuthed, setIsAuthed] = useState(false);
  const [role, setRole] = useState<Role>(null);

  const fetchSessionAndRole = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      setIsAuthed(!!user);

      if (!user) {
        setRole(null);
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setRole((profile?.role as Role) ?? null);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchSessionAndRole();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        fetchSessionAndRole();
        router.refresh();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchSessionAndRole, router]);

  const isRecruiter = role === "recruiter";

  const linkClass = (href: string) =>
    `${pathname === href ? "text-yellow-400" : ""} hover:text-yellow-400 transition-colors`;

  return (
    <>
      <header className="w-full z-50">
        <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4">
          <Link href="/" className="flex items-center">
            <Image
              src="/assets/header-logo.png"
              alt="JobLinca"
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

            {!isRecruiter && (
              <li><Link href="/resume" className={linkClass("/resume")}>CV Builder</Link></li>
            )}

            {isRecruiter && (
              <li><Link href="/recruiter/post-job" className={linkClass("/recruiter/post-job")}>Post a Job</Link></li>
            )}
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

                {/* Server route logout */}
                <Link
                  href="/auth/logout"
                  className="px-4 py-2 rounded text-sm font-medium border border-gray-600 hover:bg-gray-800 transition-colors"
                >
                  Logout
                </Link>
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
          <Link href="/" className={linkClass("/")}>Home</Link>
          <Link href="/jobs" className={linkClass("/jobs")}>Jobs</Link>
          <Link href="/learn-more/jobseekers" className={linkClass("/learn-more/jobseekers")}>Job Seekers</Link>
          <Link href="/learn-more/recruiters" className={linkClass("/learn-more/recruiters")}>Recruiters</Link>
          <Link href="/global-jobs" className={linkClass("/global-jobs")}>Global Jobs</Link>

          {!isRecruiter && (
            <Link href="/resume" className={linkClass("/resume")}>CV Builder</Link>
          )}

          {isRecruiter && (
            <Link href="/recruiter/post-job" className={linkClass("/recruiter/post-job")}>Post a Job</Link>
          )}

          {loading ? (
            <span className="text-sm text-gray-400">Loading...</span>
          ) : isAuthed ? (
            <>
              <Link href="/dashboard" className={linkClass("/dashboard")}>Dashboard</Link>
              <Link href="/auth/logout" className="text-left hover:text-yellow-400">
                Logout
              </Link>
            </>
          ) : (
            <>
              <Link href="/auth/login" className={linkClass("/auth/login")}>Login</Link>
              <Link href="/auth/register" className={linkClass("/auth/register")}>Get Started</Link>
            </>
          )}
        </nav>
      </div>
    </>
  );
}
