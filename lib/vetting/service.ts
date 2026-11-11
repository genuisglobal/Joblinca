/**
 * Data access for the Shortlist Service vetting queue. Every function takes
 * a service-role client: callers must have checked admin access (or, for the
 * recruiter view, ownership) first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';
import { notifyRecruiterViaWhatsApp } from '@/lib/jobs/recruiter-notify';
import { billingModelForPlan, DEFAULT_SUCCESS_FEE_PERCENT, type BillingModel } from './billing';
import {
  buildShortlistDeliveredMessage,
  computeDueAt,
  isOpenStatus,
  rankCandidates,
  type NormalizedSelection,
  type RankedPoolCandidate,
  type ScreeningLabel,
  type VettingSource,
} from './queue';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/+$/, '');

const UNIQUE_VIOLATION = '23505';

export class VettingError extends Error {
  constructor(message: string, readonly status: number = 400) {
    super(message);
    this.name = 'VettingError';
  }
}

function single<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

// ---------------------------------------------------------------------------
// Creating requests
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  title: string;
  recruiter_id: string;
  company_name: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Accepts a job UUID, a public_id, or a joblinca.com job URL ending in either. */
export async function resolveJob(supabase: SupabaseClient, jobRef: string): Promise<JobRow> {
  const ref = jobRef.trim().replace(/\/+$/, '').split('/').pop() ?? '';
  if (!ref) throw new VettingError('Enter a job ID or link');

  const query = supabase.from('jobs').select('id, title, recruiter_id, company_name');
  const { data, error } = await (UUID_RE.test(ref)
    ? query.eq('id', ref)
    : query.eq('public_id', ref)
  ).maybeSingle();

  if (error) throw new VettingError(error.message, 500);
  if (!data) throw new VettingError('Job not found', 404);
  return data as JobRow;
}

/**
 * Called from payment finalisation. Idempotent per transaction (unique index),
 * and a no-op when the job already has an open request.
 */
export async function createShortlistRequestForPayment(
  supabase: SupabaseClient,
  params: { transactionId: string; jobId: string }
): Promise<string | null> {
  const [{ data: job }, { data: transaction }] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title, recruiter_id, company_name')
      .eq('id', params.jobId)
      .maybeSingle(),
    supabase
      .from('transactions')
      .select('id, pricing_plans(slug)')
      .eq('id', params.transactionId)
      .maybeSingle(),
  ]);
  if (!job) return null;

  const plan = single(
    (transaction?.pricing_plans ?? null) as { slug: string } | { slug: string }[] | null
  );
  const billingModel = billingModelForPlan(plan?.slug ?? '');

  const { data, error } = await supabase
    .from('vetting_requests')
    .insert({
      job_id: job.id,
      recruiter_id: job.recruiter_id,
      package: 'basic',
      status: 'pending',
      source: 'payment',
      billing_model: billingModel,
      transaction_id: params.transactionId,
      due_at: computeDueAt(new Date()).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code !== UNIQUE_VIOLATION) throw error;
    // Either this payment already has a request (webhook + status poll both
    // finalised), or the job has an open unpaid request (e.g. a free trial in
    // progress). In the second case the payment takes that request over.
    const { data: upgraded } = await supabase
      .from('vetting_requests')
      .update({
        source: 'payment',
        billing_model: billingModel,
        transaction_id: params.transactionId,
        shortlist_size: 5,
        updated_at: new Date().toISOString(),
      })
      .eq('job_id', job.id)
      .in('status', ['pending', 'in_review'])
      .is('transaction_id', null)
      .select('id')
      .maybeSingle();
    return (upgraded?.id as string | undefined) ?? null;
  }

  await sendAdminWhatsAppAlert(
    `New ${billingModel === 'pay_per_result' ? 'pay-per-result' : 'paid'} shortlist: "${job.title}"${job.company_name ? ` (${job.company_name})` : ''}. ` +
      `Due in 72h. ${APP_URL}/admin/shortlists/${data.id}`
  ).catch(() => undefined);

  return data.id as string;
}

