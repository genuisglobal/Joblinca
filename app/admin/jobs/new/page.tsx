import { redirect } from 'next/navigation';

/**
 * The admin job form was a reduced duplicate of /jobs/new, which already has
 * a full admin mode (post as Joblinca or on behalf of a recruiter) plus the
 * AI generator, screening questions, apply methods, and deadline handling.
 * One form, one set of bugs.
 */
export default function AdminNewJobPage() {
  redirect('/jobs/new');
}
