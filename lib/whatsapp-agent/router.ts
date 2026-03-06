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
  upsertTalentLeadProfile,
  getProfileRole,
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
  looksLikeInternshipIntent,
  looksLikeJobIntent,
  extractLocationHint,
  extractRoleKeywordsHint,
} from '@/lib/whatsapp-agent/parser';
import { parseIntentFromFreeText } from '@/lib/whatsapp-agent/intent-nlp';
import {
  mergePayload,
  menuMessage,
  timeFilterPrompt,
  isMenuRootState,
  isJobseekerState,
  isRecruiterState,
  isTalentState,
  type WaConversationState,
  type WaRoleSelection,
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
import { getUserSubscription } from '@/lib/subscriptions';
import OpenAI from 'openai';

const agentDb = createServiceSupabaseClient();
const SEARCH_PAGE_SIZE = 10;
const NO_ACCOUNT_PREVIEW_LIMIT = 3;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
const REGISTER_URL = `${APP_URL}/auth/register`;
const SUBSCRIBE_URL = `${APP_URL}/pricing`;
const JOBS_URL = `${APP_URL}/jobs`;
const WA_RECRUITER_POSTING_FEE_XAF = Number(process.env.WA_RECRUITER_POSTING_FEE_XAF || '0');
const WA_RECRUITER_REQUIRE_SUBSCRIPTION =
  process.env.WA_RECRUITER_REQUIRE_SUBSCRIPTION !== '0';
const RECRUITER_DESC_SYSTEM_PROMPT =
  'You are an HR copywriter. Generate a concise and professional job description in markdown with sections: About the Role, Responsibilities, Requirements, Nice to Have. Keep it practical for Cameroon hiring.';

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

function parseSalary(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (Number.isNaN(value)) return null;
  return value;
}

function buildRegisterUrl(phone: string, role: 'job_seeker' | 'recruiter' = 'job_seeker'): string {
  const params = new URLSearchParams({
    role,
    source: 'whatsapp',
    phone,
  });
  return `${REGISTER_URL}?${params.toString()}`;
}

function locationScopePrompt(searchType: 'job' | 'internship'): string {
  const label = searchType === 'internship' ? 'internships' : 'jobs';
  return [
    `Great. Let us find ${label}.`,
    'Choose location scope:',
    '1) Nationwide',
    '2) Specific town',
  ].join('\n');
}

function roleModePrompt(searchType: 'job' | 'internship'): string {
  const label = searchType === 'internship' ? 'internships' : 'jobs';
  return [
    `Do you want:`,
    `1) All ${label}`,
    '2) Specific role',
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

function detectApplyMethod(raw: string): {
  applyMethod: 'joblinca' | 'external_url' | 'email' | 'phone' | 'whatsapp' | 'multiple';
  externalApplyUrl: string | null;
  applyEmail: string | null;
  applyPhone: string | null;
  applyWhatsapp: string | null;
} {
  const value = raw.trim();
  const lower = value.toLowerCase();
  const emailMatch = value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const urlMatch = value.match(/https?:\/\/[^\s]+/i);
  const phoneDigits = value.replace(/[^\d]/g, '');

  if (urlMatch) {
    return {
      applyMethod: 'external_url',
      externalApplyUrl: urlMatch[0],
      applyEmail: null,
      applyPhone: null,
      applyWhatsapp: null,
    };
  }

  if (emailMatch) {
    return {
      applyMethod: 'email',
      externalApplyUrl: null,
      applyEmail: emailMatch[0],
      applyPhone: null,
      applyWhatsapp: null,
    };
  }

  if (lower.includes('whatsapp') && phoneDigits.length >= 8) {
    return {
      applyMethod: 'whatsapp',
      externalApplyUrl: null,
      applyEmail: null,
      applyPhone: null,
      applyWhatsapp: phoneDigits,
    };
  }

  if (phoneDigits.length >= 8) {
    return {
      applyMethod: 'phone',
      externalApplyUrl: null,
      applyEmail: null,
      applyPhone: phoneDigits,
      applyWhatsapp: null,
    };
  }

  return {
    applyMethod: 'joblinca',
    externalApplyUrl: null,
    applyEmail: null,
    applyPhone: null,
    applyWhatsapp: null,
  };
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
  await sendMessage(lead.phone_e164, menuMessage(), lead.linked_user_id);
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

async function enforceRecruiterPostingAccess(
  lead: WaLeadRow,
  role: string | null
): Promise<{ allowed: boolean; reason?: string }> {
  if (!lead.linked_user_id) {
    await sendMessage(
      lead.phone_e164,
      `Recruiter posting requires a website account. Create account: ${buildRegisterUrl(lead.phone_e164, 'recruiter')}`,
      lead.linked_user_id
    );
    return { allowed: false, reason: 'missing_account' };
  }

  if (role !== 'recruiter' && role !== 'admin' && role !== 'staff') {
    await sendMessage(
      lead.phone_e164,
      `This number is not linked to a recruiter account. Login/create recruiter profile: ${buildRegisterUrl(lead.phone_e164, 'recruiter')}`,
      lead.linked_user_id
    );
    return { allowed: false, reason: 'not_recruiter' };
  }

  if (role === 'admin' || role === 'staff') {
    return { allowed: true };
  }

  if (!WA_RECRUITER_REQUIRE_SUBSCRIPTION) {
    return { allowed: true };
  }

  const subscription = await getUserSubscription(lead.linked_user_id);
  if (!subscription.isActive || subscription.plan?.role !== 'recruiter') {
    await sendMessage(
      lead.phone_e164,
      `Active recruiter subscription required before posting jobs. Subscribe here: ${SUBSCRIBE_URL}`,
      lead.linked_user_id
    );
    return { allowed: false, reason: 'missing_subscription' };
  }

  if (WA_RECRUITER_POSTING_FEE_XAF > 0) {
    await sendMessage(
      lead.phone_e164,
      `Posting fee: ${WA_RECRUITER_POSTING_FEE_XAF.toLocaleString('en-US')} XAF (charged on website).`,
      lead.linked_user_id
    );
  }

  return { allowed: true };
}

async function expandRecruiterDescriptionWithAi(input: {
  jobTitle: string;
  companyName: string | null;
  seedDescription: string;
}): Promise<string> {
  const seed = input.seedDescription.trim();
  if (!seed) return seed;
  if (!process.env.OPENAI_API_KEY) return seed;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completionPromise = openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: RECRUITER_DESC_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            `Job title: ${input.jobTitle}`,
            `Company: ${input.companyName || 'Not specified'}`,
            `Recruiter short brief: ${seed}`,
          ].join('\n'),
        },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const timeoutPromise = new Promise<null>((resolve) =>
      setTimeout(() => resolve(null), 8000)
    );
    const completion = await Promise.race([completionPromise, timeoutPromise]);
    if (!completion) return seed;

    const generated = completion.choices?.[0]?.message?.content?.trim();
    if (!generated) return seed;
    return generated;
  } catch (error) {
    logEvent('warn', 'recruiter_description_ai_failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return seed;
  }
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

  const linkedUserId =
    resolvedByPhone ||
    input.conversationUserId ||
    lead.linked_user_id ||
    null;

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

  const recruiterProfile = await agentDb
    .from('recruiters')
    .select('id, company_name')
    .eq('id', lead.linked_user_id)
    .maybeSingle();

  if (!recruiterProfile.data?.id) {
    await sendMessage(
      lead.phone_e164,
      `Recruiter profile not complete. Please complete it on website: ${APP_URL}/dashboard/recruiter/profile`,
      lead.linked_user_id
    );
    await sendMenuAndSetState(lead);
    return true;
  }

  const applyMethod = detectApplyMethod(draft.applicationMethod);
  const salary = parseSalary(draft.salary);
  const aiDescription = await expandRecruiterDescriptionWithAi({
    jobTitle: draft.jobTitle,
    companyName: recruiterProfile.data.company_name || null,
    seedDescription: draft.description,
  });

  const { data: createdJob, error: createError } = await agentDb
    .from('jobs')
    .insert({
      recruiter_id: lead.linked_user_id,
      posted_by: lead.linked_user_id,
      posted_by_role: 'recruiter',
      title: draft.jobTitle,
      location: draft.location,
      salary,
      description: aiDescription || draft.description,
      company_name: recruiterProfile.data.company_name || null,
      published: false,
      approval_status: 'pending',
      apply_method: applyMethod.applyMethod,
      external_apply_url: applyMethod.externalApplyUrl,
      apply_email: applyMethod.applyEmail,
      apply_phone: applyMethod.applyPhone,
      apply_whatsapp: applyMethod.applyWhatsapp,
    })
    .select('id, public_id')
    .single();

  if (createError || !createdJob) {
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
    `Job created (${createdJob.public_id || createdJob.id}) and sent for review. Reply MENU for more options.`,
    lead.linked_user_id
  );
  return true;
}

async function handleTalentFlow(lead: WaLeadRow, inboundText: string): Promise<boolean> {
  const payload = mergePayload(lead.state_payload, {});
  const text = sanitizeFreeText(inboundText, 400);

  if (lead.conversation_state === 'talent.awaiting_name') {
    const nextPayload = mergePayload(payload, {
      talentDraft: { fullName: text },
    });
    await updateLeadState(lead.id, 'talent.awaiting_institution', 'talent', nextPayload);
    await sendMessage(lead.phone_e164, 'University or College name?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'talent.awaiting_institution') {
    const nextPayload = mergePayload(payload, {
      talentDraft: { institutionName: text },
    });
    await updateLeadState(lead.id, 'talent.awaiting_town', 'talent', nextPayload);
    await sendMessage(lead.phone_e164, 'Town?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'talent.awaiting_town') {
    const nextPayload = mergePayload(payload, {
      talentDraft: { town: text },
    });
    await updateLeadState(lead.id, 'talent.awaiting_major', 'talent', nextPayload);
    await sendMessage(lead.phone_e164, 'Course or major?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'talent.awaiting_major') {
    const nextPayload = mergePayload(payload, {
      talentDraft: { courseOrMajor: text },
    });
    await updateLeadState(lead.id, 'talent.awaiting_cv_projects', 'talent', nextPayload);
    await sendMessage(lead.phone_e164, 'Share CV link and/or projects.', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state !== 'talent.awaiting_cv_projects') {
    return false;
  }

  const nextPayload = mergePayload(payload, {
    talentDraft: { cvOrProjects: text },
  });
  const draft = nextPayload.talentDraft;
  if (
    !draft?.fullName ||
    !draft.institutionName ||
    !draft.town ||
    !draft.courseOrMajor ||
    !draft.cvOrProjects
  ) {
    await sendMessage(lead.phone_e164, 'Please provide all required talent fields. Reply MENU to restart.', lead.linked_user_id);
    return true;
  }

  await upsertTalentLeadProfile(lead.id, {
    fullName: draft.fullName,
    institutionName: draft.institutionName,
    town: draft.town,
    courseOrMajor: draft.courseOrMajor,
    cvOrProjects: draft.cvOrProjects,
    completed: true,
  });

  await updateLeadState(lead.id, 'menu', 'talent', mergePayload({}, {}));
  await sendMessage(
    lead.phone_e164,
    `Talent profile saved as WhatsApp lead. A recruiter or team member can follow up. Reply MENU anytime.`,
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
      locationScopePrompt(nextPayload.jobSearch?.searchType === 'internship' ? 'internship' : 'job'),
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
      await sendMessage(lead.phone_e164, timeFilterPrompt(), lead.linked_user_id);
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
    await sendMessage(lead.phone_e164, timeFilterPrompt(), lead.linked_user_id);
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
      roleModePrompt(nextPayload.jobSearch?.searchType === 'internship' ? 'internship' : 'job'),
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
    await sendMessage(lead.phone_e164, locationScopePrompt(searchType), lead.linked_user_id);
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
    await sendMessage(lead.phone_e164, roleModePrompt(searchType), lead.linked_user_id);
    return;
  }

  await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', payload);
  await sendMessage(lead.phone_e164, timeFilterPrompt(), lead.linked_user_id);
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
      `${name ? `Welcome ${name}. ` : ''}${locationScopePrompt(searchType)}`,
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

  await sendMessage(
    lead.phone_e164,
    `Create your account using this WhatsApp number: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
    lead.linked_user_id
  );
  await sendMenuAndSetState(lead);
}

export async function handleWhatsAppJobAgentInbound(input: InboundAgentInput): Promise<InboundAgentResult> {
  const inboundText = getInboundText(input.message, input.textBody);
  if (!inboundText) {
    return { handled: false, reason: 'not_text' };
  }

  try {
    let lead = await loadLead(input);
    const text = sanitizeFreeText(inboundText);
    const lower = text.toLowerCase();
    const role = lead.linked_user_id ? await getProfileRole(lead.linked_user_id) : null;

    if (['stop', 'unsubscribe', 'no', 'non'].includes(lower)) {
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
      await sendMessage(
        lead.phone_e164,
        `Create your account using this WhatsApp number: ${buildRegisterUrl(lead.phone_e164, 'job_seeker')}`,
        lead.linked_user_id
      );
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

    if (isTalentState(lead.conversation_state)) {
      const handled = await handleTalentFlow(lead, text);
      if (handled) return { handled: true, reason: 'handled' };
    }

    const menuChoice = isMenuRootState(lead.conversation_state)
      ? parseMenuChoice(text)
      : null;
    if (menuChoice) {
      await handleMenuChoice(lead, menuChoice, role);
      return { handled: true, reason: 'handled' };
    }

    const intent = parseIntentFromFreeText(text);
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

export function monthlyLimitSummaryMessage(): string {
  return `Free limits: ${FREE_MONTHLY_VIEW_LIMIT} job views/month, ${FREE_MONTHLY_APPLY_LIMIT} applies/month (GMT+1 reset).`;
}