/**
 * Self-heal: create requests for paid shortlist jobs that have none (e.g. if
 * request creation failed during payment finalisation). Run on queue load.
 */
export async function syncPaidShortlistJobs(supabase: SupabaseClient): Promise<number> {
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('id, tier_transaction_id')
    .eq('hiring_tier', 'tier2_shortlist')
    .is('removed_at', null)
    .limit(500);
  if (error || !jobs?.length) return 0;

  const { data: existing } = await supabase
    .from('vetting_requests')
    .select('job_id')
    .in(
      'job_id',
      jobs.map((j) => j.id as string)
    );
  const covered = new Set((existing ?? []).map((r) => r.job_id as string));

  let created = 0;
  for (const job of jobs) {
    if (covered.has(job.id as string) || !job.tier_transaction_id) continue;
    const id = await createShortlistRequestForPayment(supabase, {
      transactionId: job.tier_transaction_id as string,
      jobId: job.id as string,
    }).catch(() => null);
    if (id) created += 1;
  }
  return created;
}

/** Admin-created request, e.g. the free first shortlist offered in sales. */
export async function createManualShortlistRequest(
  supabase: SupabaseClient,
  params: {
    jobRef: string;
    source: Extract<VettingSource, 'manual' | 'free_trial'>;
    shortlistSize: number;
    createdBy: string;
    /** Manual requests only: 'prepaid' (paid offline) or 'success_fee'. */
    billingModel?: Extract<BillingModel, 'prepaid' | 'success_fee'>;
    successFeePercent?: number | null;
  }
): Promise<string> {
  const job = await resolveJob(supabase, params.jobRef);
  const billingModel: BillingModel =
    params.source === 'free_trial' ? 'free' : params.billingModel ?? 'prepaid';
  const { data, error } = await supabase
    .from('vetting_requests')
    .insert({
      job_id: job.id,
      recruiter_id: job.recruiter_id,
      package: 'basic',
      status: 'pending',
      source: params.source,
      billing_model: billingModel,
      success_fee_percent:
        billingModel === 'success_fee'
          ? params.successFeePercent ?? DEFAULT_SUCCESS_FEE_PERCENT
          : null,
      shortlist_size: params.shortlistSize,
      assigned_to: params.createdBy,
      due_at: computeDueAt(new Date()).toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new VettingError('This job already has an open shortlist request', 409);
    }
    throw new VettingError(error.message, 500);
  }
  return data.id as string;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

export interface VettingRequestRow {
  id: string;
  job_id: string;
  recruiter_id: string;
  status: string;
  source: string;
  billing_model: BillingModel;
  success_fee_percent: number | null;
  shortlist_size: number;
  due_at: string | null;
  assigned_to: string | null;
  officer_notes: string | null;
  delivered_at: string | null;
  cancelled_reason: string | null;
  created_at: string;
  job: {
    id: string;
    title: string;
    company_name: string | null;
    location: string | null;
    public_id: string | null;
    published: boolean | null;
    approval_status: string | null;
  } | null;
  recruiter: { full_name: string | null; email: string | null; phone: string | null } | null;
  assignee: { full_name: string | null; email: string | null } | null;
}

const REQUEST_SELECT = `
  id, job_id, recruiter_id, status, source, billing_model, success_fee_percent, shortlist_size, due_at, assigned_to,
  officer_notes, delivered_at, cancelled_reason, created_at,
  job:jobs!job_id (id, title, company_name, location, public_id, published, approval_status),
  assignee:profiles!assigned_to (full_name, email)
`;

// recruiter_id references recruiters, not profiles, so PostgREST can't embed
// the recruiter's profile; it is loaded in a second query instead.
async function withRecruiters(
  supabase: SupabaseClient,
  rows: Record<string, unknown>[]
): Promise<VettingRequestRow[]> {
  const recruiterIds = Array.from(new Set(rows.map((r) => r.recruiter_id as string)));
  const { data: profiles } = recruiterIds.length
    ? await supabase.from('profiles').select('id, full_name, email, phone').in('id', recruiterIds)
    : { data: [] };
  const byId = new Map((profiles ?? []).map((p) => [p.id as string, p]));

  return rows.map((row) => {
    const recruiter = byId.get(row.recruiter_id as string);
    return {
      ...(row as unknown as VettingRequestRow),
      job: single(row.job as VettingRequestRow['job'] | VettingRequestRow['job'][]),
      assignee: single(row.assignee as VettingRequestRow['assignee'] | VettingRequestRow['assignee'][]),
      recruiter: recruiter
        ? {
            full_name: (recruiter.full_name as string | null) ?? null,
            email: (recruiter.email as string | null) ?? null,
            phone: (recruiter.phone as string | null) ?? null,
          }
        : null,
    };
  });
}

export async function listVettingRequests(
  supabase: SupabaseClient,
  view: 'open' | 'done'
): Promise<VettingRequestRow[]> {
  let query = supabase.from('vetting_requests').select(REQUEST_SELECT);
  query =
    view === 'open'
      ? query.in('status', ['pending', 'in_review']).order('due_at', { ascending: true, nullsFirst: false })
      : query.in('status', ['delivered', 'completed', 'cancelled']).order('updated_at', { ascending: false }).limit(100);

  const { data, error } = await query;
  if (error) throw new VettingError(error.message, 500);
  return withRecruiters(supabase, (data ?? []) as Record<string, unknown>[]);
}

export async function getVettingRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<VettingRequestRow> {
  const { data, error } = await supabase
    .from('vetting_requests')
    .select(REQUEST_SELECT)
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!data) throw new VettingError('Shortlist request not found', 404);
  const [row] = await withRecruiters(supabase, [data as Record<string, unknown>]);
  return row;
}

