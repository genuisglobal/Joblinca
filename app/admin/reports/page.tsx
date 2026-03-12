import { checkAdminStatus } from '@/lib/admin';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import ReportsClient from './ReportsClient';

export const metadata = {
  title: 'Reports - Admin',
};

export default async function AdminReportsPage() {
  await checkAdminStatus();
  const supabase = createServerSupabaseClient();

  // Load pending reports with job and reporter info
  const { data: reports } = await supabase
    .from('job_reports')
    .select(
      `
      id,
      job_id,
      reporter_id,
      reason,
      description,
      status,
      admin_notes,
      created_at,
      jobs:job_id (id, title, company_name, recruiter_id, scam_score, published, approval_status),
      profiles:reporter_id (id, full_name, email, role)
    `
    )
    .order('created_at', { ascending: false })
    .limit(200);

  // Counts by status
  const { count: pendingCount } = await supabase
    .from('job_reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending');

  const { count: totalCount } = await supabase
    .from('job_reports')
    .select('id', { count: 'exact', head: true });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Job Reports</h1>
        <p className="text-neutral-400 mt-1">
          {pendingCount ?? 0} pending · {totalCount ?? 0} total
        </p>
      </div>
      <ReportsClient reports={(reports || []) as unknown as Parameters<typeof ReportsClient>[0]['reports']} />
    </div>
  );
}
