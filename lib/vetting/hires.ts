/**
 * Hires of shortlisted candidates and the fees they trigger. Service-role
 * client only; callers check admin access or application ownership first.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';
import { notifyRecruiterViaWhatsApp } from '@/lib/jobs/recruiter-notify';
import {
  buildFeeDueMessage,
  computeHireFee,
  formatXaf,
  isBillingModel,
  isWithinIntroductionWindow,
  type BillingModel,
  type HireStatus,
} from './billing';
import { VettingError } from './service';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/+$/, '');
const UNIQUE_VIOLATION = '23505';
const DELIVERED = ['delivered', 'completed'];

export interface HireRow {
  id: string;
  vetting_request_id: string;
  recruiter_id: string;
  candidate_id: string;
  application_id: string | null;
  job_id: string | null;
  hired_at: string;
  detected_by: string;
  billing_model: BillingModel;
  fee_type: string | null;
  monthly_salary_xaf: number | null;
  amount_xaf: number | null;
  status: HireStatus;
  paid_at: string | null;
  notes: string | null;
  created_at: string;
}

const HIRE_SELECT =
  'id, vetting_request_id, recruiter_id, candidate_id, application_id, job_id, hired_at, detected_by, billing_model, fee_type, monthly_salary_xaf, amount_xaf, status, paid_at, notes, created_at';

interface RequestForHire {
  id: string;
  job_id: string;
  recruiter_id: string;
  status: string;
  billing_model: string;
  success_fee_percent: number | null;
  delivered_at: string | null;
}

async function loadRequest(supabase: SupabaseClient, requestId: string): Promise<RequestForHire> {
  const { data, error } = await supabase
    .from('vetting_requests')
    .select('id, job_id, recruiter_id, status, billing_model, success_fee_percent, delivered_at')
    .eq('id', requestId)
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!data) throw new VettingError('Shortlist request not found', 404);
  return data as RequestForHire;
}

async function notifyFeeDue(supabase: SupabaseClient, hire: HireRow) {
  if (hire.status !== 'due' || !hire.amount_xaf) return;
  const [{ data: candidate }, { data: job }] = await Promise.all([
    supabase.from('profiles').select('full_name').eq('id', hire.candidate_id).maybeSingle(),
    hire.job_id
      ? supabase.from('jobs').select('title').eq('id', hire.job_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  await notifyRecruiterViaWhatsApp(
    supabase,
    hire.recruiter_id,
    buildFeeDueMessage({
      candidateName: (candidate?.full_name as string | null) || 'your new hire',
      jobTitle: (job?.title as string | null) || 'your role',
      amountXaf: hire.amount_xaf,
      link: `${APP_URL}/dashboard/recruiter/shortlists`,
    })
  );
}

/**
 * Record that a shortlisted candidate was hired. Idempotent per
 * (request, candidate): a repeat returns the existing record, except that a
 * success-fee hire awaiting its salary is completed when a salary is given.
 */