export interface PoolCandidate extends RankedPoolCandidate {
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  resumeUrl: string | null;
  screeningSummary: string | null;
  screeningRecommendation: string | null;
  strengths: string[];
  risks: string[];
}

/**
 * Every applicant to the job, merged with their latest completed WhatsApp
 * screening and ranked (lib/vetting/queue.ts rankCandidates).
 */
export async function loadCandidatePool(
  supabase: SupabaseClient,
  jobId: string
): Promise<PoolCandidate[]> {
  const { data: applications, error: appError } = await supabase
    .from('applications')
    .select(
      'id, applicant_id, status, eligibility_status, ranking_score, resume_url, submitted_at, created_at, is_draft'
    )
    .eq('job_id', jobId)
    .order('created_at', { ascending: true })
    .limit(1000);
  if (appError) throw new VettingError(appError.message, 500);

  const submitted = (applications ?? []).filter((a) => !a.is_draft);
  if (submitted.length === 0) return [];

  const applicantIds = Array.from(new Set(submitted.map((a) => a.applicant_id as string)));

  const [{ data: profiles, error: profileError }, { data: sessions, error: sessionError }] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, email, phone, residence_location')
        .in('id', applicantIds),
      supabase
        .from('wa_screening_sessions')
        .select(
          'user_id, weighted_score, result_label, must_have_passed, ai_summary_text, ai_recommendation, ai_key_strengths, ai_key_risks, completed_at'
        )
        .eq('job_id', jobId)
        .eq('state', 'completed')
        .in('user_id', applicantIds)
        .order('completed_at', { ascending: false }),
    ]);
  if (profileError) throw new VettingError(profileError.message, 500);
  if (sessionError) throw new VettingError(sessionError.message, 500);

  const profileById = new Map((profiles ?? []).map((p) => [p.id as string, p]));
  // Sessions are newest first: keep the first one seen per user.
  const sessionByUser = new Map<string, Record<string, unknown>>();
  for (const s of sessions ?? []) {
    const userId = s.user_id as string | null;
    if (userId && !sessionByUser.has(userId)) sessionByUser.set(userId, s);
  }

  const ranked = rankCandidates(
    submitted.map((a) => {
      const s = sessionByUser.get(a.applicant_id as string);
      return {
        applicationId: a.id as string,
        candidateId: a.applicant_id as string,
        applicationStatus: (a.status as string | null) ?? null,
        eligibilityStatus: (a.eligibility_status as string | null) ?? null,
        rankingScore: a.ranking_score == null ? null : Number(a.ranking_score),
        screeningScore: s?.weighted_score == null ? null : Number(s.weighted_score),
        screeningLabel: (s?.result_label as ScreeningLabel | null) ?? null,
        mustHavePassed: (s?.must_have_passed as boolean | null) ?? null,
        submittedAt: ((a.submitted_at ?? a.created_at) as string | null) ?? null,
      };
    })
  );

  const appById = new Map(submitted.map((a) => [a.id as string, a]));
  return ranked.map((c) => {
    const profile = profileById.get(c.candidateId);
    const session = sessionByUser.get(c.candidateId);
    return {
      ...c,
      fullName: (profile?.full_name as string | null) ?? null,
      email: (profile?.email as string | null) ?? null,
      phone: (profile?.phone as string | null) ?? null,
      location: (profile?.residence_location as string | null) ?? null,
      resumeUrl: (appById.get(c.applicationId)?.resume_url as string | null) ?? null,
      screeningSummary: (session?.ai_summary_text as string | null) ?? null,
      screeningRecommendation: (session?.ai_recommendation as string | null) ?? null,
      strengths: (session?.ai_key_strengths as string[] | null) ?? [],
      risks: (session?.ai_key_risks as string[] | null) ?? [],
    };
  });
}

