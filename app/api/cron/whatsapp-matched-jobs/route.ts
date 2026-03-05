import { NextRequest, NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendMatchedJobsDigestWhatsapp } from '@/lib/messaging/whatsapp';
import { getWaLimitContext } from '@/lib/whatsapp-agent/limits';
import { searchPublishedJobs } from '@/lib/whatsapp-agent/job-search';
import {
  computeMatchedJobsEligibility,
  type MatchedJobsEligibilityResult,
} from '@/lib/whatsapp-agent/matched-jobs-policy';
import { touchWeeklyMatchMarker } from '@/lib/whatsapp-agent/leads';
import { isAuthorizedCronRequest } from '@/lib/cron-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;

interface LeadCandidate {
  id: string;
  phone_e164: string;
  linked_user_id: string | null;
  role_selected: string | null;
  last_search_location: string | null;
  last_search_role_keywords: string | null;
  last_search_time_filter: '24h' | '7d' | '30d' | null;
  last_matched_jobs_sent_at: string | null;
  last_matched_jobs_week_key: string | null;
  wa_conversation_id: string | null;
}

interface DispatchSummary {
  selected: number;
  considered: number;
  sent: number;
  skipped: number;
  failed: number;
  duplicate: number;
  details: Array<{
    leadId: string;
    status: 'sent' | 'skipped' | 'failed' | 'duplicate';
    reason?: string;
  }>;
}

const cronDb = createServiceSupabaseClient();

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 160 ? message : `${message.slice(0, 157)}...`;
}

function buildMatchedMessage(params: {
  location: string;
  roleKeywords: string;
  subscribed: boolean;
  jobs: Array<{
    public_id: string | null;
    title: string | null;
    location: string | null;
    salary: number | null;
  }>;
}): string {
  const lines: string[] = [];
  if (params.subscribed) {
    lines.push('Matched jobs update (Premium)');
  } else {
    lines.push('Weekly matched jobs (Free plan)');
  }
  lines.push(`${params.roleKeywords} in ${params.location}`);
  lines.push('');

  for (const job of params.jobs) {
    const salary =
      job.salary === null || Number.isNaN(job.salary)
        ? 'N/A'
        : `${Math.round(job.salary).toLocaleString('en-US')} XAF`;
    lines.push(`${job.public_id || 'N/A'} | ${job.title || 'Untitled'} | ${job.location || 'N/A'} | ${salary}`);
  }

  lines.push('');
  lines.push('Reply DETAILS <JobID> or APPLY <JobID>.');
  lines.push('Reply MENU for full options.');
  return lines.join('\n');
}

async function claimDispatch(params: {
  leadId: string;
  dispatchKey: string;
  periodKey: string;
  isSubscribed: boolean;
}): Promise<{ id: string } | null> {
  const { data, error } = await cronDb
    .from('wa_matched_job_dispatches')
    .insert({
      wa_lead_id: params.leadId,
      dispatch_key: params.dispatchKey,
      period_key: params.periodKey,
      is_subscribed: params.isSubscribed,
      status: 'pending',
    })
    .select('id')
    .single();

  if (error) {
    if ((error as { code?: string }).code === '23505') {
      return null;
    }
    throw new Error(error.message);
  }

  return data as { id: string };
}

