/**
 * Glue between the WhatsApp router and the conversational agent: decides
 * whether a message is the agent's to answer, wires the real dependencies
 * into the tools, runs the turn, persists memory, and logs every turn.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { isAiConfigured } from '@/lib/ai/client';
import { createWhatsappSelfSignupInvite } from '@/lib/field-registration/service';
import {
  getJobByPublicId,
  type SearchJobRow,
} from '@/lib/whatsapp-agent/job-search';
import {
  incrementViewCounter,
  saveLastSearch,
  setLastSearchOffset,
  setLeadLanguage,
  setLeadPause,
  storePendingApply,
  updateLeadState,
  type WaLeadRow,
} from '@/lib/whatsapp-agent/leads';
import { submitJobReportAsService } from '@/lib/jobs/report-job';
import { downloadWhatsappMedia } from '@/lib/whatsapp-media';
import { transcribeAudio } from '@/lib/ai/transcribe';
import { storeResumeForUser } from '@/lib/profile/store-resume';
import { updateInboundMessageText } from '@/lib/whatsapp-db';
import type { MediaDeps } from './media';
import {
  checkRecruiterPostingAccess,
  createJobFromWhatsappDraft,
} from '@/lib/whatsapp-agent/recruiter-posting';
import { sendAdminWhatsAppAlert } from '@/lib/admin-alerts';
import { getWaLimitContext } from '@/lib/whatsapp-agent/limits';
import { detectLanguage } from '@/lib/whatsapp-agent/language';
import {
  isOptOutCommand,
  isNextCommand,
  parseApplyCommand,
  parseDetailsCommand,
  parseMenuChoice,
} from '@/lib/whatsapp-agent/parser';
import { looksLikeForwardedJobPosting } from '@/lib/whatsapp-agent/job-forward';
import {
  isRecruiterState,
  menuMessage,
  mergePayload,
  type AgentStatePayload,
} from '@/lib/whatsapp-agent/state-machine';
import { logAgentTurn } from '@/lib/whatsapp-agent/agent-log';
import { rankedSearch, searchWithWidening } from './search';
import { loadConversationHistory } from './history';
import { runAgentTurn, type AgentTurnOutcome } from './run-turn';
import type { AgentLanguage, AgentToolDeps } from './tools';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';

/** Agent turns per lead per rolling 24h; past this the menu flow answers. */
export const DAILY_AGENT_TURN_CAP = 40;

const JOB_COLUMNS =
  'id, public_id, title, location, salary, company_name, description, apply_method, external_apply_url, apply_email, apply_phone, apply_whatsapp, created_at, closes_at, recruiter_id, job_type, hiring_tier, wa_ai_screening_enabled';

/**
 * Whether this message belongs to the agent at all. Exact commands keep their
 * deterministic handlers, recruiter posting stays on its form (phase 3), and
 * a digit typed at the numbered menu is a menu choice.
 */
export function isAgentEligible(
  lead: Pick<WaLeadRow, 'conversation_state'>,
  text: string,
  role: string | null = null
): boolean {
  if (isOptOutCommand(text)) return false;
  // Only commands that name a job ID are deterministic. "apply to the 2nd
  // one" / "info on the cashier job" parse as commands without an ID, which
  // the menu flow can only answer with "Use APPLY <JobID>".
  if (parseDetailsCommand(text).publicId) return false;
  if (parseApplyCommand(text).publicId) return false;
  if (isNextCommand(text)) return false;
  if (isRecruiterState(lead.conversation_state)) return false;
  if (lead.conversation_state === 'menu' && parseMenuChoice(text)) return false;
  // A job ad from a recruiter is probably theirs to post; from anyone else
  // it is a forward for the discovery pipeline, which the menu flow handles.
  if (looksLikeForwardedJobPosting(text)) return isPostingRole(role);
  return true;
}

export function isPostingRole(role: string | null): boolean {
  return role === 'recruiter' || role === 'admin' || role === 'staff';
}

export async function countRecentAgentTurns(leadId: string): Promise<number> {
  const { count, error } = await createServiceSupabaseClient()
    .from('wa_agent_turns')
    .select('id', { count: 'exact', head: true })
    .eq('lead_id', leadId)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
  // Can't count (e.g. table missing) -> don't cap; logging will be failing too.
  return error ? 0 : count ?? 0;
}

async function getJobById(id: string): Promise<SearchJobRow | null> {
  const { data } = await createServiceSupabaseClient()
    .from('jobs')
    .select(JOB_COLUMNS)
    .eq('id', id)
    .eq('published', true)
    .maybeSingle();
  const job = (data as SearchJobRow | null) ?? null;
  if (!job) return null;
  return !job.closes_at || new Date(job.closes_at) > new Date() ? job : null;
}

function buildRegisterUrl(phone: string, role: 'job_seeker' | 'recruiter'): string {
  const params = new URLSearchParams({ role, source: 'whatsapp', phone });
  return `${APP_URL}/auth/register?${params.toString()}`;
}