export interface SavedSelection {
  applicationId: string;
  candidateId: string;
  rank: number;
  note: string | null;
}

export async function loadSelection(
  supabase: SupabaseClient,
  requestId: string
): Promise<SavedSelection[]> {
  const { data, error } = await supabase
    .from('vetting_results')
    .select('application_id, candidate_id, rank, officer_note')
    .eq('vetting_request_id', requestId)
    .order('rank', { ascending: true });
  if (error) throw new VettingError(error.message, 500);
  return (data ?? [])
    .filter((r) => r.application_id)
    .map((r) => ({
      applicationId: r.application_id as string,
      candidateId: r.candidate_id as string,
      rank: (r.rank as number | null) ?? 0,
      note: (r.officer_note as string | null) ?? null,
    }));
}

// ---------------------------------------------------------------------------
// Officer actions
// ---------------------------------------------------------------------------

async function requireOpenRequest(supabase: SupabaseClient, requestId: string) {
  const { data, error } = await supabase
    .from('vetting_requests')
    .select('id, job_id, status, shortlist_size, assigned_to')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!data) throw new VettingError('Shortlist request not found', 404);
  if (!isOpenStatus(data.status as string)) {
    throw new VettingError(`This request is already ${data.status}`, 409);
  }
  return data as {
    id: string;
    job_id: string;
    status: string;
    shortlist_size: number;
    assigned_to: string | null;
  };
}

export async function updateVettingRequest(
  supabase: SupabaseClient,
  requestId: string,
  params:
    | { action: 'claim'; userId: string }
    | { action: 'release' }
    | { action: 'cancel'; reason: string }
    | { action: 'notes'; notes: string | null; shortlistSize?: number }
): Promise<void> {
  await requireOpenRequest(supabase, requestId);
  const now = new Date().toISOString();

  const patch: Record<string, unknown> = { updated_at: now };
  switch (params.action) {
    case 'claim':
      patch.assigned_to = params.userId;
      patch.status = 'in_review';
      break;
    case 'release':
      patch.assigned_to = null;
      patch.status = 'pending';
      break;
    case 'cancel':
      if (!params.reason.trim()) throw new VettingError('Give a reason for cancelling');
      patch.status = 'cancelled';
      patch.cancelled_reason = params.reason.trim().slice(0, 500);
      break;
    case 'notes':
      patch.officer_notes = params.notes?.trim().slice(0, 2000) || null;
      if (params.shortlistSize !== undefined) patch.shortlist_size = params.shortlistSize;
      break;
  }

  const { error } = await supabase.from('vetting_requests').update(patch).eq('id', requestId);
  if (error) throw new VettingError(error.message, 500);
}

