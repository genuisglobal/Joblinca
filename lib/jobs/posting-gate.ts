/**
 * Smart approval gate for recruiter-posted jobs.
 *
 * Two layers cut approval latency for legitimate recruiters to near zero
 * while keeping scam protection:
 *
 * 1. FAST PATH (synchronous at post time, no LLM): a clean post from a
 *    verified recruiter — or a company with 'verified' reputation — whose
 *    company isn't on the watch/blocked list publishes immediately.
 *
 * 2. REVIEW SWEEP (cron, runs with pipeline maintenance): pending jobs get
 *    one gpt-4o-mini review each. Clean verdicts auto-approve and publish;
 *    scammy verdicts alert admins; the gray middle stays for human review.
 *
 * Both layers degrade gracefully: missing OPENAI_API_KEY skips the sweep,
 * missing migration columns log and skip, notification failures never block.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { getCompanyReputation, recordCompanyEvent } from '@/lib/aggregation/company-reputation';
import { dispatchJobMatchNotifications } from '@/lib/matching-agent/dispatch';
import { resolveJobLifecycleStatus, isJobPubliclyListable } from '@/lib/jobs/lifecycle';
import { notifyRecruiterViaWhatsApp } from '@/lib/jobs/recruiter-notify';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';

const MODEL = 'gpt-4o-mini';
const REVIEW_BATCH_LIMIT = 10;
const CLEAN_THRESHOLD = 15;
const SCAM_THRESHOLD = 60;

export interface FastApprovalInput {
  recruiterId: string;
  companyName: string | null | undefined;
  scamSuspicious: boolean;
}

/**
 * Synchronous fast path — one indexed read each, no LLM.
 * Requires a service-role client (company_reputation is admin-RLS'd).
 */
export async function evaluateFastApproval(
  service: SupabaseClient,
  { recruiterId, companyName, scamSuspicious }: FastApprovalInput
): Promise<boolean> {
  if (scamSuspicious) return false;

  try {
    const [recruiterResult, reputation] = await Promise.all([
      service.from('recruiters').select('verified').eq('id', recruiterId).maybeSingle(),
      getCompanyReputation(service, companyName),
    ]);

    if (reputation?.status === 'blocked' || reputation?.status === 'watch') {
      return false;
    }

    return recruiterResult.data?.verified === true || reputation?.status === 'verified';
  } catch (err) {
    // Fail closed to the normal review queue — never auto-publish on error
    console.error('[posting-gate] Fast approval check failed:', err);
    return false;
  }
}

export interface PendingReviewStats {
  skipped?: string;
  examined: number;
  approved: number;
  flagged: number;
  left_for_human: number;
  errors: number;
}

interface PendingJobRow {
  id: string;
  title: string;
  description: string | null;
  company_name: string | null;
  location: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  apply_method: string | null;
  external_apply_url: string | null;
  apply_email: string | null;
  apply_phone: string | null;
  apply_whatsapp: string | null;
  closes_at: string | null;
  scam_score: number | null;
  recruiter_id: string | null;
}

const REVIEW_SYSTEM_PROMPT = `You review job postings submitted by recruiters on a Cameroonian job platform (French or English). Assess whether the posting is a legitimate job or a scam. Return valid JSON:
{
  "scam_probability": number 0-100 (pay-to-apply fees, MLM/pyramid schemes, "gagner de l'argent facilement", vague get-rich promises, requests for money or bank details, impersonating a well-known company with only a personal contact, unrealistic salary for the role),
  "reasons": string[] (specific red flags found, empty if none)
}
A normal posting with a named employer, clear duties/requirements, and a plausible application channel is legitimate. Judge on evidence, not tone.`;

function buildReviewPrompt(job: PendingJobRow): string {
  const salary =
    job.salary_min || job.salary_max
      ? `${job.salary_min ?? '?'}–${job.salary_max ?? '?'} ${job.salary_currency || 'XAF'}`
      : '(none stated)';
  const contacts = [
    job.external_apply_url && `url ${job.external_apply_url}`,
    job.apply_email && `email ${job.apply_email}`,
    job.apply_phone && `phone ${job.apply_phone}`,
    job.apply_whatsapp && `whatsapp ${job.apply_whatsapp}`,
  ]
    .filter(Boolean)
    .join(', ');

  return [
    `Title: ${job.title}`,
    `Company: ${job.company_name || '(none stated)'}`,
    `Location: ${job.location || '(none)'}`,
    `Salary: ${salary}`,
    `Apply via: ${job.apply_method || 'joblinca'}${contacts ? ` (${contacts})` : ''}`,
    '',
    `Description:\n${(job.description || '(no description)').slice(0, 4000)}`,
  ].join('\n');
}