export const defaultAgentDeps: AgentToolDeps = {
  searchWithWidening: (query, limit) => searchWithWidening(query, limit),
  rankedSearch,
  getJobByPublicId,
  getJobById,
  saveLastSearch,
  setLastSearchOffset,
  incrementViewCounter,
  createSignupInvite: (input) =>
    createWhatsappSelfSignupInvite(createServiceSupabaseClient(), { ...input, baseUrl: APP_URL }),
  buildRegisterUrl,
  menuMessage: (language) => menuMessage(language),
  storePendingApply,
  submitReport: (params) => submitJobReportAsService(createServiceSupabaseClient(), params),
  listSeekerPlans,
  pauseLead: (leadId, untilIso, reason) => setLeadPause(leadId, untilIso, reason),
  alertAdmins: (message) => sendAdminWhatsAppAlert(message),
  checkPostingAccess: checkRecruiterPostingAccess,
  createJob: createJobFromWhatsappDraft,
  links: {
    subscribe: `${APP_URL}/pricing?role=job_seeker`,
    recruiterSubscribe: `${APP_URL}/pricing?role=recruiter`,
    recruiterProfile: `${APP_URL}/dashboard/recruiter/profile`,
    recruiterJobs: `${APP_URL}/dashboard/recruiter/jobs`,
    profile: `${APP_URL}/dashboard/job-seeker/profile`,
    cvBuilder: `${APP_URL}/resume`,
    login: `${APP_URL}/auth/login`,
    forgotPassword: `${APP_URL}/auth/forgot-password`,
  },
};

async function listSeekerPlans() {
  const { data } = await createServiceSupabaseClient()
    .from('pricing_plans')
    .select('name, amount_xaf, duration_days, plan_type')
    .eq('is_active', true)
    .eq('role', 'job_seeker')
    .eq('plan_type', 'subscription')
    .order('sort_order', { ascending: true });
  return ((data || []) as Array<{ name: string; amount_xaf: number; duration_days: number | null }>).map((p) => ({
    name: p.name,
    amountXaf: p.amount_xaf,
    durationDays: p.duration_days,
  }));
}

export const defaultMediaDeps: MediaDeps = {
  download: (mediaId, maxBytes) => downloadWhatsappMedia(mediaId, { maxBytes }),
  transcribe: (audio, mimeType) => transcribeAudio(audio, mimeType),
  storeResume: (params) => storeResumeForUser(createServiceSupabaseClient(), params),
  recordTranscript: updateInboundMessageText,
  registerUrl: (phone) => buildRegisterUrl(phone, 'job_seeker'),
  profileUrl: `${APP_URL}/dashboard/job-seeker/profile`,
};

function readMemory(lead: WaLeadRow): AgentStatePayload {
  return mergePayload(lead.state_payload, {}).agent || {};
}

/**
 * Run one agent turn for this lead and record it.
 *
 * live:   on success, saves the new conversation state + memory and returns
 *         the reply for the caller to send. On failure the caller falls back.
 * shadow: read-only tools, nothing persisted, nothing sent -- only logged.
 */
export async function runAgentForLead(params: {
  lead: WaLeadRow;
  inboundText: string;
  waMessageId: string | null;
  inboundAtIso: string;
  route: 'live' | 'shadow';
  /** Profile full name, when they have an account. */
  displayName: string | null;
  /** profiles.role when they have an account (recruiter, job_seeker, admin...). */
  role: string | null;
  deps?: AgentToolDeps;
}): Promise<AgentTurnOutcome> {
  const { lead, route } = params;
  const startedAt = Date.now();
  const dryRun = route === 'shadow';

  const detected = detectLanguage(params.inboundText).language;
  const language: AgentLanguage = detected ?? (lead.language === 'fr' ? 'fr' : 'en');

  let outcome: AgentTurnOutcome;
  if (!isAiConfigured()) {
    outcome = { ok: false, reason: 'ai_not_configured', toolCalls: [], model: null, promptTokens: 0, completionTokens: 0 };
  } else {
    try {
      const [history, limits] = await Promise.all([
        loadConversationHistory({
          phone: lead.phone_e164,
          beforeIso: params.inboundAtIso,
          excludeWaMessageId: params.waMessageId,
        }),
        getWaLimitContext(lead.linked_user_id),
      ]);

      outcome = await runAgentTurn({
        lead,
        role: params.role,
        inboundText: params.inboundText,
        history,
        memory: readMemory(lead),
        language,
        subscribed: limits.subscribed,
        firstName: params.displayName ? params.displayName.split(/\s+/)[0] || null : null,
        displayName: params.displayName ?? lead.display_name ?? null,
        dryRun,
        deps: params.deps ?? defaultAgentDeps,
        allowedLinkOrigins: [APP_URL, 'https://joblinca.com', 'https://www.joblinca.com'],
      });
    } catch (error) {
      outcome = {
        ok: false,
        reason: `setup_error: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`,
        toolCalls: [],
        model: null,
        promptTokens: 0,
        completionTokens: 0,
      };
    }
  }

  if (outcome.ok && !dryRun) {
    await updateLeadState(
      lead.id,
      outcome.nextState,
      lead.role_selected ?? 'jobseeker',
      mergePayload(lead.state_payload, { agent: outcome.memory })
    );
    if (detected && detected !== lead.language) {
      await setLeadLanguage(lead, detected);
    }
  }

  await logAgentTurn({
    leadId: lead.id,
    waMessageId: params.waMessageId,
    route,
    outcome: outcome.ok ? 'agent' : 'fallback',
    fallbackReason: outcome.ok ? null : outcome.reason,
    inboundText: params.inboundText,
    replyText: outcome.ok ? outcome.reply : null,
    toolCalls: outcome.toolCalls,
    model: outcome.model,
    promptTokens: outcome.promptTokens,
    completionTokens: outcome.completionTokens,
    latencyMs: Date.now() - startedAt,
  });

  return outcome;
}