/** Replace the request's draft shortlist with the officer's ordered selection. */
export async function saveSelection(
  supabase: SupabaseClient,
  requestId: string,
  selection: NormalizedSelection[],
  userId: string
): Promise<void> {
  const request = await requireOpenRequest(supabase, requestId);

  let candidateByApplication = new Map<string, string>();
  if (selection.length > 0) {
    const { data: apps, error } = await supabase
      .from('applications')
      .select('id, applicant_id')
      .eq('job_id', request.job_id)
      .in(
        'id',
        selection.map((s) => s.applicationId)
      );
    if (error) throw new VettingError(error.message, 500);
    candidateByApplication = new Map((apps ?? []).map((a) => [a.id as string, a.applicant_id as string]));
    const missing = selection.filter((s) => !candidateByApplication.has(s.applicationId));
    if (missing.length > 0) {
      throw new VettingError('Some selected applications do not belong to this job');
    }
  }

  const { error: deleteError } = await supabase
    .from('vetting_results')
    .delete()
    .eq('vetting_request_id', requestId);
  if (deleteError) throw new VettingError(deleteError.message, 500);

  if (selection.length > 0) {
    const now = new Date().toISOString();
    const { error: insertError } = await supabase.from('vetting_results').insert(
      selection.map((s) => ({
        vetting_request_id: requestId,
        application_id: s.applicationId,
        candidate_id: candidateByApplication.get(s.applicationId),
        rank: s.rank,
        officer_note: s.note,
        updated_at: now,
      }))
    );
    if (insertError) throw new VettingError(insertError.message, 500);
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (request.status === 'pending') {
    patch.status = 'in_review';
    if (!request.assigned_to) patch.assigned_to = userId;
  }
  await supabase.from('vetting_requests').update(patch).eq('id', requestId);
}

export interface DeliveryResult {
  candidateCount: number;
  whatsappSent: boolean;
}

/**
 * Mark the saved shortlist delivered and tell the recruiter. The WhatsApp
 * message is best-effort: delivery stands even if it fails, and the officer
 * is told so they can follow up by hand.
 */
export async function deliverShortlist(
  supabase: SupabaseClient,
  requestId: string,
  userId: string
): Promise<DeliveryResult> {
  const request = await requireOpenRequest(supabase, requestId);
  const selection = await loadSelection(supabase, requestId);
  if (selection.length === 0) {
    throw new VettingError('Save at least one candidate before delivering');
  }

  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('vetting_requests')
    .update({ status: 'delivered', delivered_at: now, delivered_by: userId, updated_at: now })
    .eq('id', requestId)
    .in('status', ['pending', 'in_review'])
    .select('id, recruiter_id')
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!updated) throw new VettingError('This request was just delivered or cancelled', 409);

  const { data: job } = await supabase
    .from('jobs')
    .select('title')
    .eq('id', request.job_id)
    .maybeSingle();

  const whatsappSent = await notifyRecruiterViaWhatsApp(
    supabase,
    updated.recruiter_id as string,
    buildShortlistDeliveredMessage({
      jobTitle: (job?.title as string | undefined) ?? 'your job',
      candidateCount: selection.length,
      link: `${APP_URL}/dashboard/recruiter/shortlists`,
    })
  );

  return { candidateCount: selection.length, whatsappSent };
}

// ---------------------------------------------------------------------------
// Recruiter view
// ---------------------------------------------------------------------------

export interface RecruiterShortlistCandidate {
  applicationId: string;
  candidateId: string;
  rank: number;
  note: string | null;
  fullName: string | null;
  location: string | null;
  hire: {
    id: string;
    status: string;
    amountXaf: number | null;
    hiredAt: string;
  } | null;
}

