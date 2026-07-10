import { redirect } from 'next/navigation';
import { getRequestLocale } from '@/lib/i18n/server';
import { addLocalePrefix } from '@/lib/i18n/locale';

/**
 * Global Jobs page – redirects to /remote-jobs which has the full-featured
 * search, category tabs, filters and job listings UI.
 */
export default function GlobalJobsPage() {
  redirect(addLocalePrefix('/remote-jobs', getRequestLocale()));
}
