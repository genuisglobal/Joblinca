"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ACTIVE_ADMIN_TYPES, type AdminType } from "@/lib/admin-types";
import { useTranslation } from "@/lib/i18n";
import { addLocalePrefix, stripLocalePrefix } from "@/lib/i18n/locale";
import { Menu, X, Briefcase, Users, Building2, Globe, FileText, LayoutDashboard, LogOut, LogIn, UserPlus, Languages } from "lucide-react";
import NotificationBell from "@/components/NotificationBell";

type Role = "job_seeker" | "talent" | "recruiter" | "field_agent" | "admin" | "staff" | null;

export default function NavBar() {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { t, locale, setLocale } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<Role>(null);
  const [userAdminType, setUserAdminType] = useState<AdminType | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [portalReady, setPortalReady] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpenRef = useRef(false);

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
        setUserAdminType(null);
        return;
      }

      setIsAuthenticated(true);

      const { data: profile } = await supabase
        .from("profiles")
        .select("role, admin_type")
        .eq("id", user.id)
        .maybeSingle();

      setUserRole((profile?.role as Role) ?? null);
      setUserAdminType((profile?.admin_type as AdminType | null) ?? null);
    } catch {
      setIsAuthenticated(false);
      setUserRole(null);
      setUserAdminType(null);
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
          setUserAdminType(null);
        }
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, [supabase, fetchUserAndRole]);

  const isRecruiter = userRole === "recruiter";
  const isActiveAdmin = Boolean(
    userAdminType &&
    ACTIVE_ADMIN_TYPES.includes(userAdminType)
  );
  const dashboardPath = userRole === "admin"
    ? (isActiveAdmin ? "/admin" : "/jobs")
    : "/dashboard";
  const currentPath = stripLocalePrefix(pathname || "/");
  const localizedHref = useCallback(
    (href: string) => addLocalePrefix(href, locale),
    [locale]
  );

  const linkClass = (href: string) =>
    `${currentPath === href ? "text-yellow-400" : ""} hover:text-yellow-400 transition-colors`;

  const closeMobileMenu = () => setMobileMenuOpen(false);

  const toggleLocale = () => {
    const nextLocale = locale === "en" ? "fr" : "en";
    const query = searchParams.toString();

    void setLocale(nextLocale).then(() => {
      router.replace(
        query
          ? `${addLocalePrefix(currentPath, nextLocale)}?${query}`
          : addLocalePrefix(currentPath, nextLocale)
      );
    });
  };

  // Close menu on route change
  useEffect(() => {
    closeMobileMenu();
  }, [pathname]);

  // The mobile menu is portalled to <body>. The site header uses
  // backdrop-blur, which makes it the containing block for `fixed`
  // descendants, so a drawer rendered inside it was clipped to the
  // header's height and its links could not be reached.
  useEffect(() => {
    setPortalReady(true);
  }, []);

  // Stop the page scrolling behind the open menu.
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [mobileMenuOpen]);

  // Dialog behaviour: move focus into the drawer, close on Escape, keep Tab
  // inside it while open, and hand focus back to the menu button on close.
  useEffect(() => {
    if (!mobileMenuOpen) {
      if (drawerWasOpenRef.current) {
        drawerWasOpenRef.current = false;
        menuButtonRef.current?.focus({ preventScroll: true });
      }
      return;
    }
    drawerWasOpenRef.current = true;
    closeButtonRef.current?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMobileMenuOpen(false);
        return;
      }
      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !drawerRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !drawerRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    // The drawer is lg:hidden; if the window grows to desktop width while it
    // is open, close it so the scroll lock and focus trap are released.
    const desktop = window.matchMedia("(min-width: 1024px)");
    const onDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setMobileMenuOpen(false);
    };

    document.addEventListener("keydown", onKeyDown);
    desktop.addEventListener?.("change", onDesktop);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      desktop.removeEventListener?.("change", onDesktop);
    };
  }, [mobileMenuOpen]);

  if (loading) {
    return (
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 h-[72px]" />
    );
  }

  return (
    <>
      {/* Main Navigation Bar (height mirrored by --site-header-h in globals.css) */}
      <nav className="max-w-7xl mx-auto flex items-center justify-between px-4 h-[72px]">
        {/* Logo */}
        <Link href={localizedHref("/")} className="flex items-center">
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
            <Link href={localizedHref("/")} className={linkClass("/")}>
              {t("nav.home")}
            </Link>
          </li>
          <li>
            <Link href={localizedHref("/jobs")} className={linkClass("/jobs")}>
              {t("nav.jobs")}
            </Link>
          </li>
          <li>
            <Link href={localizedHref("/learn-more/jobseekers")} className={linkClass("/learn-more/jobseekers")}>
              {t("nav.forJobSeekers")}
            </Link>
          </li>
          <li>
            <Link href={localizedHref("/learn-more/recruiters")} className={linkClass("/learn-more/recruiters")}>
              {t("nav.forRecruiters")}
            </Link>
          </li>
          <li>
            <Link href={localizedHref("/remote-jobs")} className={linkClass("/remote-jobs")}>
              {t("nav.globalJobs")}
            </Link>
          </li>

          <li>
            <Link href={localizedHref("/pricing")} className={linkClass("/pricing")}>
              {t("nav.pricing")}
            </Link>
          </li>

          {isRecruiter && (
            <li>
              <Link href={localizedHref("/recruiter/post-job")} className={linkClass("/recruiter/post-job")}>
                {t("nav.postAJob")}
              </Link>
            </li>
          )}

          {!isRecruiter && (
            <li>
              <Link href={localizedHref("/resume")} className={linkClass("/resume")}>
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
            title={locale === "en" ? t("nav.switchToFrench") : t("nav.switchToEnglish")}
          >
            <Languages className="w-4 h-4" />
            {locale === "en" ? "FR" : "EN"}
          </button>

          {isAuthenticated ? (
            <>
              <NotificationBell />
              <Link
                href={localizedHref(dashboardPath)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t("nav.dashboard")}
              </Link>
              <Link
                href={localizedHref("/auth/logout")}
                prefetch={false}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-600 hover:bg-gray-800 transition-colors"
              >
                {t("nav.logout")}
              </Link>
            </>
          ) : (
            <>
              <Link
                href={localizedHref("/auth/login")}
                className="px-4 py-2 rounded-lg text-sm font-medium hover:text-yellow-400 transition-colors"
              >
                {t("nav.login")}
              </Link>
              <Link
                href={localizedHref("/auth/register")}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                {t("nav.getStarted")}
              </Link>
            </>
          )}
        </div>

        {/* Mobile Menu Toggle */}
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          aria-label={mobileMenuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
          aria-expanded={mobileMenuOpen}
          aria-controls="mobile-nav-drawer"
          aria-haspopup="dialog"
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </nav>

      {portalReady && createPortal(<>
      {/* Mobile Navigation Overlay */}
      {mobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 z-drawer-backdrop bg-black/60 backdrop-blur-sm"
          onClick={closeMobileMenu}
          aria-hidden="true"
          data-testid="mobile-nav-backdrop"
        />
      )}

      {/* Mobile Navigation Panel. Hidden with `invisible` when closed so its
          links leave the tab order and the accessibility tree. */}
      <div
        ref={drawerRef}
        id="mobile-nav-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={t("nav.navigate")}
        className={`drawer-panel lg:hidden fixed top-0 right-0 z-drawer flex w-[280px] max-w-[85vw] flex-col bg-gray-900 border-l border-gray-800 shadow-2xl transform transition-[transform,visibility] duration-300 ease-in-out ${
          mobileMenuOpen ? "translate-x-0 visible" : "translate-x-full invisible"
        }`}
      >
        {/* Mobile Menu Header */}
        <div className="flex shrink-0 items-center justify-between p-4 border-b border-gray-800">
          <Link href={localizedHref("/")} onClick={closeMobileMenu} className="flex items-center gap-2">
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
            ref={closeButtonRef}
            type="button"
            onClick={closeMobileMenu}
            className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
            aria-label={t("nav.closeMenu")}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mobile Menu Content (scrolls on its own; header stays put) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain">
          {/* Navigation Links */}
          <nav className="flex-1 p-4">
            <div className="space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t("nav.navigate")}
              </p>

              <Link
                href={localizedHref("/")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Briefcase className="w-5 h-5" />
                {t("nav.home")}
              </Link>

              <Link
                href={localizedHref("/jobs")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/jobs"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Briefcase className="w-5 h-5" />
                {t("nav.browseJobs")}
              </Link>

              <Link
                href={localizedHref("/remote-jobs")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/remote-jobs"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Globe className="w-5 h-5" />
                {t("nav.globalJobs")}
              </Link>

              {!isRecruiter && (
                <Link
                  href={localizedHref("/resume")}
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    currentPath === "/resume"
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
                href={localizedHref("/pricing")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/pricing"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                {t("nav.pricing")}
              </Link>
            </div>

            {/* For Users Section */}
            <div className="mt-6 space-y-1">
              <p className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {t("nav.learnMore")}
              </p>

              <Link
                href={localizedHref("/learn-more/jobseekers")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/learn-more/jobseekers"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Users className="w-5 h-5" />
                {t("nav.forJobSeekers")}
              </Link>

              <Link
                href={localizedHref("/learn-more/recruiters")}
                onClick={closeMobileMenu}
                className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                  currentPath === "/learn-more/recruiters"
                    ? "bg-blue-600/20 text-blue-400"
                    : "text-gray-300 hover:text-white hover:bg-gray-800"
                }`}
              >
                <Building2 className="w-5 h-5" />
                {t("nav.forRecruiters")}
              </Link>

              {isRecruiter && (
                <Link
                  href={localizedHref("/recruiter/post-job")}
                  onClick={closeMobileMenu}
                  className={`flex items-center gap-3 px-3 py-3 rounded-lg text-sm font-medium transition-colors ${
                    currentPath === "/recruiter/post-job"
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
                  href={localizedHref(dashboardPath)}
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <LayoutDashboard className="w-5 h-5" />
                  {t("nav.dashboard")}
                </Link>
                <Link
                  href={localizedHref("/auth/logout")}
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
                  href={localizedHref("/auth/register")}
                  onClick={closeMobileMenu}
                  className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <UserPlus className="w-5 h-5" />
                  {t("nav.getStarted")}
                </Link>
                <Link
                  href={localizedHref("/auth/login")}
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
      </>, document.body)}
    </>
  );
}
