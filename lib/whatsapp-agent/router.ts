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
  parseMenuChoice,
  parseTimeFilter,
  isGreeting,
  isHelpMenu,
  isNextCommand,
  looksLikeJobIntent,
  extractLocationHint,
  extractRoleKeywordsHint,
} from '@/lib/whatsapp-agent/parser';
import { parseIntentFromFreeText } from '@/lib/whatsapp-agent/intent-nlp';
import {
  mergePayload,
  menuMessage,
  timeFilterPrompt,
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

const agentDb = createServiceSupabaseClient();
const SEARCH_PAGE_SIZE = 10;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
const ACCOUNT_URL = `${APP_URL}/auth/login`;
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

function parseSalary(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (Number.isNaN(value)) return null;
  return value;
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

async function loadLead(input: InboundAgentInput): Promise<WaLeadRow> {
  const phone = toE164(input.waPhone || input.message.from);
  let lead = await getOrCreateWaLead({
    conversationId: input.conversationId,
    waId: input.message.from,
    phone,
    displayName: null,
  });

  const linkedUserId = input.conversationUserId || (await resolveWebsiteUserByPhone(phone));
  lead = await syncLeadUserLink(lead, linkedUserId);
  return lead;
}

async function runJobSearchAndRespond(lead: WaLeadRow, offset: number): Promise<void> {
  const location = (lead.last_search_location || '').trim();
  const roleKeywords = (lead.last_search_role_keywords || '').trim();
  const timeFilter = lead.last_search_time_filter;

  if (!location || !roleKeywords || !timeFilter) {
    await sendMessage(lead.phone_e164, 'No active search found. Reply 1 to start job search.', lead.linked_user_id);
    return;
  }

  const limitCtx = await getWaLimitContext(lead.linked_user_id);
  const { jobs } = await searchPublishedJobs({
    location,
    roleKeywords,
    timeFilter: timeFilter as TimeFilter,
    offset,
    limit: SEARCH_PAGE_SIZE,
  });

  if (jobs.length === 0) {
    await sendMessage(lead.phone_e164, 'No more jobs for this search. Reply MENU to start a new search.', lead.linked_user_id);
    return;
  }

  const decision = evaluateViewBatch({
    subscribed: limitCtx.subscribed,
    currentViews: lead.views_month_count || 0,
    batchSize: jobs.length,
  });

  await sendMessage(
    lead.phone_e164,
    formatJobBatchMessage({
      jobs,
      visibleCount: decision.visibleCount,
      lockedCount: decision.lockedCount,
      hasMore: jobs.length === SEARCH_PAGE_SIZE,
      subscribed: limitCtx.subscribed,
    }),
    lead.linked_user_id
  );
  await sendQuickActions(lead.phone_e164, lead.linked_user_id);

  await setLastSearchOffset(lead.id, offset + jobs.length);
  await incrementViewCounter(lead, decision.incrementBy);
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
      `To apply, create/login on website first: ${ACCOUNT_URL}\nWe saved your intent for ${job.public_id || publicId}.`,
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
  if (!lead.linked_user_id) {
    await sendMessage(
      lead.phone_e164,
      `Recruiter posting requires website account. Create/login here: ${ACCOUNT_URL}`,
      lead.linked_user_id
    );
    await sendMenuAndSetState(lead);
    return true;
  }

  if (role !== 'recruiter' && role !== 'admin' && role !== 'staff') {
    await sendMessage(
      lead.phone_e164,
      `Recruiter account required. Login with recruiter account: ${ACCOUNT_URL}`,
      lead.linked_user_id
    );
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
    await sendMessage(lead.phone_e164, 'Job description?', lead.linked_user_id);
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

  const { data: createdJob, error: createError } = await agentDb
    .from('jobs')
    .insert({
      recruiter_id: lead.linked_user_id,
      posted_by: lead.linked_user_id,
      posted_by_role: 'recruiter',
      title: draft.jobTitle,
      location: draft.location,
      salary,
      description: draft.description,
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

  if (lead.conversation_state === 'jobseeker.awaiting_location') {
    const nextPayload = mergePayload(payload, {
      jobSearch: { location: text },
    });
    await updateLeadState(lead.id, 'jobseeker.awaiting_keywords', 'jobseeker', nextPayload);
    await sendMessage(lead.phone_e164, 'Role or skill keywords?', lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state === 'jobseeker.awaiting_keywords') {
    const nextPayload = mergePayload(payload, {
      jobSearch: { roleKeywords: text },
    });
    await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', nextPayload);
    await sendMessage(lead.phone_e164, timeFilterPrompt(), lead.linked_user_id);
    return true;
  }

  if (lead.conversation_state !== 'jobseeker.awaiting_time_filter') {
    return false;
  }

  const timeFilter = parseTimeFilter(text);
  if (!timeFilter) {
    await sendMessage(lead.phone_e164, 'Invalid time filter. Reply 1, 2 or 3.', lead.linked_user_id);
    return true;
  }

  const nextPayload = mergePayload(payload, {
    jobSearch: { timeFilter },
  });

  const searchDraft = nextPayload.jobSearch;
  if (!searchDraft?.location || !searchDraft.roleKeywords || !searchDraft.timeFilter) {
    await sendMessage(lead.phone_e164, 'Missing search fields. Reply MENU and choose 1 again.', lead.linked_user_id);
    await sendMenuAndSetState(lead);
    return true;
  }

  await updateLeadState(lead.id, 'jobseeker.ready_results', 'jobseeker', nextPayload);
  await saveLastSearch(lead.id, {
    location: searchDraft.location,
    roleKeywords: searchDraft.roleKeywords,
    timeFilter: searchDraft.timeFilter,
    offset: 0,
  });

  await runJobSearchAndRespond(
    {
      ...lead,
      last_search_location: searchDraft.location,
      last_search_role_keywords: searchDraft.roleKeywords,
      last_search_time_filter: searchDraft.timeFilter,
      last_search_offset: 0,
    },
    0
  );

  return true;
}

async function startJobSearchFromIntent(
  lead: WaLeadRow,
  inboundText: string,
  hints?: {
    locationHint?: string | null;
    roleKeywordsHint?: string | null;
    timeFilterHint?: TimeFilter | null;
  }
): Promise<void> {
  const locationHint = hints?.locationHint ?? extractLocationHint(inboundText);
  const roleHint = hints?.roleKeywordsHint ?? extractRoleKeywordsHint(inboundText);
  const timeFilterHint = hints?.timeFilterHint ?? null;
  const payload = mergePayload(lead.state_payload, {
    jobSearch: {
      location: locationHint,
      roleKeywords: roleHint,
      timeFilter: timeFilterHint || null,
    },
  });

  if (!locationHint) {
    await updateLeadState(lead.id, 'jobseeker.awaiting_location', 'jobseeker', payload);
    await sendMessage(lead.phone_e164, 'Job search started. Which location?', lead.linked_user_id);
    return;
  }

  if (!roleHint) {
    await updateLeadState(lead.id, 'jobseeker.awaiting_keywords', 'jobseeker', payload);
    await sendMessage(lead.phone_e164, 'Role or skill keywords?', lead.linked_user_id);
    return;
  }

  if (timeFilterHint) {
    await updateLeadState(lead.id, 'jobseeker.ready_results', 'jobseeker', payload);
    await saveLastSearch(lead.id, {
      location: locationHint,
      roleKeywords: roleHint,
      timeFilter: timeFilterHint,
      offset: 0,
    });
    await runJobSearchAndRespond(
      {
        ...lead,
        last_search_location: locationHint,
        last_search_role_keywords: roleHint,
        last_search_time_filter: timeFilterHint,
        last_search_offset: 0,
      },
      0
    );
    return;
  }

  await updateLeadState(lead.id, 'jobseeker.awaiting_time_filter', 'jobseeker', payload);
  await sendMessage(lead.phone_e164, timeFilterPrompt(), lead.linked_user_id);
}

async function handleMenuChoice(lead: WaLeadRow, choice: 1 | 2 | 3 | 4, role: string | null): Promise<void> {
  if (choice === 4) {
    await sendMenuAndSetState(lead);
    return;
  }

  if (choice === 1) {
    await updateLeadState(lead.id, 'jobseeker.awaiting_location', 'jobseeker', mergePayload({}, {}));
    await sendMessage(lead.phone_e164, 'Great. Which location are you targeting?', lead.linked_user_id);
    return;
  }

  if (choice === 2) {
    if (!lead.linked_user_id) {
      await sendMessage(
        lead.phone_e164,
        `Recruiter posting requires website account. Create/login: ${ACCOUNT_URL}`,
        lead.linked_user_id
      );
      return;
    }
    if (role !== 'recruiter' && role !== 'admin' && role !== 'staff') {
      await sendMessage(
        lead.phone_e164,
        `Recruiter account required. Login with recruiter profile: ${ACCOUNT_URL}`,
        lead.linked_user_id
      );
      return;
    }
    await updateLeadState(lead.id, 'recruiter.awaiting_title', 'recruiter', mergePayload({}, {}));
    await sendMessage(lead.phone_e164, 'Job title?', lead.linked_user_id);
    return;
  }

  await updateLeadState(lead.id, 'talent.awaiting_name', 'talent', mergePayload({}, {}));
  await sendMessage(lead.phone_e164, 'Talent profile started. Full name?', lead.linked_user_id);
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

    const menuChoice = parseMenuChoice(text);
    if (menuChoice) {
      await handleMenuChoice(lead, menuChoice, role);
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

    if (
      intent.intent === 'talent' &&
      (lead.conversation_state === 'idle' || lead.conversation_state === 'menu')
    ) {
      await handleMenuChoice(lead, 3, role);
      return { handled: true, reason: 'handled' };
    }

    if (intent.intent === 'jobseeker') {
      await startJobSearchFromIntent(lead, text, {
        locationHint: intent.locationHint,
        roleKeywordsHint: intent.roleKeywordsHint,
        timeFilterHint: intent.timeFilterHint,
      });
      return { handled: true, reason: 'handled' };
    }

    if (looksLikeJobIntent(text)) {
      await startJobSearchFromIntent(lead, text);
      return { handled: true, reason: 'handled' };
    }

    if (lead.conversation_state.startsWith('jobseeker.')) {
      await handleJobSeekerFlow(lead, text);
      return { handled: true, reason: 'handled' };
    }

    if (lead.conversation_state.startsWith('recruiter.')) {
      const handled = await handleRecruiterFlow(lead, text, role);
      if (handled) return { handled: true, reason: 'handled' };
    }

    if (lead.conversation_state.startsWith('talent.')) {
      const handled = await handleTalentFlow(lead, text);
      if (handled) return { handled: true, reason: 'handled' };
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