async function finalizeDispatch(params: {
  dispatchId: string;
  status: 'sent' | 'failed' | 'skipped';
  jobsPayload?: unknown[];
  error?: string | null;
}): Promise<void> {
  await cronDb
    .from('wa_matched_job_dispatches')
    .update({
      status: params.status,
      jobs_payload: params.jobsPayload || [],
      last_error: params.error || null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.dispatchId);
}

async function fetchLeadCandidates(limit: number): Promise<LeadCandidate[]> {
  const { data, error } = await cronDb
    .from('wa_leads')
    .select(
      'id, phone_e164, linked_user_id, role_selected, last_search_location, last_search_role_keywords, last_search_time_filter, last_matched_jobs_sent_at, last_matched_jobs_week_key, wa_conversation_id'
    )
    .eq('role_selected', 'jobseeker')
    .not('last_search_location', 'is', null)
    .not('last_search_role_keywords', 'is', null)
    .not('last_search_time_filter', 'is', null)
    .order('last_seen_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`fetchLeadCandidates failed: ${error.message}`);
  }

  const leads = (data || []) as LeadCandidate[];
  if (leads.length === 0) return [];

  const conversationIds = leads
    .map((lead) => lead.wa_conversation_id)
    .filter((id): id is string => Boolean(id));

  if (conversationIds.length === 0) return [];

  const { data: conversations } = await cronDb
    .from('wa_conversations')
    .select('id, opted_in')
    .in('id', conversationIds);

  const optedInSet = new Set(
    ((conversations || []) as Array<{ id: string; opted_in: boolean }>)
      .filter((c) => c.opted_in)
      .map((c) => c.id)
  );

  return leads.filter((lead) => lead.wa_conversation_id && optedInSet.has(lead.wa_conversation_id));
}

async function processLead(
  lead: LeadCandidate,
  subscriberFrequencyHours: number
): Promise<{ status: 'sent' | 'skipped' | 'failed' | 'duplicate'; reason?: string }> {
  const limits = await getWaLimitContext(lead.linked_user_id);
  const eligibility: MatchedJobsEligibilityResult = computeMatchedJobsEligibility(lead.id, {
    subscribed: limits.subscribed,
    lastMatchedJobsSentAt: lead.last_matched_jobs_sent_at,
    lastMatchedJobsWeekKey: lead.last_matched_jobs_week_key,
    subscriberFrequencyHours,
  });

  if (!eligibility.eligible) {
    return { status: 'skipped', reason: eligibility.reason };
  }

  const dispatch = await claimDispatch({
    leadId: lead.id,
    dispatchKey: eligibility.dispatchKey,
    periodKey: eligibility.weekKey,
    isSubscribed: limits.subscribed,
  });

  if (!dispatch) {
    return { status: 'duplicate', reason: 'dispatch_already_claimed' };
  }

  try {
    const { jobs } = await searchPublishedJobs({
      location: lead.last_search_location || '',
      roleKeywords: lead.last_search_role_keywords || '',
      timeFilter: lead.last_search_time_filter || '7d',
      offset: 0,
      limit: limits.subscribed ? 5 : 3,
    });

    if (jobs.length === 0) {
      await finalizeDispatch({
        dispatchId: dispatch.id,
        status: 'skipped',
        jobsPayload: [],
        error: 'no_jobs',
      });
      return { status: 'skipped', reason: 'no_jobs' };
    }

    const payload = jobs.map((job) => ({
      id: job.id,
      public_id: job.public_id,
      title: job.title,
      location: job.location,
      salary: job.salary,
    }));

    const message = buildMatchedMessage({
      location: lead.last_search_location || 'your location',
      roleKeywords: lead.last_search_role_keywords || 'your role',
      subscribed: limits.subscribed,
      jobs: payload,
    });

    await sendMatchedJobsDigestWhatsapp({
      to: lead.phone_e164,
      userId: lead.linked_user_id || null,
      subscribed: limits.subscribed,
      roleKeywords: lead.last_search_role_keywords || 'your role',
      location: lead.last_search_location || 'your location',
      jobsCount: payload.length,
      fallbackText: message,
    });

    await finalizeDispatch({
      dispatchId: dispatch.id,
      status: 'sent',
      jobsPayload: payload,
    });
    await touchWeeklyMatchMarker(lead.id);

    return { status: 'sent' };
  } catch (error) {
    await finalizeDispatch({
      dispatchId: dispatch.id,
      status: 'failed',
      error: sanitizeError(error),
    });
    return { status: 'failed', reason: sanitizeError(error) };
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const requestedLimit = Number(searchParams.get('limit') || 100);
  const leadLimit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(250, Math.floor(requestedLimit)))
    : 100;
  const subscriberFrequencyHours = Number(
    process.env.WA_MATCHED_SUBSCRIBER_FREQUENCY_HOURS || '24'
  );
  const frequencyHours = Number.isFinite(subscriberFrequencyHours)
    ? Math.max(1, Math.min(168, Math.floor(subscriberFrequencyHours)))
    : 24;

  const summary: DispatchSummary = {
    selected: 0,
    considered: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    duplicate: 0,
    details: [],
  };

  try {
    const leads = await fetchLeadCandidates(leadLimit);
    summary.selected = leads.length;

    for (const lead of leads) {
      summary.considered += 1;
      const outcome = await processLead(lead, frequencyHours);

      if (outcome.status === 'sent') summary.sent += 1;
      if (outcome.status === 'skipped') summary.skipped += 1;
      if (outcome.status === 'failed') summary.failed += 1;
      if (outcome.status === 'duplicate') summary.duplicate += 1;

      summary.details.push({
        leadId: lead.id,
        status: outcome.status,
        reason: outcome.reason,
      });
    }

    return NextResponse.json({
      ok: true,
      subscriberFrequencyHours: frequencyHours,
      ...summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: sanitizeError(error),
        ...summary,
      },
      { status: 500 }
    );
  }
}