export interface RecruiterShortlist {
  id: string;
  status: string;
  billingModel: BillingModel;
  dueAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  job: { id: string; title: string } | null;
  candidates: RecruiterShortlistCandidate[];
}

export async function listRecruiterShortlists(
  supabase: SupabaseClient,
  recruiterId: string
): Promise<RecruiterShortlist[]> {
  const { data: requests, error } = await supabase
    .from('vetting_requests')
    .select('id, status, billing_model, due_at, delivered_at, created_at, job:jobs!job_id (id, title)')
    .eq('recruiter_id', recruiterId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new VettingError(error.message, 500);

  const rows = requests ?? [];
  const deliveredIds = rows
    .filter((r) => r.status === 'delivered' || r.status === 'completed')
    .map((r) => r.id as string);

  const resultsByRequest = new Map<string, RecruiterShortlistCandidate[]>();
  if (deliveredIds.length > 0) {
    const [{ data: results, error: resultsError }, { data: hires, error: hiresError }] =
      await Promise.all([
        supabase
          .from('vetting_results')
          .select('vetting_request_id, application_id, candidate_id, rank, officer_note, candidate:profiles!candidate_id (full_name, residence_location)')
          .in('vetting_request_id', deliveredIds)
          .order('rank', { ascending: true }),
        supabase
          .from('shortlist_hires')
          .select('id, vetting_request_id, candidate_id, status, amount_xaf, hired_at')
          .in('vetting_request_id', deliveredIds),
      ]);
    if (resultsError) throw new VettingError(resultsError.message, 500);
    if (hiresError) throw new VettingError(hiresError.message, 500);

    const hireByKey = new Map(
      (hires ?? []).map((h) => [`${h.vetting_request_id}:${h.candidate_id}`, h])
    );

    for (const r of results ?? []) {
      if (!r.application_id) continue;
      const candidate = single(
        r.candidate as unknown as { full_name: string | null; residence_location: string | null } | null
      );
      const hire = hireByKey.get(`${r.vetting_request_id}:${r.candidate_id}`);
      const list = resultsByRequest.get(r.vetting_request_id as string) ?? [];
      list.push({
        applicationId: r.application_id as string,
        candidateId: r.candidate_id as string,
        rank: (r.rank as number | null) ?? list.length + 1,
        note: (r.officer_note as string | null) ?? null,
        fullName: candidate?.full_name ?? null,
        location: candidate?.residence_location ?? null,
        hire: hire
          ? {
              id: hire.id as string,
              status: hire.status as string,
              amountXaf: (hire.amount_xaf as number | null) ?? null,
              hiredAt: hire.hired_at as string,
            }
          : null,
      });
      resultsByRequest.set(r.vetting_request_id as string, list);
    }
  }

  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as string,
    billingModel: r.billing_model as BillingModel,
    dueAt: (r.due_at as string | null) ?? null,
    deliveredAt: (r.delivered_at as string | null) ?? null,
    createdAt: r.created_at as string,
    job: single(r.job as unknown as { id: string; title: string } | null),
    candidates: resultsByRequest.get(r.id as string) ?? [],
  }));
}

/** The recruiter's live jobs that have no open shortlist request: what they can buy one for. */
export async function listShortlistableJobs(
  supabase: SupabaseClient,
  recruiterId: string
): Promise<Array<{ id: string; title: string }>> {
  const [{ data: jobs, error }, { data: open }] = await Promise.all([
    supabase
      .from('jobs')
      .select('id, title')
      .eq('recruiter_id', recruiterId)
      .eq('published', true)
      .is('removed_at', null)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('vetting_requests')
      .select('job_id')
      .eq('recruiter_id', recruiterId)
      .in('status', ['pending', 'in_review']),
  ]);
  if (error) throw new VettingError(error.message, 500);
  const busy = new Set((open ?? []).map((r) => r.job_id as string));
  return (jobs ?? [])
    .filter((j) => !busy.has(j.id as string))
    .map((j) => ({ id: j.id as string, title: j.title as string }));
}
