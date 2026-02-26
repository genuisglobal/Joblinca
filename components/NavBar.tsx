"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useTranslation } from "@/lib/i18n";
import { Menu, X, Briefcase, Users, Building2, Globe, FileText, LayoutDashboard, LogOut, LogIn, UserPlus, Languages } from "lucide-react";

type Role = "job_seeker" | "talent" | "recruiter" | "admin" | "staff" | null;

export default function NavBar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const { t, locale, setLocale } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchUserAndRole = useCallback(async (skipLoading = false) => {
    if (!skipLoading) setLoading(true);
    try {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setIsAuthenticated(false);
        setUserRole(null);
        return;
      }

      setIsAuthenticated(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();

      setUserRole((profile?.role as Role) ?? null);
    } catch {
      setIsAuthenticated(false);
      setUserRole(null);
    } finally {
      if (!skipLoading) setLoading(false);
    }
  }, [supabase]);

  // Initial auth check
  useEffect(() => {
    fetchUserAndRole();
  }, [fetchUserAndRole]);

  // Re-check auth on pathname changes (navigation)
  useEffect(() => {
    // Skip loading state on navigation to avoid flicker
    fetchUserAndRole(true);
  }, [pathname, fetchUserAndRole]);

  // Listen for auth state changes
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // Handle all auth events that might change the user state
      if (
        event === "SIGNED_IN" ||
        event === "SIGNED_OUT" ||
        event === "USER_UPDATED" ||
        event === "TOKEN_REFRESHED" ||
        event === "INITIAL_SESSION"
      ) {
        // Update auth state based on session
        if (session?.user) {
          setIsAuthenticated(true);
          fetchUserAndRole(true);
        } else if (event === "SIGNED_OUT") {
          setIsAuthenticated(false);
          setUserRole(null);
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchUserAndRole]);

  const isRecruiter = userRole === "recruiter";

  const linkClass = (href: string) =>
    `${pathname === href ? "text-yellow-400" : ""} hover:text-yellow-400 transition-colors`;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const toggleLocale = () => {
    setLocale(locale === "en" ? "fr" : "en");
  };

  // Close menu on route change
  useEffect(() => {
    closeMobileMenu();
  }, [pathname]);

  if (loading) {
    return (
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-4 h-16" />
    );
  }

  return (
    <>
      {/* Main Navigation Bar */}
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 py-3">
        {/* Logo */}
        <Link href="/" className="flex items-center">
          <Image
            src="/assets/header-logo.png"
            alt="JobLinca"
            width={180}
            height={48}
            priority
            className="object-contain"
          />
        </Link>

        {/* Desktop Navigation */}
        <ul className="hidden lg:flex items-center space-x-6 text-sm font-medium">
          <li>
            <Link href="/" className={linkClass("/")}>
              {t("nav.home")}
            </Link>
          </li>
          <li>
            <Link href="/jobs" className={linkClass("/jobs")}>
              {t("nav.jobs")}
            </Link>
          </li>
          <li>
            <Link href="/learn-more/jobseekers" className={linkClass("/learn-more/jobseekers")}>
              {t("nav.forJobSeekers")}
            </Link>
          </li>
          <li>
            <Link href="/learn-more/recruiters" className={linkClass("/learn-more/recruiters")}>
              {t("nav.forRecruiters")}
            </Link>
          </li>
          <li>
            <Link href="/remote-jobs" className={linkClass("/remote-jobs")}>
              {t("nav.globalJobs")}
            </Link>
          </li>

          <li>
            <Link href="/pricing" className={linkClass("/pricing")}>
              Pricing
            </Link>
          </li>

          {isRecruiter && (
            <li>
              <Link href="/recruiter/post-job" className={linkClass("/recruiter/post-job")}>
                {t("nav.postAJob")}
              </Link>
            </li>
          )}

          {!isRecruiter && (
            <li>
              <Link href="/resume" className={linkClass("/resume")}>
                {t("nav.cvBuilder")}
              </Link>
            </li>
          )}
        </ul>

        {/* Desktop Auth Actions + Language Toggle */}
        <div className="hidden lg:flex items-center space-x-3">
          {/* Language Toggle */}
          <button
            type="button"
            onClick={toggleLocale}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border border-gray-600 hover:bg-gray-800 transition-colors"
            title={locale === "en" ? "Passer en Fran\u00e7ais" : "Switch to English"}
          >
            <Languages className="w-4 h-4" />
            {locale === "en" ? "FR" : "EN"}
          </button>

          {isAuthenticated ? (
            <>
              <Link
                href="/dashboard"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t("nav.dashboard")}
              </Link>
              <Link
                href="/auth/logout"
                prefetch={false}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-600 hover:bg-gray-800 transition-colors"
              >
                {t("nav.logout")}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="px-4 py-2 rounded-lg text-sm font-medium hover:text-yellow-400 transition-colors"
              >
                {t("nav.login")}
              </Link>
              <Link
                href="/auth/register"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t("nav.getStarted")}
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={mobileMenuOpen}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {/* Mobile Navigation Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeMobileMenu}
        />
      )}

      {/* Mobile Navigation Panel */}
      <div
        className={`lg:hidden fixed top-0 right-0 z-50 h-full w-[280px] max-w-[85vw] bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-transform duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <Link href="/" onClick={closeMobileMenu} className="flex items-center gap-2">
            <Image
              src="/joblinca-logo.png"
              alt="JobLinca"
              width={32}
              height={32}
              className="rounded-lg"
            />
            <span className="font-bold text-white">JobLinca</span>
          </Link>
          <button
            type="button"
            onClick={closeMobileMenu}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label={t("nav.closeMenu")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Menu Content */}
        <div className="flex flex-col h-[calc(100%-64px)] overflow-y-auto">
          {/* Navigation Links */}
          <nav className="flex-1 p-4">
            <div className="space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t("nav.navigate")}
              </p>

              <Link
                href="/"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Briefcase className="w-5 h-5" />
                {t("nav.home")}
              </Link>

              <Link
                href="/jobs"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/jobs"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Briefcase className="w-5 h-5" />
                {t("nav.browseJobs")}
              </Link>

              <Link
                href="/remote-jobs"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/remote-jobs"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Globe className="w-5 h-5" />
                {t("nav.globalJobs")}
              </Link>

              {!isRecruiter && (
                <Link
                  href="/resume"
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/resume"
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-gray-300 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <FileText className="w-5 h-5" />
                  {t("nav.cvBuilder")}
                </Link>
              )}
            </div>

            {/* Pricing */}
            <div className="mt-4 space-y-1">
              <Link
                href="/pricing"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/pricing"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                Pricing
              </Link>
            </div>

            {/* For Users Section */}
            <div className="mt-6 space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t("nav.learnMore")}
              </p>

              <Link
                href="/learn-more/jobseekers"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/learn-more/jobseekers"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Users className="w-5 h-5" />
                {t("nav.forJobSeekers")}
              </Link>

              <Link
                href="/learn-more/recruiters"
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  pathname === "/learn-more/recruiters"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Building2 className="w-5 h-5" />
                {t("nav.forRecruiters")}
              </Link>

              {isRecruiter && (
                <Link
                  href="/recruiter/post-job"
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    pathname === "/recruiter/post-job"
                      ? "bg-blue-600/20 text-blue-400"
                      : "text-gray-300 hover:text-white hover:bg-gray-800"
                  }`}
                >
                  <Building2 className="w-5 h-5" />
                  {t("nav.postAJob")}
                </Link>
              )}
            </div>

            {/* Language Toggle - Mobile */}
            <div className="mt-6 px-3">
              <button
                type="button"
                onClick={toggleLocale}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
              >
                <Languages className="w-4 h-4" />
                {locale === "en" ? "Fran\u00e7ais" : "English"}
              </button>
            </div>
          </nav>

          {/* Auth Actions - Bottom */}
          <div className="p-4 border-t border-gray-800 bg-gray-900/50">
            {isAuthenticated ? (
              <div className="space-y-2">
                <Link
                  href="/dashboard"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  {t("nav.dashboard")}
                </Link>
                <Link
                  href="/auth/logout"
                  prefetch={false}
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  {t("nav.logout")}
                </Link>
              </div>
            ) : (
              <div className="space-y-2">
                <Link
                  href="/auth/register"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <UserPlus className="w-5 h-5" />
                  {t("nav.getStarted")}
                </Link>
                <Link
                  href="/auth/login"
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-medium border border-gray-700 text-gray-300 hover:text-white hover:bg-gray-800 transition-colors"
                >
                  <LogIn className="w-5 h-5" />
                  {t("nav.login")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
