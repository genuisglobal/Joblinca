import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  type CandidateAtsSignals,
  defaultMinScoreForJob,
  normalizeJobType,
  scoreCandidateForJob,
  targetRolesForJob,
  type MatchableCandidate,
} from '@/lib/matching-agent/scoring';
import { sendMatchedJobAlertWhatsapp } from '@/lib/messaging/whatsapp';
import {
  isMatchingEmailConfigured,
  sendMatchedJobAlertEmail,
} from '@/lib/messaging/email';

const matchingDb = createServiceSupabaseClient();

type DispatchChannel = 'whatsapp' | 'email';

interface LiveJobRow {
  id: string;
  public_id: string | null;
  title: string | null;
  description: string | null;
  location: string | null;
  work_type: string | null;
  company_name: string | null;
  job_type: string | null;
  published: boolean;
  approval_status: string | null;
  closes_at: string | null;
}

interface SubscriptionRow {
  user_id: string;
  pricing_plans: { role: string } | { role: string }[] | null;
}

interface ProfileRow {
  id: string;
  role: 'job_seeker' | 'talent' | string;
  full_name: string | null;
  email: string | null;
}

interface JobSeekerProfileRow {
  user_id: string;
  headline: string | null;
  career_info: unknown;
  location: string | null;
  location_interests: unknown;
}

interface TalentProfileRow {
  user_id: string;
  skills: unknown;
  field_of_study: string | null;
  location_interests: unknown;
  internship_eligible: boolean | null;
}

interface WaConversationRow {
  user_id: string | null;
  wa_phone: string;
  opted_in: boolean;
}

interface CandidateOutcomeHistoryRow {
  applicant_id: string;
  decision_status: string | null;
  eligibility_status: string | null;
  overall_stage_score: number | null;
  recruiter_rating: number | null;
}

interface CandidateMatchContext {
  userId: string;
  role: 'job_seeker' | 'talent';
  fullName: string;
  email: string | null;
  whatsappPhone: string | null;
  candidate: MatchableCandidate;
  score: number;
  reasons: string[];
}

export interface JobMatchDispatchSummary {
  jobId: string;
  live: boolean;
  candidatesScored: number;
  matchedCandidates: number;
  selectedCandidates: number;
  notificationsSent: number;
  notificationsSkipped: number;
  notificationsFailed: number;
  notificationsDuplicate: number;
  skippedRateLimitDaily: number;
  skippedRateLimitWeekly: number;
}

function normalizeSingle<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function parseStringList(input: unknown): string[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (typeof item === 'string') return item.trim();
        if (item && typeof item === 'object' && 'name' in item) {
          const maybeName = (item as { name?: unknown }).name;
          if (typeof maybeName === 'string') return maybeName.trim();
        }
        return '';
      })
      .filter((value) => value.length > 0);
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    return trimmed ? [trimmed] : [];
  }

  return [];
}

function stringifyUnknown(input: unknown): string {
  if (input === null || input === undefined) return '';
  if (typeof input === 'string') return input;
  try {
    return JSON.stringify(input);
  } catch {
    return '';
  }
}

function normalizeE164(phone: string | null): string | null {
  if (!phone) return null;
  const compact = phone.replace(/\s+/g, '').trim();
  if (!compact) return null;

  if (compact.startsWith('+')) {
    const digits = compact.slice(1).replace(/\D/g, '');
    return digits.length >= 8 ? `+${digits}` : null;
  }

  const digitsOnly = compact.replace(/\D/g, '');
  return digitsOnly.length >= 8 ? `+${digitsOnly}` : null;
}

function getCandidateDisplayName(profile: ProfileRow): string {
  const trimmed = (profile.full_name || '').trim();
  return trimmed || 'there';
}

function normalizeEmail(email: string | null): string | null {
  if (!email) return null;
  const trimmed = email.trim();
  return trimmed || null;
}

