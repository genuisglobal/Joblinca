'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bookmark, FileText, Home, Menu, Search } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';
import { addLocalePrefix, stripLocalePrefix } from '@/lib/i18n/locale';
import { DASHBOARD_NAV_TOGGLE_EVENT } from './DashboardSidebar';

const MORE_BUTTON_ID = 'seeker-bottom-nav-more';

const TABS = [
  { href: '/dashboard/job-seeker', labelKey: 'dashboardNav.overview', Icon: Home, exact: true },
  { href: '/dashboard/job-seeker/browse', labelKey: 'dashboardNav.browseJobs', Icon: Search },
  { href: '/dashboard/job-seeker/applications', labelKey: 'dashboardNav.myApplications', Icon: FileText },
  { href: '/dashboard/job-seeker/saved-jobs', labelKey: 'dashboardNav.savedJobs', Icon: Bookmark },
] as const;

/**
 * Bottom tab bar for job seekers on dashboard pages (phones and tablets).
 * The four most-used destinations plus "More", which opens the existing
 * dashboard sidebar drawer with every other item. Hidden from lg up, where
 * the sidebar is always visible.
 */
export default function SeekerBottomNav() {
  const { t, locale } = useTranslation();
  const pathname = stripLocalePrefix(usePathname() || '/');

  const itemClass = (active: boolean) =>
    `flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium transition-colors ${
      active ? 'text-blue-400' : 'text-gray-400 hover:text-white'
    }`;

  return (
    <nav
      aria-label={t('dashboardNav.bottomNavLabel')}
      className="fixed inset-x-0 bottom-0 z-mobile-bar border-t border-gray-700 bg-gray-900/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur lg:hidden"
    >
      <ul className="mx-auto flex max-w-lg">
        {TABS.map(({ href, labelKey, Icon, ...rest }) => {
          const exact = 'exact' in rest && rest.exact;
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex flex-1">
              <Link href={addLocalePrefix(href, locale)} aria-current={active ? 'page' : undefined} className={itemClass(active)}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                <span className="max-w-full truncate">{t(labelKey)}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex flex-1">
          <button
            id={MORE_BUTTON_ID}
            type="button"
            aria-controls="dashboard-sidebar"
            aria-haspopup="dialog"
            onClick={() =>
              window.dispatchEvent(
                new CustomEvent(DASHBOARD_NAV_TOGGLE_EVENT, { detail: { returnFocusId: MORE_BUTTON_ID } })
              )
            }
            className={itemClass(false)}
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>{t('dashboardNav.more')}</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