export async function recordHire(
  supabase: SupabaseClient,
  params: {
    vettingRequestId: string;
    candidateId: string;
    applicationId?: string | null;
    jobId?: string | null;
    hiredAt?: string | null;
    monthlySalaryXaf?: number | null;
    detectedBy: 'officer' | 'recruiter_decision';
    createdBy?: string | null;
  }
): Promise<{ hire: HireRow; created: boolean }> {
  const request = await loadRequest(supabase, params.vettingRequestId);
  if (!DELIVERED.includes(request.status)) {
    throw new VettingError('Hires can only be recorded on a delivered shortlist', 409);
  }

  const { data: introduced } = await supabase
    .from('vetting_results')
    .select('id')
    .eq('vetting_request_id', request.id)
    .eq('candidate_id', params.candidateId)
    .limit(1)
    .maybeSingle();
  if (!introduced) {
    throw new VettingError('This candidate was not on the delivered shortlist');
  }

  const billingModel: BillingModel = isBillingModel(request.billing_model)
    ? request.billing_model
    : 'prepaid';
  const fee = computeHireFee({
    billingModel,
    monthlySalaryXaf: params.monthlySalaryXaf,
    successFeePercent: request.success_fee_percent,
  });

  const { data: inserted, error } = await supabase
    .from('shortlist_hires')
    .insert({
      vetting_request_id: request.id,
      recruiter_id: request.recruiter_id,
      candidate_id: params.candidateId,
      application_id: params.applicationId ?? null,
      job_id: params.jobId ?? request.job_id,
      hired_at: params.hiredAt || new Date().toISOString().slice(0, 10),
      detected_by: params.detectedBy,
      billing_model: billingModel,
      fee_type: fee.feeType,
      monthly_salary_xaf: params.monthlySalaryXaf ?? null,
      amount_xaf: fee.amountXaf,
      status: fee.status,
      notes: fee.basis,
      created_by: params.createdBy ?? null,
    })
    .select(HIRE_SELECT)
    .single();

  if (error) {
    if (error.code !== UNIQUE_VIOLATION) throw new VettingError(error.message, 500);
    const { data: existing } = await supabase
      .from('shortlist_hires')
      .select(HIRE_SELECT)
      .eq('vetting_request_id', request.id)
      .eq('candidate_id', params.candidateId)
      .single();
    const current = existing as HireRow;
    if (current.status === 'needs_review' && params.monthlySalaryXaf) {
      return { hire: await setHireSalary(supabase, current.id, params.monthlySalaryXaf), created: false };
    }
    return { hire: current, created: false };
  }

  const hire = inserted as HireRow;
  if (hire.status === 'due') {
    await notifyFeeDue(supabase, hire).catch(() => undefined);
  }
  await sendAdminWhatsAppAlert(
    `Hire recorded (${params.detectedBy === 'officer' ? 'by officer' : 'by recruiter'}): ` +
      `${hire.status === 'due' ? `${formatXaf(hire.amount_xaf ?? 0)} due` : hire.status.replace('_', ' ')}. ` +
      `${APP_URL}/admin/shortlists/${request.id}`
  ).catch(() => undefined);

  return { hire, created: true };
}

/**
 * Called when a recruiter marks an application hired. If the candidate was on
 * one of this recruiter's delivered shortlists within the introduction window,
 * record the hire against the most recent such shortlist. Never throws.
 */
export async function recordHireFromApplication(
  supabase: SupabaseClient,
  applicationId: string
): Promise<HireRow | null> {
  try {
    const { data: app } = await supabase
      .from('applications')
      .select('id, applicant_id, job_id, job:jobs!job_id (recruiter_id)')
      .eq('id', applicationId)
      .maybeSingle();
    if (!app) return null;
    const job = (Array.isArray(app.job) ? app.job[0] : app.job) as { recruiter_id: string } | null;
    if (!job?.recruiter_id) return null;

    const { data: results } = await supabase
      .from('vetting_results')
      .select('vetting_request_id, request:vetting_requests!vetting_request_id (id, recruiter_id, status, delivered_at)')
      .eq('candidate_id', app.applicant_id as string);

    const now = new Date();
    const candidates = (results ?? [])
      .map((r) => (Array.isArray(r.request) ? r.request[0] : r.request) as {
        id: string;
        recruiter_id: string;
        status: string;
        delivered_at: string | null;
      } | null)
      .filter(
        (r): r is { id: string; recruiter_id: string; status: string; delivered_at: string } =>
          !!r &&
          r.recruiter_id === job.recruiter_id &&
          DELIVERED.includes(r.status) &&
          !!r.delivered_at &&
          isWithinIntroductionWindow(r.delivered_at, now)
      )
      .sort((a, b) => b.delivered_at.localeCompare(a.delivered_at));

    const request = candidates[0];
    if (!request) return null;

    const { hire } = await recordHire(supabase, {
      vettingRequestId: request.id,
      candidateId: app.applicant_id as string,
      applicationId: app.id as string,
      jobId: app.job_id as string,
      detectedBy: 'recruiter_decision',
    });
    return hire;
  } catch (err) {
    console.error('[vetting] recordHireFromApplication failed (non-fatal)', err);
    return null;
  }
}

