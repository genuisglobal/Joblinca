import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { WAInboundMessage } from '@/lib/whatsapp';
import { toE164 } from '@/lib/whatsapp';
import {
  sendWhatsappMessage,
  sendWhatsappQuickReplies,
} from '@/lib/messaging/whatsapp';
import { handleWhatsAppScreeningInbound } from '@/lib/whatsapp-screening/service';
import {
  getOrCreateWaLead,
  syncLeadUserLink,
  resolveWebsiteUserByPhone,
  updateLeadState,
  saveLastSearch,
  setLastSearchOffset,
  incrementViewCounter,
  incrementApplyCounter,
  storePendingApply,
  clearPendingApply,
  getProfileRole,
  setLeadLanguage,
  setLeadPause,
  isLeadPaused,
  findWaLeadByPhone,
  type WaLeadRow,
} from '@/lib/whatsapp-agent/leads';
import {
  parseApplyCommand,
  parseDetailsCommand,
  parseLocationScope,
  parseMenuChoice,
  parseRoleMode,
  parseTimeFilter,
  isCreateAccountIntent,
  isGreeting,
  isHelpMenu,
  isNextCommand,
  isOptOutCommand,
  parseAdminCommand,
  type AdminCommand,
  looksLikeInternshipIntent,
  looksLikeJobIntent,
  extractLocationHint,
  extractRoleKeywordsHint,
} from '@/lib/whatsapp-agent/parser';
import { resolveInboundIntent } from '@/lib/whatsapp-agent/ai-intent';
import { getServerT } from '@/lib/i18n/server-t';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/locale';
import {
  looksLikeForwardedJobPosting,
  storeForwardedJobPosting,
} from '@/lib/whatsapp-agent/job-forward';
import {
  mergePayload,
  menuMessage,
  timeFilterPrompt,
  isMenuRootState,
  isJobseekerState,
  isRecruiterState,
  type WaStatePayload,
} from '@/lib/whatsapp-agent/state-machine';
import {
  searchPublishedJobs,
  getJobByPublicId,
  formatJobBatchMessage,
  formatJobDetailsMessage,
  type TimeFilter,
} from '@/lib/whatsapp-agent/job-search';
import { resolveAiScreeningDecisionForJob } from '@/lib/whatsapp-agent/ai-screening-policy';
import {
  canApplyNow,
  evaluateViewBatch,
  FREE_MONTHLY_APPLY_LIMIT,
  FREE_MONTHLY_VIEW_LIMIT,
  getWaLimitContext,
} from '@/lib/whatsapp-agent/limits';
import { decideAgentRoute } from '@/lib/whatsapp-agent/agent-config';
import {
  checkRecruiterPostingAccess,
  createJobFromWhatsappDraft,
  type WhatsappJobDraft,
} from '@/lib/whatsapp-agent/recruiter-posting';
import { isAdminAlertRecipient, sendAdminWhatsAppAlert } from '@/lib/admin-alerts';
import { acquireLeadLock } from '@/lib/whatsapp-agent/agent/lock';
import {
  DAILY_AGENT_TURN_CAP,
  countRecentAgentTurns,
  isAgentEligible,
  runAgentForLead,
} from '@/lib/whatsapp-agent/agent/orchestrator';

const agentDb = createServiceSupabaseClient();
const SEARCH_PAGE_SIZE = 10;
const NO_ACCOUNT_PREVIEW_LIMIT = 3;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
const ACCOUNT_URL = `${APP_URL}/auth/login`;
const REGISTER_URL = `${APP_URL}/auth/register`;
const SUBSCRIBE_URL = `${APP_URL}/pricing`;
const JOBS_URL = `${APP_URL}/jobs`;
interface InboundAgentInput {
  message: WAInboundMessage;
  textBody: string | null;
  conversationId: string;
  conversationUserId: string | null;
  waPhone: string;
}

export interface InboundAgentResult {
  handled: boolean;
  reason:
    | 'not_text'
    | 'handled'
    | 'delegated'
    | 'error';
}

function logEvent(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>): void {
  const payload = {
    scope: 'wa-job-agent',
    event,
    timestamp: new Date().toISOString(),
    ...data,
  };
  const serialized = JSON.stringify(payload);

  if (level === 'error') {
    console.error(serialized);
    return;
  }
  if (level === 'warn') {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

function getInboundText(message: WAInboundMessage, textBody: string | null): string | null {
  if (textBody && textBody.trim()) return textBody.trim();
  if (message.button?.text) return message.button.text.trim();
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title.trim();
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title.trim();
  return null;
}

function sanitizeFreeText(input: string, max = 500): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) return compact;
  return compact.slice(0, max);
}

function buildRegisterUrl(phone: string, role: 'job_seeker' | 'recruiter' = 'job_seeker'): string {
  const params = new URLSearchParams({
    role,
    source: 'whatsapp',
    phone,
  });
  return `${REGISTER_URL}?${params.toString()}`;
}

/**
 * The language to answer this lead in. Set from the current message when it
 * read as one language or the other, otherwise whatever we last stored for
 * them, otherwise English.
 */
function leadLocale(lead: Pick<WaLeadRow, 'language'>): Locale {
  return lead.language === 'fr' ? 'fr' : 'en';
}

function locationScopePrompt(
  searchType: 'job' | 'internship',
  locale: Locale = DEFAULT_LOCALE
): string {
  const t = getServerT(locale);
  const label = t(searchType === 'internship' ? 'wa.label.internships' : 'wa.label.jobs');
  return [
    t('wa.locationScope.intro', { label }),
    t('wa.locationScope.choose'),
    t('wa.locationScope.nationwide'),
    t('wa.locationScope.town'),
  ].join('\n');
}

function roleModePrompt(
  searchType: 'job' | 'internship',
  locale: Locale = DEFAULT_LOCALE
): string {
  const t = getServerT(locale);
  const label = t(searchType === 'internship' ? 'wa.label.internships' : 'wa.label.jobs');
  return [
    t('wa.roleMode.question'),
    t('wa.roleMode.all', { label }),
    t('wa.roleMode.specific'),
  ].join('\n');
}

