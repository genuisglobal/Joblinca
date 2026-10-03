/**
 * Job reports, shared by POST /api/jobs/[id]/report and the WhatsApp agent so
 * both feed the same escalation loop: scam reports count against the
 * company's reputation, and enough distinct reporters pull the job down and
 * send it back to review.
 */

import type { createServiceSupabaseClient } from '@/lib/supabase/service';
import { recordCompanyEvent } from '@/lib/aggregation/company-reputation';

type ServiceClient = ReturnType<typeof createServiceSupabaseClient>;

/** Distinct reporters needed before a job is auto-unpublished for review */
export const AUTO_UNPUBLISH_THRESHOLD = 3;

/** Reports one user may file per rolling hour. */
export const REPORTS_PER_HOUR = 5;

export const VALID_REPORT_REASONS = [
  'scam',
  'misleading',
  'duplicate',
  'offensive',
  'wrong_info',
  'other',
] as const;

export type ReportReason = (typeof VALID_REPORT_REASONS)[number];

export function isReportReason(value: unknown): value is ReportReason {
  return typeof value === 'string' && (VALID_REPORT_REASONS as readonly string[]).includes(value);
}

/**
 * Best-effort follow-up after a report is stored. Never throws: the report
 * itself already succeeded.
 */
export async function escalateJobReport(
  service: ServiceClient,
  jobId: string,
  reason: ReportReason
): Promise<void> {
  try {
    const { data: reportedJob } = await service
      .from('jobs')
      .select('id, published, company_name, origin_type, origin_discovered_job_id')
      .eq('id', jobId)
      .maybeSingle();

    // Scam reports count against the company's reputation
    if (reason === 'scam' && reportedJob?.company_name) {
      await recordCompanyEvent(service, reportedJob.company_name, 'scam_report');
    }

    // Enough distinct reporters → pull the job down and send it back to review
    const { count } = await service
      .from('job_reports')
      .select('id', { count: 'exact', head: true })
      .eq('job_id', jobId)
      .neq('status', 'dismissed');

    if ((count ?? 0) >= AUTO_UNPUBLISH_THRESHOLD && reportedJob?.published) {
      const { error: unpubErr } = await service
        .from('jobs')
        .update({ published: false, lifecycle_status: 'removed' })
        .eq('id', jobId);

      if (!unpubErr) {
        console.log(
          `[report] Job ${jobId} auto-unpublished after ${count} reports (latest: ${reason})`
        );
        if (reportedJob.origin_discovered_job_id) {
          await service
            .from('discovered_jobs')
            .update({
              verification_status: 'suspicious',
              ingestion_status: 'review_required',
            })
            .eq('id', reportedJob.origin_discovered_job_id);
        }
      }
    }
  } catch (escalationErr) {
    console.error('[report] Escalation failed (non-fatal):', escalationErr);
  }
}

export type SubmitReportResult =
  | { status: 'reported' }
  | { status: 'duplicate' | 'own_job' | 'not_found' | 'rate_limited' }
  | { status: 'error'; message: string };

/**
 * File a report on behalf of a user whose identity the caller has already
 * verified (the WhatsApp agent: phone-verified account link). Applies the
 * same rules as the website route -- no self-reports, one report per job per
 * user, five per hour -- then escalates.
 */
export async function submitJobReportAsService(
  service: ServiceClient,
  params: { jobId: string; reporterId: string; reason: ReportReason; description: string | null }
): Promise<SubmitReportResult> {
  const { data: job } = await service
    .from('jobs')
    .select('id, recruiter_id, posted_by')
    .eq('id', params.jobId)
    .maybeSingle();
  if (!job) return { status: 'not_found' };
  if (job.recruiter_id === params.reporterId || job.posted_by === params.reporterId) {
    return { status: 'own_job' };
  }

  const { count: recent } = await service
    .from('job_reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', params.reporterId)
    .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
  if ((recent ?? 0) >= REPORTS_PER_HOUR) return { status: 'rate_limited' };

  const { error } = await service.from('job_reports').insert({
    job_id: params.jobId,
    reporter_id: params.reporterId,
    reason: params.reason,
    description: params.description ? params.description.slice(0, 1000) : null,
  });
  if (error) {
    if (error.code === '23505') return { status: 'duplicate' };
    return { status: 'error', message: error.message };
  }

  await escalateJobReport(service, params.jobId, params.reason);
  return { status: 'reported' };
}