/** Complete a success-fee hire once the salary is known. */
export async function setHireSalary(
  supabase: SupabaseClient,
  hireId: string,
  monthlySalaryXaf: number
): Promise<HireRow> {
  const { data: hire, error } = await supabase
    .from('shortlist_hires')
    .select(`${HIRE_SELECT}, request:vetting_requests!vetting_request_id (success_fee_percent)`)
    .eq('id', hireId)
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!hire) throw new VettingError('Hire not found', 404);
  if (hire.status !== 'needs_review' && hire.status !== 'due') {
    throw new VettingError(`This hire is already ${hire.status.replace('_', ' ')}`, 409);
  }
  const request = (Array.isArray(hire.request) ? hire.request[0] : hire.request) as {
    success_fee_percent: number | null;
  } | null;

  const fee = computeHireFee({
    billingModel: hire.billing_model as BillingModel,
    monthlySalaryXaf,
    successFeePercent: request?.success_fee_percent ?? null,
  });

  const { data: updated, error: updateError } = await supabase
    .from('shortlist_hires')
    .update({
      monthly_salary_xaf: monthlySalaryXaf,
      amount_xaf: fee.amountXaf,
      status: fee.status,
      notes: fee.basis,
      updated_at: new Date().toISOString(),
    })
    .eq('id', hireId)
    .in('status', ['needs_review', 'due'])
    .select(HIRE_SELECT)
    .single();
  if (updateError) throw new VettingError(updateError.message, 500);

  const result = updated as HireRow;
  if (hire.status === 'needs_review' && result.status === 'due') {
    await notifyFeeDue(supabase, result).catch(() => undefined);
  }
  return result;
}

export async function waiveHireFee(
  supabase: SupabaseClient,
  hireId: string,
  reason: string
): Promise<void> {
  if (!reason.trim()) throw new VettingError('Give a reason for waiving the fee');
  const { data, error } = await supabase
    .from('shortlist_hires')
    .update({ status: 'waived', notes: `Waived: ${reason.trim().slice(0, 500)}`, updated_at: new Date().toISOString() })
    .eq('id', hireId)
    .in('status', ['needs_review', 'due'])
    .select('id')
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!data) throw new VettingError('Only an unpaid fee can be waived', 409);
}

/** Payment finalisation: mark the fee paid. Idempotent. */
export async function markHireFeePaid(
  supabase: SupabaseClient,
  hireId: string,
  transactionId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('shortlist_hires')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      transaction_id: transactionId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', hireId)
    .eq('status', 'due')
    .select('id, amount_xaf, vetting_request_id')
    .maybeSingle();
  if (!data) return false;
  await sendAdminWhatsAppAlert(
    `Hire fee paid: ${formatXaf((data.amount_xaf as number) ?? 0)}. ${APP_URL}/admin/shortlists/${data.vetting_request_id}`
  ).catch(() => undefined);
  return true;
}

export async function listHiresForRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<HireRow[]> {
  const { data, error } = await supabase
    .from('shortlist_hires')
    .select(HIRE_SELECT)
    .eq('vetting_request_id', requestId)
    .order('created_at', { ascending: true });
  if (error) throw new VettingError(error.message, 500);
  return (data ?? []) as HireRow[];
}

/** A fee the given recruiter may pay now, or an error explaining why not. */
export async function getPayableHireFee(
  supabase: SupabaseClient,
  hireId: string,
  recruiterId: string
): Promise<{ id: string; amountXaf: number; jobId: string | null; feeType: string }> {
  const { data, error } = await supabase
    .from('shortlist_hires')
    .select('id, recruiter_id, status, amount_xaf, job_id, fee_type')
    .eq('id', hireId)
    .maybeSingle();
  if (error) throw new VettingError(error.message, 500);
  if (!data || data.recruiter_id !== recruiterId) throw new VettingError('Fee not found', 404);
  if (data.status !== 'due' || !data.amount_xaf) {
    throw new VettingError('This fee is not payable', 409);
  }
  return {
    id: data.id as string,
    amountXaf: data.amount_xaf as number,
    jobId: (data.job_id as string | null) ?? null,
    feeType: (data.fee_type as string) ?? 'hire_fee',
  };
}