function parseAccountChoice(input: string): 'create' | 'continue' | null {
  const value = input.trim().toLowerCase();
  if (['1', 'create', 'create account', 'register', 'signup', 'sign up'].includes(value)) {
    return 'create';
  }
  if (['2', 'continue', 'continue search', 'search'].includes(value)) {
    return 'continue';
  }
  return null;
}

function getSearchTypeFromLead(lead: WaLeadRow): 'job' | 'internship' {
  const payload = mergePayload(lead.state_payload, {});
  return payload.jobSearch?.searchType === 'internship' ? 'internship' : 'job';
}

async function sendMessage(phone: string, message: string, userId?: string | null): Promise<void> {
  await sendWhatsappMessage(phone, message, userId || null).catch((error) => {
    logEvent('warn', 'send_message_failed', {
      phone: phone.slice(-4),
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  });
}

async function sendQuickActions(phone: string, userId?: string | null): Promise<void> {
  await sendWhatsappQuickReplies({
    to: phone,
    body: 'Quick actions',
    footer: 'JobLinca WhatsApp Agent',
    buttons: [
      { id: 'NEXT', title: 'NEXT' },
      { id: 'MENU', title: 'MENU' },
      { id: 'HELP', title: 'HELP' },
    ],
    userId: userId || null,
  }).catch((error) => {
    logEvent('warn', 'send_quick_actions_failed', {
      phone: phone.slice(-4),
      error: error instanceof Error ? error.message : 'unknown_error',
    });
  });
}

async function sendMenuAndSetState(lead: WaLeadRow): Promise<void> {
  await updateLeadState(lead.id, 'menu', lead.role_selected, lead.state_payload || {});
  await sendMessage(lead.phone_e164, menuMessage(leadLocale(lead)), lead.linked_user_id);
}

async function getProfileDisplayName(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await agentDb
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .maybeSingle();
  const raw = (data?.full_name as string | undefined) || '';
  const compact = raw.trim();
  return compact || null;
}

async function sendAccountStatusOrRegistration(
  lead: WaLeadRow,
  role: string | null
): Promise<void> {
  if (!lead.linked_user_id) {
    await sendMessage(
      lead.phone_e164,
      `Create your account using this WhatsApp number: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
      lead.linked_user_id
    );
    return;
  }

  const name = await getProfileDisplayName(lead.linked_user_id);
  await sendMessage(
    lead.phone_e164,
    [
      `This WhatsApp number is already linked to ${name || 'your account'}.`,
      `Role: ${role || 'job_seeker'}`,
      `Login here: ${ACCOUNT_URL}`,
    ].join('\n'),
    lead.linked_user_id
  );
}

async function enforceRecruiterPostingAccess(
  lead: WaLeadRow,
  role: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  const access = await checkRecruiterPostingAccess(lead.linked_user_id, role);
  if (!access.allowed) {
    const message =
      access.reason === 'missing_account'
        ? `Recruiter posting requires a website account. Create account: ${buildRegisterUrl(lead.phone_e164, 'recruiter')}`
        : access.reason === 'not_recruiter'
          ? `This number is not linked to a recruiter account. Login/create recruiter profile: ${buildRegisterUrl(lead.phone_e164, 'recruiter')}`
          : `Active recruiter subscription required before posting jobs. Subscribe here: ${SUBSCRIBE_URL}`;
    await sendMessage(lead.phone_e164, message, lead.linked_user_id);
    return { allowed: false, reason: access.reason };
  }

  if (access.feeXaf > 0) {
    await sendMessage(
      lead.phone_e164,
      `Posting fee: ${access.feeXaf.toLocaleString('en-US')} XAF (charged on website).`,
      lead.linked_user_id
    );
  }

  return { allowed: true };
}

async function loadLead(input: InboundAgentInput): Promise<WaLeadRow> {
  const phone = toE164(input.waPhone || input.message.from);
  let lead = await getOrCreateWaLead({
    conversationId: input.conversationId,
    waId: input.message.from,
    phone,
    displayName: null,
  });

  const resolvedByPhone = await resolveWebsiteUserByPhone(phone);
  if (resolvedByPhone && input.conversationUserId && resolvedByPhone !== input.conversationUserId) {
    logEvent('warn', 'conversation_user_mismatch_phone_resolution', {
      leadId: lead.id,
      waConversationId: input.conversationId,
      conversationUserId: input.conversationUserId,
      resolvedByPhone,
    });
  }

  if (!resolvedByPhone && (input.conversationUserId || lead.linked_user_id)) {
    logEvent('info', 'clearing_non_phone_verified_link', {
      leadId: lead.id,
      waConversationId: input.conversationId,
      previousConversationUserId: input.conversationUserId,
      previousLeadLinkedUserId: lead.linked_user_id,
    });
  }

  // Force linkage to be strictly phone-verified for WhatsApp automation.
  const linkedUserId = resolvedByPhone || null;

  lead = await syncLeadUserLink(lead, linkedUserId);
  return lead;
}

async function runJobSearchAndRespond(lead: WaLeadRow, offset: number): Promise<void> {
  const location = (lead.last_search_location || '').trim();
  const roleKeywords = (lead.last_search_role_keywords || '').trim();
  const timeFilter = lead.last_search_time_filter;
  const searchType = getSearchTypeFromLead(lead);

  if (!timeFilter) {
    await sendMessage(
      lead.phone_e164,
      'No active search found. Reply 1 for jobs or 3 for internships.',
      lead.linked_user_id
    );
    return;
  }

  const limitCtx = await getWaLimitContext(lead.linked_user_id);
  const { jobs } = await searchPublishedJobs({
    location,
    roleKeywords,
    jobType: searchType,
    timeFilter: timeFilter as TimeFilter,
    offset,
    limit: SEARCH_PAGE_SIZE,
  });

  if (jobs.length === 0) {
    await sendMessage(
      lead.phone_e164,
      searchType === 'internship'
        ? 'No more internships for this search. Reply MENU to start a new search.'
        : 'No more jobs for this search. Reply MENU to start a new search.',
      lead.linked_user_id
    );
    return;
  }

  const decision = evaluateViewBatch({
    subscribed: limitCtx.subscribed,
    currentViews: lead.views_month_count || 0,
    batchSize: jobs.length,
  });
  const previewRemaining = Math.max(
    0,
    NO_ACCOUNT_PREVIEW_LIMIT - (lead.views_month_count || 0)
  );
  const noAccountVisibleCap = lead.linked_user_id
    ? decision.visibleCount
    : Math.min(decision.visibleCount, previewRemaining);
  const visibleCount = noAccountVisibleCap;
  const lockedCount = Math.max(0, jobs.length - visibleCount);

  if (!lead.linked_user_id && visibleCount <= 0) {
    await sendMessage(
      lead.phone_e164,
      `You reached your WhatsApp preview limit (${NO_ACCOUNT_PREVIEW_LIMIT} jobs). Create account to continue: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
      lead.linked_user_id
    );
    return;
  }

  await sendMessage(
    lead.phone_e164,
    formatJobBatchMessage({
      jobs,
      visibleCount,
      lockedCount,
      hasMore: jobs.length === SEARCH_PAGE_SIZE,
      subscribed: limitCtx.subscribed,
      headingLabel: searchType === 'internship' ? 'Internships' : 'Jobs',
    }),
    lead.linked_user_id
  );
  await sendQuickActions(lead.phone_e164, lead.linked_user_id);

  await setLastSearchOffset(lead.id, offset + jobs.length);
  await incrementViewCounter(lead, visibleCount);

  if (!lead.linked_user_id && lockedCount > 0) {
    await sendMessage(
      lead.phone_e164,
      `Create account to unlock all results and apply instantly: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
      lead.linked_user_id
    );
  }
}

async function handleApplyCommand(lead: WaLeadRow, inbound: InboundAgentInput, publicId: string): Promise<void> {
  const job = await getJobByPublicId(publicId);
  if (!job) {
    await sendMessage(lead.phone_e164, 'Job not found. Use a valid public ID like APPLY JL-1000.', lead.linked_user_id);
    return;
  }

  if (!lead.linked_user_id) {
    await storePendingApply(lead.id, job.id, job.public_id || publicId);
    await sendMessage(
      lead.phone_e164,
      `To apply, create your account first: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}\nWe saved your intent for ${job.public_id || publicId}.`,
      lead.linked_user_id
    );
    return;
  }

  const limits = await getWaLimitContext(lead.linked_user_id);
  if (!canApplyNow({ subscribed: limits.subscribed, currentApplies: lead.applies_month_count || 0 })) {
    await sendMessage(
      lead.phone_e164,
      `Free monthly apply limit reached (${FREE_MONTHLY_APPLY_LIMIT}). Subscribe here: ${SUBSCRIBE_URL}`,
      lead.linked_user_id
    );
    return;
  }

  const existing = await agentDb
    .from('applications')
    .select('id')
    .eq('job_id', job.id)
    .eq('applicant_id', lead.linked_user_id)
    .maybeSingle();

  if (existing.data?.id) {
    await sendMessage(lead.phone_e164, `You already applied to ${job.public_id || publicId}.`, lead.linked_user_id);
    return;
  }

  const role = await getProfileRole(lead.linked_user_id);
  if (role === 'recruiter' || role === 'admin' || role === 'staff') {
    await sendMessage(lead.phone_e164, 'Please use a job seeker account to apply for jobs.', lead.linked_user_id);
    return;
  }

  const aiDecision = await resolveAiScreeningDecisionForJob({
    recruiter_id: job.recruiter_id,
    hiring_tier: job.hiring_tier,
    wa_ai_screening_enabled: job.wa_ai_screening_enabled,
  });

  if (aiDecision.enabled) {
    const screeningResult = await handleWhatsAppScreeningInbound({
      message: {
        ...inbound.message,
        text: { body: `APPLY ${job.id}` },
        type: 'text',
      },
      textBody: `APPLY ${job.id}`,
      conversationId: inbound.conversationId,
      conversationUserId: lead.linked_user_id,
      waPhone: lead.phone_e164,
    });

    if (screeningResult.handled) {
      await incrementApplyCounter(lead, 1);
      await clearPendingApply(lead.id);
      logEvent('info', 'ai_screening_routed', {
        leadId: lead.id,
        jobId: job.id,
        decisionSource: aiDecision.source,
        planSlug: aiDecision.planSlug,
      });
      return;
    }
  }

  if (job.apply_method && !['joblinca', 'multiple'].includes(job.apply_method)) {
    const externalInstruction =
      job.apply_method === 'external_url' && job.external_apply_url
        ? `Apply on company website: ${job.external_apply_url}`
        : job.apply_method === 'email' && job.apply_email
          ? `Apply by email: ${job.apply_email}`
          : job.apply_method === 'phone' && job.apply_phone
            ? `Apply by phone: ${job.apply_phone}`
            : job.apply_method === 'whatsapp' && job.apply_whatsapp
              ? `Apply by WhatsApp: ${job.apply_whatsapp}`
              : `Apply on website: ${JOBS_URL}/${job.id}`;

    await sendMessage(
      lead.phone_e164,
      `This job uses external application method.\n${externalInstruction}`,
      lead.linked_user_id
    );
    return;
  }

  const profile = await agentDb
    .from('profiles')
    .select('full_name, phone, role')
    .eq('id', lead.linked_user_id)
    .maybeSingle();

  const insertResult = await agentDb
    .from('applications')
    .insert({
      job_id: job.id,
      applicant_id: lead.linked_user_id,
      status: 'submitted',
      application_source: 'joblinca',
      is_draft: false,
      applicant_role: profile.data?.role || 'job_seeker',
      contact_info: {
        full_name: profile.data?.full_name || null,
        phone: profile.data?.phone || lead.phone_e164,
        source: 'whatsapp',
      },
      answers: {
        source: 'whatsapp',
        trigger: `APPLY ${job.public_id || publicId}`,
      },
    })
    .select('id')
    .single();

  if (insertResult.error || !insertResult.data?.id) {
    await sendMessage(
      lead.phone_e164,
      `Could not submit application now. Apply on website: ${JOBS_URL}/${job.id}`,
      lead.linked_user_id
    );
    return;
  }

  await incrementApplyCounter(lead, 1);
  await clearPendingApply(lead.id);
  await sendMessage(
    lead.phone_e164,
    `Application submitted for ${job.public_id || publicId}. You can track it in your dashboard.`,
    lead.linked_user_id
  );
}

async function handleRecruiterFlow(
  lead: WaLeadRow,
  inboundText: string,
  role: string | null
): Promise<boolean> {
  const access = await enforceRecruiterPostingAccess(lead, role);
  if (!access.allowed) {
    await sendMenuAndSetState(lead);
    return true;
  }

  const payload = mergePayload(lead.state_payload, {});
  const text = sanitizeFreeText(inboundText, 700);

  if (lead.conversation_state === 'recruiter.awaiting_title') {
    const nextPayload = mergePayload(payload, {
      recruiterDraft: { jobTitle: text },
    });
    await updateLeadState(lead.id, 'recruiter.awaiting_location', 'recruiter', nextPayload);
    await sendMessage(lead.phone_e164, 'Job location?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'recruiter.awaiting_location') {
    const nextPayload = mergePayload(payload, {
      recruiterDraft: { location: text },
    });
    await updateLeadState(lead.id, 'recruiter.awaiting_salary', 'recruiter', nextPayload);
    await sendMessage(lead.phone_e164, 'Salary?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'recruiter.awaiting_salary') {
    const nextPayload = mergePayload(payload, {
      recruiterDraft: { salary: text },
    });
    await updateLeadState(lead.id, 'recruiter.awaiting_description', 'recruiter', nextPayload);
    await sendMessage(
      lead.phone_e164,
      'Send a short job brief (1-3 lines). AI will expand it into a full description.',
      lead.linked_user_id
    );
    return true;
  }

  if (lead.conversation_state === 'recruiter.awaiting_description') {
    const nextPayload = mergePayload(payload, {
      recruiterDraft: { description: text },
    });
    await updateLeadState(lead.id, 'recruiter.awaiting_application_method', 'recruiter', nextPayload);
    await sendMessage(lead.phone_e164, 'Application method (URL / email / phone / WhatsApp / JobLinca)?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'recruiter.awaiting_publish_confirmation') {
    const reply = text.trim().toLowerCase();
    const confirmedDraft = payload.recruiterDraft;

    if (['yes', 'oui', 'y', 'ok', 'confirm', 'confirmer'].includes(reply)) {
      if (
        !confirmedDraft?.jobTitle ||
        !confirmedDraft.location ||
        !confirmedDraft.salary ||
        !confirmedDraft.description ||
        !confirmedDraft.applicationMethod
      ) {
        await sendMessage(lead.phone_e164, 'The draft expired. Reply MENU to restart recruiter posting.', lead.linked_user_id);
        await sendMenuAndSetState(lead);
        return true;
      }
      return createRecruiterJobFromDraft(lead, confirmedDraft as ConfirmedRecruiterDraft);
    }

    if (['no', 'non', 'n', 'cancel', 'annuler', 'menu'].includes(reply)) {
      await updateLeadState(lead.id, 'menu', 'recruiter', mergePayload({}, {}));
      await sendMessage(
        lead.phone_e164,
        'Job posting cancelled — nothing was published. Reply MENU for options.',
        lead.linked_user_id
      );
      return true;
    }

    await sendMessage(
      lead.phone_e164,
      'Reply YES to submit this job for publication, or NO to cancel.',
      lead.linked_user_id
    );
    return true;
  }

  if (lead.conversation_state !== 'recruiter.awaiting_application_method') {
    return false;
  }

  const nextPayload = mergePayload(payload, {
    recruiterDraft: { applicationMethod: text },
  });

  const draft = nextPayload.recruiterDraft;
  if (
    !draft?.jobTitle ||
    !draft.location ||
    !draft.salary ||
    !draft.description ||
    !draft.applicationMethod
  ) {
    await sendMessage(lead.phone_e164, 'All 5 fields are required. Reply MENU to restart recruiter posting.', lead.linked_user_id);
    return true;
  }

  // Confirm before creating anything — recruiters used to publish blind
  // straight off their 5th answer with no chance to review
  const briefPreview =
    draft.description.length > 200 ? `${draft.description.slice(0, 200)}…` : draft.description;
  await updateLeadState(lead.id, 'recruiter.awaiting_publish_confirmation', 'recruiter', nextPayload);
  await sendMessage(
    lead.phone_e164,
    `Please confirm your job posting:\n\n` +
      `📌 ${draft.jobTitle}\n` +
      `📍 ${draft.location}\n` +
      `💰 ${draft.salary}\n` +
      `📮 Apply via: ${draft.applicationMethod}\n\n` +
      `📝 ${briefPreview}\n\n` +
      `AI will expand the brief into a full description before review.\n` +
      `Reply YES to submit, or NO to cancel.`,
    lead.linked_user_id
  );
  return true;
}

type ConfirmedRecruiterDraft = WhatsappJobDraft;

async function createRecruiterJobFromDraft(
  lead: WaLeadRow,
  draft: ConfirmedRecruiterDraft
): Promise<boolean> {
  const result = lead.linked_user_id
    ? await createJobFromWhatsappDraft(lead.linked_user_id, draft)
    : ({ status: 'no_recruiter_profile' } as const);

  if (result.status === 'no_recruiter_profile') {
    await sendMessage(
      lead.phone_e164,
      `Recruiter profile not complete. Please complete it on website: ${APP_URL}/dashboard/recruiter/profile`,
      lead.linked_user_id
    );
    await sendMenuAndSetState(lead);
    return true;
  }

  if (result.status === 'error') {
    logEvent('error', 'recruiter_job_create_failed', { leadId: lead.id, error: result.message });
    await sendMessage(
      lead.phone_e164,
      `Could not create job now. Please post on website: ${APP_URL}/dashboard/recruiter/jobs/new`,
      lead.linked_user_id
    );
    await sendMenuAndSetState(lead);
    return true;
  }

  await updateLeadState(lead.id, 'menu', 'recruiter', mergePayload({}, {}));
  await sendMessage(
    lead.phone_e164,
    `Job created (${result.publicId || result.jobId}) and sent for review. Reply MENU for more options.`,
    lead.linked_user_id
  );
  return true;
}

async function handleJobSeekerFlow(lead: WaLeadRow, inboundText: string): Promise<boolean> {
  const payload = mergePayload(lead.state_payload, {});
  const text = sanitizeFreeText(inboundText, 200);

  const completeJobSearch = async (nextPayload: WaStatePayload): Promise<void> => {
    const searchDraft = nextPayload.jobSearch;
    if (!searchDraft?.timeFilter) {
      await sendMessage(
        lead.phone_e164,
        'Missing search fields. Reply MENU and choose 1 again.',
        lead.linked_user_id
      );
      await sendMenuAndSetState(lead);
      return;
    }

    const normalizedLocation =
      searchDraft.locationScope === 'nationwide'
        ? ''
        : (searchDraft.location || '').trim();
    const normalizedRoleKeywords =
      searchDraft.roleMode === 'all'
        ? ''
        : (searchDraft.roleKeywords || '').trim();

    await updateLeadState(lead.id, 'jobseeker.ready_results', 'jobseeker', nextPayload);
    await saveLastSearch(lead.id, {
      location: normalizedLocation,
      roleKeywords: normalizedRoleKeywords,
      timeFilter: searchDraft.timeFilter,
      offset: 0,
    });

    await runJobSearchAndRespond(
      {
        ...lead,
        state_payload: nextPayload as Record<string, unknown>,
        last_search_location: normalizedLocation,
        last_search_role_keywords: normalizedRoleKeywords,
        last_search_time_filter: searchDraft.timeFilter,
        last_search_offset: 0,
      },
      0
    );
  };

  if (lead.conversation_state === 'jobseeker.awaiting_account_choice') {
    const accountChoice = parseAccountChoice(text);
    if (!accountChoice) {
      await sendMessage(
        lead.phone_e164,
        'Reply 1 to create account or 2 to continue search.',
        lead.linked_user_id
      );
      return true;
    }

    if (accountChoice === 'create') {
      await sendMessage(
        lead.phone_e164,
        `Create your account with this WhatsApp number: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
        lead.linked_user_id
      );
      await sendMenuAndSetState(lead);
      return true;
    }

    const nextPayload = mergePayload(payload, {});
    await updateLeadState(lead.id, 'jobseeker.awaiting_location_scope', 'jobseeker', nextPayload);
    await sendMessage(
      lead.phone_e164,
      locationScopePrompt(nextPayload.jobSearch?.searchType === 'internship' ? 'internship' : 'job', leadLocale(lead)),
      lead.linked_user_id
    );
    return true;
  }

  if (
    lead.conversation_state === 'jobseeker.awaiting_location_scope' ||
    lead.conversation_state === 'jobseeker.awaiting_location'
  ) {
    const locationScope = parseLocationScope(text);
    if (!locationScope) {
      await sendMessage(
        lead.phone_e164,
        'Reply 1 for Nationwide or 2 for Specific town.',
        lead.linked_user_id
      );
      return true;
    }

    const nextPayload = mergePayload(payload, {
      jobSearch: {
        locationScope,
        location: locationScope === 'nationwide' ? 'Nationwide' : null,
      },
    });

    if (locationScope === 'nationwide') {
      await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', nextPayload);
      await sendMessage(lead.phone_e164, timeFilterPrompt(leadLocale(lead)), lead.linked_user_id);
      return true;
    }

    await updateLeadState(lead.id, 'jobseeker.awaiting_location_town', 'jobseeker', nextPayload);
    await sendMessage(lead.phone_e164, 'Which town?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'jobseeker.awaiting_location_town') {
    const nextPayload = mergePayload(payload, {
      jobSearch: { locationScope: 'town', location: text },
    });
    await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', nextPayload);
    await sendMessage(lead.phone_e164, timeFilterPrompt(leadLocale(lead)), lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'jobseeker.awaiting_time_filter') {
    const timeFilter = parseTimeFilter(text);
    if (!timeFilter) {
      await sendMessage(lead.phone_e164, 'Invalid time filter. Reply 1, 2 or 3.', lead.linked_user_id);
      return true;
    }

    const nextPayload = mergePayload(payload, {
      jobSearch: { timeFilter },
    });
    await updateLeadState(lead.id, 'jobseeker.awaiting_role_mode', 'jobseeker', nextPayload);
    await sendMessage(
      lead.phone_e164,
      roleModePrompt(nextPayload.jobSearch?.searchType === 'internship' ? 'internship' : 'job', leadLocale(lead)),
      lead.linked_user_id
    );
    return true;
  }

  if (lead.conversation_state === 'jobseeker.awaiting_role_mode') {
    const roleMode = parseRoleMode(text);
    if (!roleMode) {
      await sendMessage(
        lead.phone_e164,
        'Reply 1 for all jobs or 2 for specific role.',
        lead.linked_user_id
      );
      return true;
    }

    const nextPayload = mergePayload(payload, {
      jobSearch: {
        roleMode,
        roleKeywords: roleMode === 'all' ? '' : null,
      },
    });

    if (roleMode === 'all') {
      await completeJobSearch(nextPayload);
      return true;
    }

    await updateLeadState(lead.id, 'jobseeker.awaiting_keywords', 'jobseeker', nextPayload);
    await sendMessage(lead.phone_e164, 'Role or skill keywords?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'jobseeker.awaiting_keywords') {
    const nextPayload = mergePayload(payload, {
      jobSearch: {
        roleMode: 'specific',
        roleKeywords: text,
      },
    });
    await completeJobSearch(nextPayload);
    return true;
  }

  return false;
}

async function startJobSearchFromIntent(
  lead: WaLeadRow,
  inboundText: string,
  searchType: 'job' | 'internship',
  hints?: {
    locationHint?: string | null;
    roleKeywordsHint?: string | null;
    timeFilterHint?: TimeFilter | null;
  }
): Promise<void> {
  if (!lead.linked_user_id) {
    const accountChoicePayload = mergePayload(lead.state_payload, {
      jobSearch: {
        searchType,
      },
    });
    await updateLeadState(lead.id, 'jobseeker.awaiting_account_choice', 'jobseeker', accountChoicePayload);
    await sendMessage(
      lead.phone_e164,
      [
        'No account was found for this WhatsApp number.',
        `You can preview up to ${NO_ACCOUNT_PREVIEW_LIMIT} jobs.`,
        `Create account now: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
        'Reply:',
        '1) Create account',
        '2) Continue search',
      ].join('\n'),
      lead.linked_user_id
    );
    return;
  }

  const locationHint = hints?.locationHint ?? extractLocationHint(inboundText);
  const roleHint = hints?.roleKeywordsHint ?? extractRoleKeywordsHint(inboundText);
  const timeFilterHint = hints?.timeFilterHint ?? null;
  const payload = mergePayload(lead.state_payload, {
    jobSearch: {
      searchType,
      locationScope: locationHint ? 'town' : null,
      location: locationHint,
      roleMode: roleHint ? 'specific' : null,
      roleKeywords: roleHint,
      timeFilter: timeFilterHint || null,
    },
  });

  if (!locationHint) {
    await updateLeadState(lead.id, 'jobseeker.awaiting_location_scope', 'jobseeker', payload);
    await sendMessage(lead.phone_e164, locationScopePrompt(searchType, leadLocale(lead)), lead.linked_user_id);
    return;
  }

  if (timeFilterHint) {
    await updateLeadState(lead.id, 'jobseeker.ready_results', 'jobseeker', payload);
    await saveLastSearch(lead.id, {
      location: locationHint,
      roleKeywords: roleHint || '',
      timeFilter: timeFilterHint,
      offset: 0,
    });
    await runJobSearchAndRespond(
      {
        ...lead,
        state_payload: payload as Record<string, unknown>,
        last_search_location: locationHint,
        last_search_role_keywords: roleHint || '',
        last_search_time_filter: timeFilterHint,
        last_search_offset: 0,
      },
      0
    );
    return;
  }

  if (!roleHint) {
    await updateLeadState(lead.id, 'jobseeker.awaiting_role_mode', 'jobseeker', payload);
    await sendMessage(lead.phone_e164, roleModePrompt(searchType, leadLocale(lead)), lead.linked_user_id);
    return;
  }

  await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', payload);
  await sendMessage(lead.phone_e164, timeFilterPrompt(leadLocale(lead)), lead.linked_user_id);
}

async function handleMenuChoice(lead: WaLeadRow, choice: 1 | 2 | 3 | 4, role: string | null): Promise<void> {
  if (choice === 1 || choice === 3) {
    const searchType: 'job' | 'internship' = choice === 3 ? 'internship' : 'job';
    const nextPayload = mergePayload({}, {
      jobSearch: {
        searchType,
        locationScope: null,
        location: null,
        roleMode: null,
        roleKeywords: null,
        timeFilter: null,
      },
    });

    if (!lead.linked_user_id) {
      await updateLeadState(lead.id, 'jobseeker.awaiting_account_choice', 'jobseeker', nextPayload);
      await sendMessage(
        lead.phone_e164,
        [
          'No account was found for this WhatsApp number.',
          `You can preview up to ${NO_ACCOUNT_PREVIEW_LIMIT} jobs.`,
          `Create account now: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
          'Reply:',
          '1) Create account',
          '2) Continue search',
        ].join('\n'),
        lead.linked_user_id
      );
      return;
    }

    const name = await getProfileDisplayName(lead.linked_user_id);
    await updateLeadState(lead.id, 'jobseeker.awaiting_location_scope', 'jobseeker', nextPayload);
    await sendMessage(
      lead.phone_e164,
      `${name ? `Welcome ${name}. ` : ''}${locationScopePrompt(searchType, leadLocale(lead))}`,
      lead.linked_user_id
    );
    return;
  }

  if (choice === 2) {
    const access = await enforceRecruiterPostingAccess(lead, role);
    if (!access.allowed) {
      return;
    }
    await updateLeadState(lead.id, 'recruiter.awaiting_title', 'recruiter', mergePayload({}, {}));
    await sendMessage(lead.phone_e164, 'Job title?', lead.linked_user_id);
    return;
  }

  await sendAccountStatusOrRegistration(lead, role);
  await sendMenuAndSetState(lead);
}

/**
 * The menu-driven state machine. Answers everything when the agent is off,
 * and is the fallback whenever an agent turn fails.
 */
async function handleLegacyInbound(
  input: InboundAgentInput,
  preloadedLead: WaLeadRow | null = null
): Promise<InboundAgentResult> {
  const inboundText = getInboundText(input.message, input.textBody);
  if (!inboundText) {
    return { handled: false, reason: 'not_text' };
  }

  try {
    let lead = preloadedLead ?? (await loadLead(input));
    const text = sanitizeFreeText(inboundText);
    const role = lead.linked_user_id ? await getProfileRole(lead.linked_user_id) : null;

    if (lead.conversation_state.startsWith('talent.')) {
      await updateLeadState(lead.id, 'menu', lead.role_selected, mergePayload({}, {}));
      lead = {
        ...lead,
        conversation_state: 'menu',
        state_payload: mergePayload({}, {}) as Record<string, unknown>,
      };
      logEvent('info', 'legacy_talent_state_reset', {
        leadId: lead.id,
        waMessageId: input.message.id,
      });
    }

    if (isOptOutCommand(text)) {
      return { handled: false, reason: 'delegated' };
    }

    if (isGreeting(text) || isHelpMenu(text)) {
      await sendMenuAndSetState(lead);
      return { handled: true, reason: 'handled' };
    }

    const details = parseDetailsCommand(text);
    if (details.isDetails) {
      if (!details.publicId) {
        await sendMessage(lead.phone_e164, 'Use DETAILS <JobID> e.g. DETAILS JL-1000', lead.linked_user_id);
        return { handled: true, reason: 'handled' };
      }

      const job = await getJobByPublicId(details.publicId);
      if (!job) {
        await sendMessage(lead.phone_e164, 'Job not found for that ID.', lead.linked_user_id);
        return { handled: true, reason: 'handled' };
      }

      await sendMessage(lead.phone_e164, formatJobDetailsMessage(job), lead.linked_user_id);
      return { handled: true, reason: 'handled' };
    }

    const apply = parseApplyCommand(text);
    if (apply.isApply) {
      if (!apply.publicId) {
        await sendMessage(lead.phone_e164, 'Use APPLY <JobID> e.g. APPLY JL-1000', lead.linked_user_id);
        return { handled: true, reason: 'handled' };
      }
      await handleApplyCommand(lead, input, apply.publicId);
      return { handled: true, reason: 'handled' };
    }

    if (isNextCommand(text)) {
      await runJobSearchAndRespond(lead, lead.last_search_offset || 0);
      return { handled: true, reason: 'handled' };
    }

    if (isCreateAccountIntent(text) && isMenuRootState(lead.conversation_state)) {
      await sendAccountStatusOrRegistration(lead, role);
      await sendMenuAndSetState(lead);
      return { handled: true, reason: 'handled' };
    }

    if (isJobseekerState(lead.conversation_state)) {
      const handled = await handleJobSeekerFlow(lead, text);
      if (handled) return { handled: true, reason: 'handled' };
    }

    if (isRecruiterState(lead.conversation_state)) {
      const handled = await handleRecruiterFlow(lead, text, role);
      if (handled) return { handled: true, reason: 'handled' };
    }

    const menuChoice = isMenuRootState(lead.conversation_state)
      ? parseMenuChoice(text)
      : null;
    if (menuChoice) {
      await handleMenuChoice(lead, menuChoice, role);
      return { handled: true, reason: 'handled' };
    }

    // Forwarded job posting? Route it into the discovery pipeline instead of
    // treating the announcement text as a job-search query. Uses the raw
    // inbound text — `text` is truncated by sanitizeFreeText.
    if (looksLikeForwardedJobPosting(inboundText)) {
      try {
        const intake = await storeForwardedJobPosting(inboundText, lead.phone_e164);
        if (intake.stored) {
          await sendMessage(
            lead.phone_e164,
            intake.duplicate
              ? 'Thanks! We already received this job posting — it is in our verification queue. 🙏'
              : 'Thanks for forwarding this job! 🙏 Our team will verify it and publish it on Joblinca if it checks out. Reply MENU for options.',
            lead.linked_user_id
          );
          logEvent('info', 'job_forward_intake', {
            leadId: lead.id,
            waMessageId: input.message.id,
            duplicate: intake.duplicate,
          });
          return { handled: true, reason: 'handled' };
        }
      } catch (forwardErr) {
        // Fall through to the normal flow — intake must never break the agent
        logEvent('error', 'job_forward_intake_error', {
          leadId: lead.id,
          waMessageId: input.message.id,
          error: forwardErr instanceof Error ? forwardErr.message : 'unknown_error',
        });
      }
    }

    // Deterministic keyword parse first; the model is consulted only when that
    // comes back 'unknown', which is where French and unusual phrasings land.
    // Also settles which language to answer in.
    const intent = await resolveInboundIntent(text, { storedLanguage: lead.language });

    if (intent.detectedLanguage && intent.detectedLanguage !== lead.language) {
      await setLeadLanguage(lead, intent.detectedLanguage);
      // Keep the in-memory row in step so replies sent later in this same turn
      // already use the new language.
      lead.language = intent.detectedLanguage;
    }

    logEvent('info', 'intent_resolved', {
      leadId: lead.id,
      intent: intent.intent,
      source: intent.source,
      language: intent.language,
    });

    if (intent.intent === 'menu') {
      await sendMenuAndSetState(lead);
      return { handled: true, reason: 'handled' };
    }

    if (
      intent.intent === 'recruiter' &&
      (lead.conversation_state === 'idle' || lead.conversation_state === 'menu')
    ) {
      await handleMenuChoice(lead, 2, role);
      return { handled: true, reason: 'handled' };
    }

    if (intent.intent === 'jobseeker') {
      await startJobSearchFromIntent(lead, text, 'job', {
        locationHint: intent.locationHint,
        roleKeywordsHint: intent.roleKeywordsHint,
        timeFilterHint: intent.timeFilterHint,
      });
      return { handled: true, reason: 'handled' };
    }

    if (intent.intent === 'talent') {
      await startJobSearchFromIntent(lead, text, 'internship', {
        locationHint: intent.locationHint,
        roleKeywordsHint: intent.roleKeywordsHint,
        timeFilterHint: intent.timeFilterHint,
      });
      return { handled: true, reason: 'handled' };
    }

    if (looksLikeInternshipIntent(text)) {
      await startJobSearchFromIntent(lead, text, 'internship');
      return { handled: true, reason: 'handled' };
    }

    if (looksLikeJobIntent(text)) {
      await startJobSearchFromIntent(lead, text, 'job');
      return { handled: true, reason: 'handled' };
    }

    if (lead.conversation_state === 'idle' || lead.conversation_state === 'menu') {
      await sendMenuAndSetState(lead);
      return { handled: true, reason: 'handled' };
    }

    await sendMessage(lead.phone_e164, 'Reply MENU for options.', lead.linked_user_id);
    return { handled: true, reason: 'handled' };
  } catch (error) {
    logEvent('error', 'router_error', {
      waMessageId: input.message.id,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return { handled: false, reason: 'error' };
  }
}

function inboundTimestampIso(message: WAInboundMessage): string {
  const seconds = Number(message.timestamp);
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : new Date().toISOString();
}

const HANDOFF_EXTEND_MS = 24 * 60 * 60 * 1000;

/**
 * REPLY / RESUME from an admin phone. Lets the team run a handoff entirely
 * from WhatsApp: replies are relayed from the business number, so the user
 * stays in one thread and everything lands in whatsapp_logs.
 */
async function handleAdminCommand(adminPhone: string, command: AdminCommand): Promise<void> {
  const target = await findWaLeadByPhone(command.phone);
  if (!target) {
    await sendMessage(adminPhone, `No WhatsApp conversation found for ${command.phone}.`);
    return;
  }
  const fr = target.language === 'fr';

  if (command.type === 'reply') {
    await sendMessage(
      target.phone_e164,
      `${fr ? '👤 Équipe JobLinca' : '👤 JobLinca team'}: ${command.message}`,
      target.linked_user_id
    );
    // Each reply keeps the human in charge for another day.
    await setLeadPause(
      target.id,
      new Date(Date.now() + HANDOFF_EXTEND_MS).toISOString(),
      target.handoff_reason ?? 'admin_reply'
    );
    await sendMessage(adminPhone, `✓ Sent to ${target.phone_e164}. The bot stays quiet; RESUME ${target.phone_e164} to hand back.`);
    return;
  }

  await setLeadPause(target.id, null, null);
  await updateLeadState(target.id, 'agent', target.role_selected, target.state_payload || {});
  await sendMessage(
    target.phone_e164,
    fr
      ? "Vous êtes de nouveau avec l'assistant JobLinca. Dites-moi quel emploi vous cherchez."
      : "You're back with the JobLinca assistant. Tell me what job you're looking for.",
    target.linked_user_id
  );
  await sendMessage(adminPhone, `✓ ${target.phone_e164} is back with the bot.`);
}

/**
 * Entry point. Per lead, WA_AGENT_MODE / allowlist / rollout decide:
 *   off    -- menu flow only (exactly the pre-agent behaviour)
 *   live   -- the agent answers; any failure falls back to the menu flow
 *   shadow -- the menu flow answers; the agent then runs read-only and its
 *             would-be reply is logged to wa_agent_turns for comparison
 */
export async function handleWhatsAppJobAgentInbound(input: InboundAgentInput): Promise<InboundAgentResult> {
  const inboundText = getInboundText(input.message, input.textBody);
  if (!inboundText) {
    return { handled: false, reason: 'not_text' };
  }

  const senderPhone = toE164(input.waPhone || input.message.from);

  // Admin handoff commands work in every mode, so a handoff can always be closed.
  const adminCommand = parseAdminCommand(inboundText);
  if (adminCommand && isAdminAlertRecipient(senderPhone)) {
    try {
      await handleAdminCommand(senderPhone, adminCommand);
    } catch (error) {
      logEvent('error', 'admin_command_failed', {
        error: error instanceof Error ? error.message : 'unknown_error',
      });
      await sendMessage(senderPhone, 'Command failed -- check the logs.');
    }
    return { handled: true, reason: 'handled' };
  }

  const route = decideAgentRoute(senderPhone);
  if (route === 'off') {
    return handleLegacyInbound(input);
  }

  let lead: WaLeadRow;
  try {
    lead = await loadLead(input);
  } catch (error) {
    logEvent('error', 'agent_load_lead_failed', {
      waMessageId: input.message.id,
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return handleLegacyInbound(input);
  }

  const text = sanitizeFreeText(inboundText, 1000);

  // A person has this conversation: stay silent, but pass the message on so
  // the team sees follow-ups without opening anything. STOP still works.
  if (isLeadPaused(lead) && !isOptOutCommand(text)) {
    await sendAdminWhatsAppAlert(
      [`💬 ${lead.phone_e164}: ${text.slice(0, 700)}`, `REPLY ${lead.phone_e164} <message> · RESUME ${lead.phone_e164}`].join('\n')
    ).catch(() => undefined);
    logEvent('info', 'paused_lead_message_forwarded', { leadId: lead.id });
    return { handled: true, reason: 'handled' };
  }

  const displayName = await getProfileDisplayName(lead.linked_user_id);
  const role = lead.linked_user_id ? await getProfileRole(lead.linked_user_id) : null;
  const eligible =
    isAgentEligible(lead, text, role) && (await countRecentAgentTurns(lead.id)) < DAILY_AGENT_TURN_CAP;
  const turnParams = {
    // Line breaks kept: a recruiter's pasted job ad becomes the description.
    inboundText: inboundText.trim().slice(0, 4000),
    role,
    waMessageId: input.message.id,
    inboundAtIso: inboundTimestampIso(input.message),
  };

  if (route === 'live' && eligible) {
    const lock = await acquireLeadLock(lead.id);
    try {
      // Re-read under the lease: a turn that just finished may have moved
      // this lead's state since we first loaded it.
      lead = await loadLead(input);
      const outcome = await runAgentForLead({
        ...turnParams,
        lead,
        route: 'live',
        displayName,
      });
      if (outcome.ok) {
        await sendMessage(lead.phone_e164, outcome.reply, lead.linked_user_id);
        if (outcome.followUp?.type === 'apply') {
          // The existing APPLY handler owns limits, duplicates, screening and
          // external-apply instructions; it sends its own result message.
          await handleApplyCommand(lead, input, outcome.followUp.publicId);
        }
        return { handled: true, reason: 'handled' };
      }
      logEvent('warn', 'agent_fallback', { leadId: lead.id, reason: outcome.reason });
      return await handleLegacyInbound(input, lead);
    } finally {
      await lock.release();
    }
  }

  const result = await handleLegacyInbound(input, lead);

  if (route === 'shadow' && eligible && result.handled) {
    await runAgentForLead({
      ...turnParams,
      lead,
      route: 'shadow',
      displayName,
    }).catch((error) => {
      logEvent('warn', 'agent_shadow_failed', {
        leadId: lead.id,
        error: error instanceof Error ? error.message : 'unknown_error',
      });
    });
  }

  return result;
}

export function monthlyLimitSummaryMessage(): string {
  return `Free limits: ${FREE_MONTHLY_VIEW_LIMIT} job views/month, ${FREE_MONTHLY_APPLY_LIMIT} applies/month (GMT+1 reset).`;
}
