import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getShortlistAdmin } from '@/lib/vetting/auth';
import { listHiresForRequest } from '@/lib/vetting/hires';
import {
  getVettingRequest,
  loadCandidatePool,
  loadSelection,
  VettingError,
} from '@/lib/vetting/service';
import HiresPanel from './HiresPanel';
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

  const delivered = request.status === 'delivered' || request.status === 'completed';
  const [pool, selection, hires] = await Promise.all([
    loadCandidatePool(supabase, request.job_id),
    loadSelection(supabase, request.id),
    delivered ? listHiresForRequest(supabase, request.id) : Promise.resolve([]),
  ]);

  // The pool leaves out hired applicants, so name the shortlisted people directly.
  let shortlisted: Array<{ applicationId: string; candidateId: string; rank: number; fullName: string | null }> = [];
  if (delivered && selection.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .in(
        'id',
        selection.map((s) => s.candidateId)
      );
    const nameById = new Map((profiles ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? null]));
    shortlisted = selection.map((s) => ({
      applicationId: s.applicationId,
      candidateId: s.candidateId,
      rank: s.rank,
      fullName: nameById.get(s.candidateId) ?? null,
    }));
  }

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
      {delivered && (
        <div className="mt-6">
          <HiresPanel
            requestId={request.id}
            billingModel={request.billing_model}
            successFeePercent={request.success_fee_percent}
            deliveredAt={request.delivered_at}
            candidates={shortlisted}
            hires={hires}
          />
        </div>
      )}
    </div>
  );
}
