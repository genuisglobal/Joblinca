import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { getShortlistAdmin } from '@/lib/vetting/auth';
import { listVettingRequests, syncPaidShortlistJobs } from '@/lib/vetting/service';
import ShortlistQueueClient from './ShortlistQueueClient';

export const metadata = {
  title: 'Shortlists - Admin',
};

export const dynamic = 'force-dynamic';

export default async function AdminShortlistsPage() {
  const admin = await getShortlistAdmin();
  if (!admin) {
    return (
      <div className="py-12 text-center text-neutral-400">
        The shortlist queue is for super and operations admins.
      </div>
    );
  }

  const supabase = createServiceSupabaseClient();
  await syncPaidShortlistJobs(supabase);
  const [open, done] = await Promise.all([
    listVettingRequests(supabase, 'open'),
    listVettingRequests(supabase, 'done'),
  ]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Shortlists</h1>
        <p className="text-neutral-400 mt-1">
          {open.length} open · deliver each within 72 hours of the request
        </p>
      </div>
      <ShortlistQueueClient open={open} done={done} currentUserId={admin.userId} />
    </div>
  );
}
