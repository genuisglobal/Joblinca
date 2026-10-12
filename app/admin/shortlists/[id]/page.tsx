import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getShortlistAdmin } from '@/lib/vetting/auth';
import {
  getVettingRequest,
  loadCandidatePool,
  loadSelection,
  VettingError,
} from '@/lib/vetting/service';
import ShortlistBuilder from './ShortlistBuilder';

export const metadata = {
  title: 'Shortlist - Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminShortlistPage({ params }: { params: { id: string } }) {
  const admin = await getShortlistAdmin();
  if (!admin) {
    return (
      <div className="py-12 text-center text-neutral-400">
        The shortlist queue is for super and operations admins.
      </div>
    );
  }

  const supabase = createServiceSupabaseClient();
  let request;
  try {
    request = await getVettingRequest(supabase, params.id);
  } catch (err) {
    if (err instanceof VettingError && err.status === 404) notFound();
    throw err;
  }

  const [pool, selection] = await Promise.all([
    loadCandidatePool(supabase, request.job_id),
    loadSelection(supabase, request.id),
  ]);

  return (
    <div>
      <Link href="/admin/shortlists" className="text-sm text-neutral-400 hover:text-white">
        ← All shortlists
      </Link>
      <ShortlistBuilder
        request={request}
        pool={pool}
        initialSelection={selection}
        currentUserId={admin.userId}
      />
    </div>
  );
}