function getConfiguredMaxRecipients(): number | null {
  const raw = (process.env.MATCHING_AGENT_MAX_RECIPIENTS || '').trim().toLowerCase();
  if (!raw || raw === 'all' || raw === '0' || raw === '-1') {
    return null;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  return Math.max(1, Math.min(1000, Math.floor(value)));
}

function getConfiguredMinScore(jobType: string | null): number {
  const value = Number(process.env.MATCHING_AGENT_MIN_SCORE || '');
  if (!Number.isFinite(value)) {
    return defaultMinScoreForJob(jobType);
  }
  return Math.max(0, Math.min(100, Math.floor(value)));
}

function getConfiguredDailyNotificationLimit(): number {
  const value = Number(process.env.MATCHING_AGENT_USER_DAILY_LIMIT || '5');
  if (!Number.isFinite(value)) return 5;
  return Math.max(1, Math.min(100, Math.floor(value)));
}

function getConfiguredWeeklyNotificationLimit(): number {
  const value = Number(process.env.MATCHING_AGENT_USER_WEEKLY_LIMIT || '30');
  if (!Number.isFinite(value)) return 30;
  return Math.max(1, Math.min(500, Math.floor(value)));
}

function getPlanRole(row: SubscriptionRow): string | null {
  const normalized = normalizeSingle(row.pricing_plans);
  return normalized?.role || null;
}

async function loadLiveJob(jobId: string): Promise<LiveJobRow | null> {
  const { data, error } = await matchingDb
    .from('jobs')
    .select(
      'id, public_id, title, description, location, work_type, company_name, job_type, published, approval_status, closes_at'
    )
    .eq('id', jobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const job = data as LiveJobRow;
  const notClosed = !job.closes_at || new Date(job.closes_at) > new Date();
  const isLive =
    job.published &&
    (job.approval_status === 'approved' || job.approval_status === null) &&
    notClosed;

  return isLive ? job : null;
}

async function loadSubscribedProfiles(
  allowedRoles: Array<'job_seeker' | 'talent'>
): Promise<ProfileRow[]> {
  const today = new Date().toISOString().split('T')[0];
  const { data: subscriptions, error: subscriptionsError } = await matchingDb
    .from('subscriptions')
    .select('user_id, pricing_plans:plan_id(role)')
    .eq('status', 'active')
    .or(`end_date.gte.${today},end_date.is.null`);

  if (subscriptionsError || !subscriptions) {
    throw new Error(
      `Failed to load subscriptions for matching: ${subscriptionsError?.message || 'unknown_error'}`
    );
  }

  const eligibleUserIds = new Set<string>();
  for (const row of subscriptions as SubscriptionRow[]) {
    const role = getPlanRole(row);
    if (!role) continue;
    if (!allowedRoles.includes(role as 'job_seeker' | 'talent')) continue;
    eligibleUserIds.add(row.user_id);
  }

  if (eligibleUserIds.size === 0) {
    return [];
  }

  const userIds = Array.from(eligibleUserIds);
  const { data: profiles, error: profilesError } = await matchingDb
    .from('profiles')
    .select('id, role, full_name, email')
    .in('id', userIds)
    .in('role', allowedRoles);

  if (profilesError || !profiles) {
    throw new Error(
      `Failed to load candidate profiles for matching: ${profilesError?.message || 'unknown_error'}`
    );
  }

  return profiles as ProfileRow[];
}

async function buildCandidateContexts(
  profiles: ProfileRow[]
): Promise<CandidateMatchContext[]> {
  if (profiles.length === 0) return [];

  const profileIds = profiles.map((profile) => profile.id);
  const jobSeekerIds = profiles
    .filter((profile) => profile.role === 'job_seeker')
    .map((profile) => profile.id);
  const talentIds = profiles
    .filter((profile) => profile.role === 'talent')
    .map((profile) => profile.id);

  const [
    { data: jobSeekers, error: jobSeekersError },
    { data: talents, error: talentsError },
    { data: waConversations, error: waConversationsError },
    { data: outcomeHistory, error: outcomeHistoryError },
  ] = await Promise.all([
    jobSeekerIds.length > 0
      ? matchingDb
          .from('job_seeker_profiles')
          .select('user_id, headline, career_info, location, location_interests')
          .in('user_id', jobSeekerIds)
      : Promise.resolve({ data: [], error: null } as any),
    talentIds.length > 0
      ? matchingDb
          .from('talent_profiles')
          .select('user_id, skills, field_of_study, location_interests, internship_eligible')
          .in('user_id', talentIds)
      : Promise.resolve({ data: [], error: null } as any),
    matchingDb
      .from('wa_conversations')
      .select('user_id, wa_phone, opted_in')
      .in('user_id', profileIds)
      .eq('opted_in', true),
    matchingDb
      .from('applications')
      .select(
        'applicant_id, decision_status, eligibility_status, overall_stage_score, recruiter_rating'
      )
      .in('applicant_id', profileIds)
      .eq('is_draft', false)
      .gte('created_at', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString()),
  ]);

  if (jobSeekersError) {
    throw new Error(`Failed to load job seeker profiles: ${jobSeekersError.message}`);
  }
  if (talentsError) {
    throw new Error(`Failed to load talent profiles: ${talentsError.message}`);
  }
  if (waConversationsError) {
    throw new Error(`Failed to load WhatsApp opt-ins: ${waConversationsError.message}`);
  }
  if (outcomeHistoryError) {
    throw new Error(`Failed to load ATS outcome history: ${outcomeHistoryError.message}`);
  }

  const jobSeekerByUser = new Map<string, JobSeekerProfileRow>();
  for (const row of (jobSeekers || []) as JobSeekerProfileRow[]) {
    jobSeekerByUser.set(row.user_id, row);
  }

  const talentByUser = new Map<string, TalentProfileRow>();
  for (const row of (talents || []) as TalentProfileRow[]) {
    talentByUser.set(row.user_id, row);
  }

  const waPhoneByUser = new Map<string, string>();
  for (const row of (waConversations || []) as WaConversationRow[]) {
    if (!row.user_id || !row.opted_in) continue;
    const normalized = normalizeE164(row.wa_phone);
    if (normalized) {
      waPhoneByUser.set(row.user_id, normalized);
    }
  }

  const atsSignalsByUser = buildCandidateOutcomeSignals(
    (outcomeHistory || []) as CandidateOutcomeHistoryRow[]
  );

  const contexts: CandidateMatchContext[] = [];
  for (const profile of profiles) {
    if (profile.role !== 'job_seeker' && profile.role !== 'talent') {
      continue;
    }

    if (profile.role === 'job_seeker') {
      const seeker = jobSeekerByUser.get(profile.id);
      const summary = [
        seeker?.headline || '',
        stringifyUnknown(seeker?.career_info),
      ]
        .filter(Boolean)
        .join(' ');
      const locationPreferences = [
        ...(seeker?.location ? [seeker.location] : []),
        ...parseStringList(seeker?.location_interests),
      ];
      contexts.push({
        userId: profile.id,
        role: 'job_seeker',
        fullName: getCandidateDisplayName(profile),
        email: normalizeEmail(profile.email),
        whatsappPhone: waPhoneByUser.get(profile.id) || null,
        candidate: {
          userId: profile.id,
          role: 'job_seeker',
          summary,
          skills: [],
          locationPreferences,
          internshipEligible: true,
          atsSignals: atsSignalsByUser.get(profile.id) || null,
        },
        score: 0,
        reasons: [],
      });
      continue;
    }

    const talent = talentByUser.get(profile.id);
    const skills = parseStringList(talent?.skills);
    const summary = [talent?.field_of_study || '', skills.join(' ')]
      .filter(Boolean)
      .join(' ');
    const locationPreferences = parseStringList(talent?.location_interests);
    contexts.push({
      userId: profile.id,
      role: 'talent',
      fullName: getCandidateDisplayName(profile),
      email: normalizeEmail(profile.email),
      whatsappPhone: waPhoneByUser.get(profile.id) || null,
        candidate: {
          userId: profile.id,
          role: 'talent',
          summary,
          skills,
          locationPreferences,
          internshipEligible: talent?.internship_eligible !== false,
          atsSignals: atsSignalsByUser.get(profile.id) || null,
        },
        score: 0,
        reasons: [],
    });
  }

  return contexts;
}

async function claimChannelDispatch(params: {
  jobId: string;
  userId: string;
  channel: DispatchChannel;
  score: number;
  reason: string;
  reasonSignals: string[];
  trigger: string;
}): Promise<{ id: string } | null> {
  const { data, error } = await matchingDb
    .from('job_match_notifications')
    .insert({
      job_id: params.jobId,
      user_id: params.userId,
      channel: params.channel,
      match_score: params.score,
      match_reason: params.reason,
      match_reason_signals: params.reasonSignals,
      trigger_source: params.trigger,
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

async function finalizeChannelDispatch(params: {
  dispatchId: string;
  status: 'sent' | 'failed' | 'skipped';
  error?: string | null;
}): Promise<void> {
  await matchingDb
    .from('job_match_notifications')
    .update({
      status: params.status,
      last_error: params.error || null,
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', params.dispatchId);
}

function sanitizeError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'unknown_error';
  return message.length <= 200 ? message : `${message.slice(0, 197)}...`;
}

async function getUserEmail(
  userId: string,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (cache.has(userId)) {
    return cache.get(userId) || null;
  }

  try {
    const { data, error } = await matchingDb.auth.admin.getUserById(userId);
    if (error || !data.user?.email) {
      cache.set(userId, null);
      return null;
    }
    const email = data.user.email.trim();
    cache.set(userId, email || null);
    return email || null;
  } catch {
    cache.set(userId, null);
    return null;
  }
}

interface UserFrequencyWindow {
  dailyJobs: Set<string>;
  weeklyJobs: Set<string>;
}

function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function buildCandidateOutcomeSignals(
  rows: CandidateOutcomeHistoryRow[]
): Map<string, CandidateAtsSignals> {
  const aggregates = new Map<
    string,
    CandidateAtsSignals & {
      stageScoreTotal: number;
      stageScoreSamples: number;
      recruiterRatingTotal: number;
      recruiterRatingSamples: number;
    }
  >();

  for (const row of rows) {
    const current =
      aggregates.get(row.applicant_id) || {
        totalApplications: 0,
        hiredCount: 0,
        rejectedCount: 0,
        eligibleCount: 0,
        needsReviewCount: 0,
        ineligibleCount: 0,
        averageStageScore: 0,
        averageRecruiterRating: 0,
        stageScoreTotal: 0,
        stageScoreSamples: 0,
        recruiterRatingTotal: 0,
        recruiterRatingSamples: 0,
      };

    current.totalApplications += 1;

    if (row.decision_status === 'hired') {
      current.hiredCount += 1;
    } else if (row.decision_status === 'rejected') {
      current.rejectedCount += 1;
    }

    if (row.eligibility_status === 'eligible') {
      current.eligibleCount += 1;
    } else if (row.eligibility_status === 'needs_review') {
      current.needsReviewCount += 1;
    } else if (row.eligibility_status === 'ineligible') {
      current.ineligibleCount += 1;
    }

    if (typeof row.overall_stage_score === 'number' && Number.isFinite(row.overall_stage_score)) {
      current.stageScoreTotal += row.overall_stage_score;
      current.stageScoreSamples += 1;
    }

    if (typeof row.recruiter_rating === 'number' && Number.isFinite(row.recruiter_rating)) {
      current.recruiterRatingTotal += row.recruiter_rating;
      current.recruiterRatingSamples += 1;
    }

    aggregates.set(row.applicant_id, current);
  }

  const signals = new Map<string, CandidateAtsSignals>();
  for (const [userId, value] of aggregates.entries()) {
    signals.set(userId, {
      totalApplications: value.totalApplications,
      hiredCount: value.hiredCount,
      rejectedCount: value.rejectedCount,
      eligibleCount: value.eligibleCount,
      needsReviewCount: value.needsReviewCount,
      ineligibleCount: value.ineligibleCount,
      averageStageScore:
        value.stageScoreSamples > 0 ? value.stageScoreTotal / value.stageScoreSamples : 0,
      averageRecruiterRating:
        value.recruiterRatingSamples > 0
          ? value.recruiterRatingTotal / value.recruiterRatingSamples
          : 0,
    });
  }

  return signals;
}

async function loadUserFrequencyWindows(params: {
  userIds: string[];
  dayStartIso: string;
  weekStartIso: string;
}): Promise<Map<string, UserFrequencyWindow>> {
  const windows = new Map<string, UserFrequencyWindow>();

  for (const userId of params.userIds) {
    windows.set(userId, {
      dailyJobs: new Set<string>(),
      weeklyJobs: new Set<string>(),
    });
  }

  const userIdChunks = chunkArray(params.userIds, 200);
  for (const userIdChunk of userIdChunks) {
    const { data, error } = await matchingDb
      .from('job_match_notifications')
      .select('user_id, job_id, created_at')
      .in('user_id', userIdChunk)
      .eq('status', 'sent')
      .gte('created_at', params.weekStartIso);

    if (error) {
      throw new Error(`Failed loading notification frequency windows: ${error.message}`);
    }

    for (const row of (data || []) as Array<{ user_id: string; job_id: string; created_at: string }>) {
      const window = windows.get(row.user_id);
      if (!window) continue;

      window.weeklyJobs.add(row.job_id);
      if (row.created_at >= params.dayStartIso) {
        window.dailyJobs.add(row.job_id);
      }
    }
  }

  return windows;
}

export async function dispatchJobMatchNotifications(params: {
  jobId: string;
  trigger?: string;
  maxRecipients?: number | null;
  minScore?: number;
  userDailyLimit?: number;
  userWeeklyLimit?: number;
}): Promise<JobMatchDispatchSummary> {
  const job = await loadLiveJob(params.jobId);
  if (!job) {
    return {
      jobId: params.jobId,
      live: false,
      candidatesScored: 0,
      matchedCandidates: 0,
      selectedCandidates: 0,
      notificationsSent: 0,
      notificationsSkipped: 0,
      notificationsFailed: 0,
      notificationsDuplicate: 0,
      skippedRateLimitDaily: 0,
      skippedRateLimitWeekly: 0,
    };
  }

  const allowedRoles = targetRolesForJob(job.job_type);
  const profiles = await loadSubscribedProfiles(allowedRoles);
  const contexts = await buildCandidateContexts(profiles);

  const minScore =
    params.minScore !== undefined
      ? Math.max(0, Math.min(100, Math.floor(params.minScore)))
      : getConfiguredMinScore(job.job_type);
  const maxRecipients =
    params.maxRecipients !== undefined
      ? params.maxRecipients === null
        ? null
        : Math.max(1, Math.min(1000, Math.floor(params.maxRecipients)))
      : getConfiguredMaxRecipients();

  const scored = contexts
    .map((context) => {
      const result = scoreCandidateForJob(
        {
          title: job.title,
          description: job.description,
          location: job.location,
          workType: job.work_type,
          companyName: job.company_name,
          jobType: job.job_type,
        },
        context.candidate
      );
      return {
        ...context,
        score: result.score,
        reasons: result.reasons,
      };
    })
    .filter((context) => context.score >= minScore)
    .sort((a, b) => b.score - a.score);

  const selected = maxRecipients === null ? scored : scored.slice(0, maxRecipients);
  const summary: JobMatchDispatchSummary = {
    jobId: job.id,
    live: true,
    candidatesScored: contexts.length,
    matchedCandidates: scored.length,
    selectedCandidates: selected.length,
    notificationsSent: 0,
    notificationsSkipped: 0,
    notificationsFailed: 0,
    notificationsDuplicate: 0,
    skippedRateLimitDaily: 0,
    skippedRateLimitWeekly: 0,
  };

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  const jobUrl = `${appUrl}/jobs/${job.id}`;
  const emailCache = new Map<string, string | null>();
  const emailConfigured = isMatchingEmailConfigured();
  const jobType = normalizeJobType(job.job_type);
  const trigger = params.trigger || 'manual';
  const userDailyLimit =
    params.userDailyLimit !== undefined
      ? Math.max(1, Math.min(100, Math.floor(params.userDailyLimit)))
      : getConfiguredDailyNotificationLimit();
  const userWeeklyLimit =
    params.userWeeklyLimit !== undefined
      ? Math.max(1, Math.min(500, Math.floor(params.userWeeklyLimit)))
      : getConfiguredWeeklyNotificationLimit();
  const now = Date.now();
  const dayStartIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();
  const weekStartIso = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
  const userFrequencyWindows = await loadUserFrequencyWindows({
    userIds: selected.map((match) => match.userId),
    dayStartIso,
    weekStartIso,
  });

  for (const match of selected) {
    const frequency = userFrequencyWindows.get(match.userId) || {
      dailyJobs: new Set<string>(),
      weeklyJobs: new Set<string>(),
    };

    if (frequency.dailyJobs.size >= userDailyLimit) {
      summary.notificationsSkipped += 1;
      summary.skippedRateLimitDaily += 1;
      continue;
    }

    if (frequency.weeklyJobs.size >= userWeeklyLimit) {
      summary.notificationsSkipped += 1;
      summary.skippedRateLimitWeekly += 1;
      continue;
    }

    const reasonText = (match.reasons || []).join('; ').slice(0, 300) || 'matched profile';
    const reasonSignals = (match.reasons || []).slice(0, 8);
    let sentAtLeastOneChannel = false;

    const waDispatch = await claimChannelDispatch({
      jobId: job.id,
      userId: match.userId,
      channel: 'whatsapp',
      score: match.score,
      reason: reasonText,
      reasonSignals,
      trigger,
    });

    if (!waDispatch) {
      summary.notificationsDuplicate += 1;
    } else if (!match.whatsappPhone) {
      await finalizeChannelDispatch({
        dispatchId: waDispatch.id,
        status: 'skipped',
        error: 'no_whatsapp_opt_in',
      });
      summary.notificationsSkipped += 1;
    } else {
      try {
        await sendMatchedJobAlertWhatsapp({
          to: match.whatsappPhone,
          userName: match.fullName,
          jobTitle: job.title || 'New opportunity',
          company: job.company_name || 'Joblinca',
          location: job.location || 'N/A',
          jobPublicId: job.public_id,
          jobUrl,
          userId: match.userId,
        });
        await finalizeChannelDispatch({
          dispatchId: waDispatch.id,
          status: 'sent',
        });
        summary.notificationsSent += 1;
        sentAtLeastOneChannel = true;
      } catch (error) {
        await finalizeChannelDispatch({
          dispatchId: waDispatch.id,
          status: 'failed',
          error: sanitizeError(error),
        });
        summary.notificationsFailed += 1;
      }
    }

    const emailDispatch = await claimChannelDispatch({
      jobId: job.id,
      userId: match.userId,
      channel: 'email',
      score: match.score,
      reason: reasonText,
      reasonSignals,
      trigger,
    });

    if (!emailDispatch) {
      summary.notificationsDuplicate += 1;
      continue;
    }

    if (!emailConfigured) {
      await finalizeChannelDispatch({
        dispatchId: emailDispatch.id,
        status: 'skipped',
        error: 'email_not_configured',
      });
      summary.notificationsSkipped += 1;
      continue;
    }

    const email = match.email || (await getUserEmail(match.userId, emailCache));
    if (!email) {
      await finalizeChannelDispatch({
        dispatchId: emailDispatch.id,
        status: 'skipped',
        error: 'no_email',
      });
      summary.notificationsSkipped += 1;
      continue;
    }

    try {
      await sendMatchedJobAlertEmail({
        to: email,
        userName: match.fullName,
        jobTitle: job.title || 'New opportunity',
        companyName: job.company_name || 'Joblinca',
        location: job.location || 'N/A',
        jobType,
        jobPublicId: job.public_id,
        jobUrl,
        score: match.score,
      });
      await finalizeChannelDispatch({
        dispatchId: emailDispatch.id,
        status: 'sent',
      });
      summary.notificationsSent += 1;
      sentAtLeastOneChannel = true;
    } catch (error) {
      await finalizeChannelDispatch({
        dispatchId: emailDispatch.id,
        status: 'failed',
        error: sanitizeError(error),
      });
      summary.notificationsFailed += 1;
    }

    if (sentAtLeastOneChannel) {
      frequency.dailyJobs.add(job.id);
      frequency.weeklyJobs.add(job.id);
      userFrequencyWindows.set(match.userId, frequency);
    }
  }

  return summary;
}