async function approvePendingJob(service: SupabaseClient, job: PendingJobRow): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const lifecycleStatus = resolveJobLifecycleStatus({
    published: true,
    approval_status: 'approved',
    closes_at: job.closes_at,
    removed_at: null,
    archived_at: null,
    filled_at: null,
  });

  const { data: approved, error } = await service
    .from('jobs')
    .update({
      approval_status: 'approved',
      approved_at: nowIso,
      approved_by: null,
      published: true,
      lifecycle_status: lifecycleStatus,
      rejection_reason: null,
    })
    .eq('id', job.id)
    .eq('approval_status', 'pending')
    .select('*')
    .single();

  if (error || !approved) {
    console.error(`[posting-gate] Auto-approve update failed for ${job.id}:`, error?.message);
    return false;
  }

  if (isJobPubliclyListable(approved)) {
    try {
      await dispatchJobMatchNotifications({ jobId: job.id, trigger: 'job_posted' });
    } catch (matchErr) {
      console.error('[posting-gate] Match dispatch failed (non-fatal):', matchErr);
    }
  }

  await recordCompanyEvent(service, job.company_name, 'published');

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/+$/, '');
  await notifyRecruiterViaWhatsApp(
    service,
    job.recruiter_id,
    `✅ Your job "${job.title}" has been approved and is now live on Joblinca!\n${appUrl}/jobs/${job.id}`
  );

  return true;
}

/**
 * LLM sweep over unreviewed pending jobs. Called from pipeline maintenance,
 * so it runs several times a day — a clean post waits hours at most.
 */
export async function runPendingJobsReview(
  service: SupabaseClient,
  limit = REVIEW_BATCH_LIMIT
): Promise<PendingReviewStats> {
  const stats: PendingReviewStats = {
    examined: 0,
    approved: 0,
    flagged: 0,
    left_for_human: 0,
    errors: 0,
  };

  if (!process.env.OPENAI_API_KEY) {
    return { ...stats, skipped: 'OPENAI_API_KEY not configured' };
  }

  const { data: pending, error } = await service
    .from('jobs')
    .select(
      'id, title, description, company_name, location, salary_min, salary_max, salary_currency, apply_method, external_apply_url, apply_email, apply_phone, apply_whatsapp, closes_at, scam_score, recruiter_id'
    )
    .eq('approval_status', 'pending')
    .eq('published', false)
    .is('ai_reviewed_at', null)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    // Most likely the migration hasn't been applied yet — skip quietly
    console.error('[posting-gate] Pending query failed (migration applied?):', error.message);
    return { ...stats, skipped: `query failed: ${error.message}` };
  }

  const jobs = (pending || []) as PendingJobRow[];
  stats.examined = jobs.length;
  if (jobs.length === 0) return stats;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const flaggedSummaries: string[] = [];

  for (const job of jobs) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: REVIEW_SYSTEM_PROMPT },
          { role: 'user', content: buildReviewPrompt(job) },
        ],
        max_tokens: 500,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices?.[0]?.message?.content?.trim();
      let probability: number | null = null;
      let reasons: string[] = [];
      try {
        const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
        const value = Number(parsed?.scam_probability);
        if (Number.isFinite(value)) {
          probability = Math.max(0, Math.min(100, Math.round(value)));
        }
        if (Array.isArray(parsed?.reasons)) {
          reasons = (parsed!.reasons as unknown[])
            .filter((r): r is string => typeof r === 'string')
            .slice(0, 6);
        }
      } catch {
        probability = null;
      }

      const reviewJson = {
        model: MODEL,
        scam_probability: probability,
        reasons,
        keyword_scam_score: job.scam_score,
        verdict:
          probability === null
            ? 'unparseable'
            : probability <= CLEAN_THRESHOLD
              ? 'auto_approved'
              : probability >= SCAM_THRESHOLD
                ? 'flagged'
                : 'human_review',
      };

      const { error: markErr } = await service
        .from('jobs')
        .update({ ai_review_json: reviewJson, ai_reviewed_at: new Date().toISOString() })
        .eq('id', job.id);

      if (markErr) {
        console.error(`[posting-gate] Failed to mark review for ${job.id}:`, markErr.message);
        stats.errors++;
        continue;
      }

      if (probability !== null && probability <= CLEAN_THRESHOLD) {
        const approved = await approvePendingJob(service, job);
        if (approved) {
          stats.approved++;
        } else {
          stats.errors++;
        }
      } else if (probability !== null && probability >= SCAM_THRESHOLD) {
        stats.flagged++;
        flaggedSummaries.push(
          `• "${job.title}" — ${job.company_name || 'unknown company'} (${probability}%: ${reasons[0] || 'no reason given'})`
        );
      } else {
        stats.left_for_human++;
      }
    } catch (err) {
      console.error(`[posting-gate] Review error for ${job.id}:`, err);
      stats.errors++;
    }
  }

  if (flaggedSummaries.length > 0) {
    try {
      await sendAdminWhatsAppAlert(
        `🚩 ${flaggedSummaries.length} pending job post${flaggedSummaries.length !== 1 ? 's' : ''} flagged as likely scam:\n${flaggedSummaries.join('\n')}\n\nReview: joblinca.com/admin/jobs`
      );
    } catch (alertErr) {
      console.error('[posting-gate] Flag alert failed (non-fatal):', alertErr);
    }
  }

  console.log(
    `[posting-gate] Reviewed ${stats.examined}: ${stats.approved} auto-approved, ${stats.flagged} flagged, ${stats.left_for_human} for humans, ${stats.errors} errors`
  );

  return stats;
}
