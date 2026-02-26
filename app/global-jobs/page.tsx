import { redirect } from 'next/navigation';

/**
 * Global Jobs page – redirects to /remote-jobs which has the full-featured
 * search, category tabs, filters and job listings UI.
 */
export default function GlobalJobsPage() {
  redirect('/remote-jobs');
}
