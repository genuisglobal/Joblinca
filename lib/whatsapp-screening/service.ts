import { createServiceSupabaseClient } from '@/lib/supabase/service';
import type { WAInboundMessage } from '@/lib/whatsapp';
import { toE164 } from '@/lib/whatsapp';
import { linkConversationToUser } from '@/lib/whatsapp-db';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import { getUserSubscription } from '@/lib/subscriptions';
import { resolveProfileIdByPhone } from '@/lib/phone-match';
import {
  generateOptionalFollowUpQuestion,
  generateRecruiterSummary,
  isAiFollowUpEnabled,
  isAiSummaryEnabled,
} from '@/lib/whatsapp-screening/ai';
import {
  TERMINAL_STATES,
  buildHybridQuestionCatalog,
  computeFinalScoring,
  evaluateAnswer,
  isCancelIntent,
  parseApplyIntent,
  parseLanguageSelection,
  parseYesNo,
  type AnswerEvaluation,
  type ScreeningQuestion,
  type ScreeningState,
  type SupportedLanguage,
} from '@/lib/whatsapp-screening/state-machine';

interface ScreeningSessionRow {
  id: string;
  wa_conversation_id: string;
  wa_phone: string;
  user_id: string | null;
  job_id: string | null;
  recruiter_id: string | null;
  language_code: SupportedLanguage;
  state: ScreeningState;
  question_catalog: ScreeningQuestion[];
  current_question_index: number;
  total_questions: number;
  session_day: string;
  weighted_score: number | null;
  must_have_passed: boolean | null;
  result_label: 'qualified' | 'review' | 'reject' | null;
  ai_summary_status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped' | null;
  ai_summary_text: string | null;
  ai_recommendation: 'strong_yes' | 'review' | 'reject' | null;
  ai_key_strengths: string[];
  ai_key_risks: string[];
  ai_model: string | null;
  ai_tokens_used: number | null;
  ai_error: string | null;
  ai_last_generated_at: string | null;
  ai_followup_generated: boolean;
  ai_followup_question: string | null;
  last_inbound_at?: string | null;
  started_at?: string | null;
  updated_at?: string | null;
}

interface ScreeningAnswerRow {
  question_key: string;
  score_delta: number;
  must_have_passed: boolean | null;
}

interface SummaryAnswerRow {
  question_text: string;
  answer_text: string;
  is_must_have: boolean;
  score_delta: number;
}

interface ScreeningNotificationRow {
  id: string;
  session_id: string;
  recruiter_id: string;
  channel: 'dashboard' | 'email' | 'whatsapp';
  destination: string | null;
  status: 'pending' | 'sent' | 'failed' | 'skipped';
  attempt_count: number;
  last_error: string | null;
  wa_screening_sessions: {
    id: string;
    wa_phone: string;
    result_label: 'qualified' | 'review' | 'reject' | null;
    weighted_score: number | null;
    jobs: {
      title: string | null;
    } | null;
  } | null;
}

interface InboundScreeningInput {
  message: WAInboundMessage;
  textBody: string | null;
  conversationId: string;
  conversationUserId: string | null;
  waPhone: string;
}

interface InboundScreeningResult {
  handled: boolean;
  reason:
    | 'not_text'
    | 'not_apply_intent'
    | 'bypassed_session'
    | 'duplicate_message'
    | 'screening_handled'
    | 'screening_cancelled';
}

interface JobRow {
  id: string;
  title: string | null;
  description: string | null;
  recruiter_id: string;
  published: boolean;
  approval_status: string | null;
  closes_at: string | null;
}

interface DbErrorLike {
  code?: string;
  message?: string;
}

export interface AiSummaryGenerationResult {
  ok: boolean;
  status: 'completed' | 'failed' | 'skipped';
  reason?: string;
}

export interface NotificationRetryResult {
  selected: number;
  sent: number;
  failed: number;
  skipped: number;
  details: Array<{
    notificationId: string;
    channel: 'dashboard' | 'email' | 'whatsapp';
    status: 'sent' | 'failed' | 'skipped';
    reason?: string;
  }>;
}

const screeningDb = createServiceSupabaseClient();
const UUID_REGEX =
  /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
const ACTIVE_SCREENING_IDLE_TIMEOUT_MINUTES = Number(
  process.env.WA_SCREENING_IDLE_TIMEOUT_MINUTES || '45'
);

function nowIso(): string {
  return new Date().toISOString();
}

function dayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '');
}

function maskPhone(value: string): string {
  const digits = normalizeDigits(value);
  if (digits.length <= 4) return `***${digits}`;
  return `***${digits.slice(-4)}`;
}

function safeTextPreview(value: string | null, max = 80): string | null {
  if (!value) return null;
  const compact = value.replace(/\s+/g, ' ').trim();
  if (!compact) return null;
  return compact.length <= max ? compact : `${compact.slice(0, max)}...`;
}

function normalizeShortText(value: string | null | undefined): string {
  return (value || '').trim().toLowerCase();
}

function isEscapeToMenuIntent(textBody: string): boolean {
  const value = normalizeShortText(textBody);
  return ['menu', 'help', 'aide', 'start', 'hi', 'hello', 'bonjour', 'salut', '++'].includes(value);
}

function getSessionLastActivityIso(session: ScreeningSessionRow): string | null {
  return session.last_inbound_at || session.updated_at || session.started_at || null;
}

function getSessionIdleMinutes(session: ScreeningSessionRow): number | null {
  const lastActivityIso = getSessionLastActivityIso(session);
  if (!lastActivityIso) return null;
  const parsed = Date.parse(lastActivityIso);
  if (Number.isNaN(parsed)) return null;
  return Math.max(0, (Date.now() - parsed) / 60000);
}

function isMissingColumnError(error: DbErrorLike | null | undefined): boolean {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return error.code === '42703' || (message.includes('column') && message.includes('does not exist'));
}

function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : 'unknown_error';
  return raw.length <= 180 ? raw : `${raw.slice(0, 177)}...`;
}

function sanitizeTextArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 5);
}

function logEvent(level: 'info' | 'warn' | 'error', event: string, data: Record<string, unknown>): void {
  const payload = {
    scope: 'wa-screening',
    event,
    timestamp: nowIso(),
    ...data,
  };

  if (level === 'error') {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === 'warn') {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

async function recordSystemEvent(
  sessionId: string,
  eventType: string,
  payload: Record<string, unknown>
): Promise<void> {
  const { error } = await screeningDb.from('wa_screening_events').insert({
    session_id: sessionId,
    direction: 'system',
    event_type: eventType,
    payload,
  });

  if (error) {
    logEvent('warn', 'record_system_event_failed', {
      sessionId,
      eventType,
      error: error.message,
    });
  }
}

async function updateAiSessionFields(
  sessionId: string,
  updates: Record<string, unknown>
): Promise<'ok' | 'missing_columns' | 'error'> {
  const { error } = await screeningDb
    .from('wa_screening_sessions')
    .update({
      ...updates,
      updated_at: nowIso(),
    })
    .eq('id', sessionId);

  if (!error) return 'ok';
  if (isMissingColumnError(error as DbErrorLike)) {
    logEvent('warn', 'ai_columns_missing', {
      sessionId,
      error: (error as DbErrorLike).message || 'missing_ai_column',
    });
    return 'missing_columns';
  }

  logEvent('warn', 'update_ai_session_fields_failed', {
    sessionId,
    error: error.message,
  });
  return 'error';
}

function t(lang: SupportedLanguage, en: string, fr: string): string {
  return lang === 'fr' ? fr : en;
}

function languagePrompt(): string {
  return [
    'Welcome to JobLinca WhatsApp Applications.',
    'Select language:',
    '1 = English',
    '2 = Francais',
    '',
    'Bienvenue sur JobLinca WhatsApp.',
    'Choisissez la langue :',
    '1 = English',
    '2 = Francais',
  ].join('\n');
}

function jobReferencePrompt(lang: SupportedLanguage): string {
  return t(
    lang,
    'Send APPLY <jobId> to continue.\nExample: APPLY 123e4567-e89b-12d3-a456-426614174000',
    'Envoyez APPLY <jobId> pour continuer.\nExemple : APPLY 123e4567-e89b-12d3-a456-426614174000'
  );
}

function consentPrompt(lang: SupportedLanguage, jobTitle: string): string {
  return t(
    lang,
    `You are applying for "${jobTitle}". Reply YES to begin screening or NO to cancel.`,
    `Vous postulez pour "${jobTitle}". Repondez OUI pour commencer ou NON pour annuler.`
  );
}

function quotaPrompt(lang: SupportedLanguage, limit: number): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com';
  return t(
    lang,
    `WhatsApp daily limit reached (${limit}/day). You can still apply on the website: ${appUrl}/jobs or upgrade your plan.`,
    `Limite WhatsApp atteinte (${limit}/jour). Vous pouvez postuler sur le site : ${appUrl}/jobs ou passer a une offre payante.`
  );
}

function questionPrompt(lang: SupportedLanguage, question: ScreeningQuestion, index: number, total: number): string {
  const title = t(lang, `Question ${index}/${total}`, `Question ${index}/${total}`);
  const prompt = lang === 'fr' ? question.promptFr : question.promptEn;
  const options = question.options?.length ? `\nOptions: ${question.options.join('/')}` : '';
  return `${title}\n${prompt}${options}`;
}

function completionPrompt(
  lang: SupportedLanguage,
  mustHavePassed: boolean,
  weightedScore: number,
  resultLabel: 'qualified' | 'review' | 'reject'
): string {
  if (lang === 'fr') {
    return [
      'Merci. Votre preselection WhatsApp est terminee.',
      `Resultat: ${resultLabel}`,
      `Score: ${weightedScore}/100`,
      `Critiques obligatoires: ${mustHavePassed ? 'OK' : 'NON'}`,
      'Votre recruteur a ete notifie.',
    ].join('\n');
  }

  return [
    'Thank you. Your WhatsApp screening is complete.',
    `Result: ${resultLabel}`,
    `Score: ${weightedScore}/100`,
    `Must-have checks: ${mustHavePassed ? 'PASS' : 'FAIL'}`,
    'The recruiter has been notified.',
  ].join('\n');
}

function validationPrompt(lang: SupportedLanguage, fallbackEn: string, fallbackFr: string): string {
  return t(lang, fallbackEn, fallbackFr);
}

function cancelledPrompt(lang: SupportedLanguage): string {
  return t(
    lang,
    'Your WhatsApp screening was cancelled. Send APPLY <jobId> to start again.',
    'Votre preselection WhatsApp est annulee. Envoyez APPLY <jobId> pour recommencer.'
  );
}

async function sendSafeWhatsappMessage(to: string, message: string): Promise<void> {
  try {
    await sendWhatsappMessage(to, message);
  } catch (error) {
    logEvent('warn', 'send_message_failed', {
      phone: maskPhone(to),
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

function extractJobId(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = value.match(UUID_REGEX);
  return match ? match[0].toLowerCase() : null;
}

async function resolveJobIdFromContext(contextMessageId: string | undefined): Promise<string | null> {
  if (!contextMessageId) return null;

  const { data, error } = await screeningDb
    .from('whatsapp_logs')
    .select('message, raw_payload')
    .eq('wa_message_id', contextMessageId)
    .maybeSingle();

  if (error || !data) return null;

  const messageJobId = extractJobId(data.message as string | null);
  if (messageJobId) return messageJobId;

  const payload = data.raw_payload as Record<string, unknown> | null;
  if (!payload) return null;

  const payloadCandidates = [
    payload.job_id,
    payload.jobId,
    payload.source_url,
  ];

  for (const candidate of payloadCandidates) {
    if (typeof candidate === 'string') {
      const extracted = extractJobId(candidate);
      if (extracted) return extracted;
    }
  }

  return null;
}

async function findLatestSession(conversationId: string): Promise<ScreeningSessionRow | null> {
  const { data, error } = await screeningDb
    .from('wa_screening_sessions')
    .select('*')
    .eq('wa_conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logEvent('warn', 'find_latest_session_failed', { conversationId, error: error.message });
    return null;
  }
  return (data as ScreeningSessionRow) ?? null;
}

async function findDuplicateInbound(messageId: string): Promise<boolean> {
  if (!messageId) return false;

  const { data, error } = await screeningDb
    .from('wa_screening_events')
    .select('id')
    .eq('wa_message_id', messageId)
    .eq('direction', 'inbound')
    .maybeSingle();

  if (error) return false;
  return Boolean(data?.id);
}

async function recordInboundEvent(sessionId: string, message: WAInboundMessage, textBody: string | null): Promise<void> {
  try {
    await screeningDb.from('wa_screening_events').insert({
      session_id: sessionId,
      wa_message_id: message.id,
      direction: 'inbound',
      event_type: 'inbound_received',
      message_text: safeTextPreview(textBody),
      payload: {
        type: message.type,
        timestamp: message.timestamp,
      },
    });
  } catch (error) {
    const code = (error as { code?: string })?.code;
    if (code === '23505') {
      return;
    }
    logEvent('warn', 'record_inbound_event_failed', {
      sessionId,
      waMessageId: message.id,
    });
  }
}

async function updateSession(
  sessionId: string,
  updates: Record<string, unknown>
): Promise<ScreeningSessionRow | null> {
  const payload = {
    ...updates,
    updated_at: nowIso(),
  };

  const { data, error } = await screeningDb
    .from('wa_screening_sessions')
    .update(payload)
    .eq('id', sessionId)
    .select('*')
    .single();

  if (error) {
    logEvent('error', 'update_session_failed', {
      sessionId,
      error: error.message,
    });
    return null;
  }

  return data as ScreeningSessionRow;
}

async function updateSessionFromState(
  sessionId: string,
  expectedState: ScreeningState,
  updates: Record<string, unknown>
): Promise<ScreeningSessionRow | null> {
  const payload = {
    ...updates,
    updated_at: nowIso(),
  };

  const { data, error } = await screeningDb
    .from('wa_screening_sessions')
    .update(payload)
    .eq('id', sessionId)
    .eq('state', expectedState)
    .select('*')
    .maybeSingle();

  if (!error && data) {
    return data as ScreeningSessionRow;
  }

  if (error) {
    logEvent('warn', 'update_session_from_state_failed', {
      sessionId,
      expectedState,
      error: error.message,
    });
  }

  return null;
}

async function insertSession(payload: Record<string, unknown>): Promise<ScreeningSessionRow | null> {
  const { data, error } = await screeningDb
    .from('wa_screening_sessions')
    .insert(payload)
    .select('*')
    .single();

  if (error) {
    logEvent('error', 'insert_session_failed', { error: error.message });
    return null;
  }

  return data as ScreeningSessionRow;
}

async function resolveUserIdByPhone(
  waPhone: string,
  existingUserId: string | null
): Promise<string | null> {
  if (existingUserId) return existingUserId;

  const e164 = toE164(waPhone);
  const resolved = await resolveProfileIdByPhone(screeningDb, e164);
  if (!resolved) return null;

  await linkConversationToUser(e164, resolved).catch(() => {});
  return resolved;
}

async function getJob(jobId: string): Promise<JobRow | null> {
  const { data, error } = await screeningDb
    .from('jobs')
    .select('id, title, description, recruiter_id, published, approval_status, closes_at')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const isApproved = data.approval_status === 'approved' || data.approval_status === null;
  const notClosed = !data.closes_at || new Date(data.closes_at) > new Date();
  if (!data.published || !isApproved || !notClosed) {
    return null;
  }

  return data as JobRow;
}

async function getJobForSummary(jobId: string): Promise<Pick<JobRow, 'title' | 'description'> | null> {
  const { data, error } = await screeningDb
    .from('jobs')
    .select('title, description')
    .eq('id', jobId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Pick<JobRow, 'title' | 'description'>;
}

async function loadAnswersForSummary(sessionId: string): Promise<SummaryAnswerRow[]> {
  const { data, error } = await screeningDb
    .from('wa_screening_answers')
    .select('question_text, answer_text, is_must_have, score_delta')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error || !data) return [];
  return data as SummaryAnswerRow[];
}

function buildAiFollowUpQuestion(questionText: string): ScreeningQuestion {
  return {
    id: 'ai_followup',
    type: 'text',
    required: false,
    mustHave: false,
    weight: 0,
    promptEn: questionText,
    promptFr: questionText,
  };
}

async function buildQuestionCatalogWithOptionalAiFollowUp(
  language: SupportedLanguage,
  jobTitle: string,
  jobDescription: string | null
): Promise<{
  catalog: ScreeningQuestion[];
  aiFollowUpQuestion: string | null;
}> {
  const catalog = buildHybridQuestionCatalog(jobTitle);
  if (!isAiFollowUpEnabled()) {
    return {
      catalog,
      aiFollowUpQuestion: null,
    };
  }

  try {
    const aiQuestion = await generateOptionalFollowUpQuestion({
      language,
      jobTitle,
      jobDescription: jobDescription || '',
    });

    if (!aiQuestion) {
      return {
        catalog,
        aiFollowUpQuestion: null,
      };
    }

    return {
      catalog: [...catalog, buildAiFollowUpQuestion(aiQuestion)],
      aiFollowUpQuestion: aiQuestion,
    };
  } catch (error) {
    logEvent('warn', 'ai_followup_generation_failed', {
      jobTitle,
      language,
      error: sanitizeErrorMessage(error),
    });
    return {
      catalog,
      aiFollowUpQuestion: null,
    };
  }
}

async function getDailyLimit(userId: string | null): Promise<number> {
  if (!userId) return 1;

  const { data, error } = await screeningDb.rpc('wa_user_daily_apply_limit', {
    p_user_id: userId,
  });

  if (!error && typeof data === 'number') {
    return data;
  }

  try {
    const subscription = await getUserSubscription(userId);
    return subscription.isActive ? 10 : 1;
  } catch {
    return 1;
  }
}

async function getDailyCount(userId: string | null, waPhone: string): Promise<number> {
  const { data, error } = await screeningDb.rpc('wa_user_daily_apply_count', {
    p_user_id: userId,
    p_wa_phone: toE164(waPhone),
  });

  if (!error && typeof data === 'number') {
    return data;
  }

  const today = dayUtc();
  let query = screeningDb
    .from('wa_screening_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('session_day', today)
    .eq('state', 'completed');

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('wa_phone', toE164(waPhone)).is('user_id', null);
  }

  const fallback = await query;
  return fallback.count ?? 0;
}

async function upsertAnswer(
  sessionId: string,
  question: ScreeningQuestion,
  rawAnswer: string,
  evaluation: AnswerEvaluation
): Promise<void> {
  await screeningDb.from('wa_screening_answers').upsert(
    {
      session_id: sessionId,
      question_key: question.id,
      question_text: question.promptEn,
      answer_text: rawAnswer.trim(),
      normalized_answer: evaluation.normalizedAnswer,
      is_required: question.required,
      is_must_have: question.mustHave,
      must_have_passed: evaluation.mustHavePassed,
      score_delta: evaluation.scoreDelta,
    },
    {
      onConflict: 'session_id,question_key',
      ignoreDuplicates: false,
    }
  );
}

async function loadAnswerEvaluations(sessionId: string): Promise<Array<{ questionId: string; evaluation: AnswerEvaluation }>> {
  const { data, error } = await screeningDb
    .from('wa_screening_answers')
    .select('question_key, score_delta, must_have_passed')
    .eq('session_id', sessionId);

  if (error || !data) return [];

  return (data as ScreeningAnswerRow[]).map((row) => ({
    questionId: row.question_key,
    evaluation: {
      accepted: true,
      normalizedAnswer: null,
      scoreDelta: row.score_delta,
      mustHavePassed: row.must_have_passed,
    },
  }));
}

async function queueRecruiterNotifications(
  session: ScreeningSessionRow,
  resultLabel: 'qualified' | 'review' | 'reject',
  weightedScore: number
): Promise<void> {
  if (!session.recruiter_id) return;

  const { data: recruiterProfile } = await screeningDb
    .from('recruiter_profiles')
    .select('contact_email, contact_phone')
    .eq('user_id', session.recruiter_id)
    .maybeSingle();

  const dashboardPayload = {
    sessionId: session.id,
    resultLabel,
    weightedScore,
    state: session.state,
  };

  const rows = [
    {
      session_id: session.id,
      recruiter_id: session.recruiter_id,
      channel: 'dashboard',
      destination: session.recruiter_id,
      status: 'sent',
      sent_at: nowIso(),
      payload: dashboardPayload,
    },
    {
      session_id: session.id,
      recruiter_id: session.recruiter_id,
      channel: 'email',
      destination: recruiterProfile?.contact_email ?? null,
      status: recruiterProfile?.contact_email ? 'pending' : 'skipped',
      last_error: recruiterProfile?.contact_email ? null : 'missing_contact_email',
      payload: dashboardPayload,
    },
    {
      session_id: session.id,
      recruiter_id: session.recruiter_id,
      channel: 'whatsapp',
      destination: recruiterProfile?.contact_phone ?? null,
      status: recruiterProfile?.contact_phone ? 'pending' : 'skipped',
      last_error: recruiterProfile?.contact_phone ? null : 'missing_contact_phone',
      payload: dashboardPayload,
    },
  ];

  const { error } = await screeningDb.from('wa_screening_notifications').upsert(rows, {
    onConflict: 'session_id,channel',
    ignoreDuplicates: false,
  });

  if (error) {
    logEvent('warn', 'queue_recruiter_notifications_failed', {
      sessionId: session.id,
      error: error.message,
    });
  }
}

async function findSessionById(sessionId: string): Promise<ScreeningSessionRow | null> {
  const { data, error } = await screeningDb
    .from('wa_screening_sessions')
    .select('*')
    .eq('id', sessionId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ScreeningSessionRow;
}

async function generateAiSummaryForSession(
  sessionId: string,
  trigger: 'auto' | 'manual'
): Promise<AiSummaryGenerationResult> {
  if (!isAiSummaryEnabled()) {
    await updateAiSessionFields(sessionId, {
      ai_summary_status: 'skipped',
      ai_error: 'openai_not_configured',
    });
    return {
      ok: false,
      status: 'skipped',
      reason: 'openai_not_configured',
    };
  }

  const session = await findSessionById(sessionId);
  if (!session) {
    return {
      ok: false,
      status: 'failed',
      reason: 'session_not_found',
    };
  }

  if (session.state !== 'completed') {
    await updateAiSessionFields(sessionId, {
      ai_summary_status: 'skipped',
      ai_error: 'session_not_completed',
    });
    return {
      ok: false,
      status: 'skipped',
      reason: 'session_not_completed',
    };
  }

  if (!session.job_id || session.weighted_score === null || session.must_have_passed === null || !session.result_label) {
    await updateAiSessionFields(sessionId, {
      ai_summary_status: 'skipped',
      ai_error: 'missing_scoring_or_job_data',
    });
    return {
      ok: false,
      status: 'skipped',
      reason: 'missing_scoring_or_job_data',
    };
  }

  const processingUpdate = await updateAiSessionFields(sessionId, {
    ai_summary_status: 'processing',
    ai_error: null,
  });
  if (processingUpdate === 'missing_columns') {
    return {
      ok: false,
      status: 'skipped',
      reason: 'ai_columns_unavailable',
    };
  }
  if (processingUpdate === 'error') {
    return {
      ok: false,
      status: 'failed',
      reason: 'failed_to_mark_processing',
    };
  }

  const job = await getJobForSummary(session.job_id);
  if (!job) {
    await updateAiSessionFields(sessionId, {
      ai_summary_status: 'failed',
      ai_error: 'job_not_found',
    });
    return {
      ok: false,
      status: 'failed',
      reason: 'job_not_found',
    };
  }

  const answers = await loadAnswersForSummary(sessionId);
  if (answers.length === 0) {
    await updateAiSessionFields(sessionId, {
      ai_summary_status: 'skipped',
      ai_error: 'no_answers',
    });
    return {
      ok: false,
      status: 'skipped',
      reason: 'no_answers',
    };
  }

  try {
    const summary = await generateRecruiterSummary({
      language: session.language_code,
      jobTitle: job.title || 'Job',
      jobDescription: job.description || '',
      weightedScore: session.weighted_score,
      mustHavePassed: session.must_have_passed,
      resultLabel: session.result_label,
      answers: answers.map((answer) => ({
        question: answer.question_text,
        answer: answer.answer_text,
        isMustHave: answer.is_must_have,
        scoreDelta: answer.score_delta,
      })),
    });

    if (!summary) {
      await updateAiSessionFields(sessionId, {
        ai_summary_status: 'skipped',
        ai_error: 'ai_summary_unavailable',
      });
      return {
        ok: false,
        status: 'skipped',
        reason: 'ai_summary_unavailable',
      };
    }

    const completionUpdate = await updateAiSessionFields(sessionId, {
      ai_summary_status: 'completed',
      ai_summary_text: summary.summary,
      ai_recommendation: summary.recommendation,
      ai_key_strengths: sanitizeTextArray(summary.strengths),
      ai_key_risks: sanitizeTextArray(summary.risks),
      ai_model: summary.model,
      ai_tokens_used: summary.tokensUsed,
      ai_error: null,
      ai_last_generated_at: nowIso(),
    });

    if (completionUpdate === 'missing_columns') {
      return {
        ok: false,
        status: 'skipped',
        reason: 'ai_columns_unavailable',
      };
    }
    if (completionUpdate === 'error') {
      return {
        ok: false,
        status: 'failed',
        reason: 'failed_to_store_ai_summary',
      };
    }

    await recordSystemEvent(sessionId, 'ai_summary_generated', {
      trigger,
      model: summary.model,
      tokensUsed: summary.tokensUsed,
    });

    return {
      ok: true,
      status: 'completed',
    };
  } catch (error) {
    const errorMessage = sanitizeErrorMessage(error);
    const statusUpdate = await updateAiSessionFields(sessionId, {
      ai_summary_status: 'failed',
      ai_error: errorMessage,
    });

    await recordSystemEvent(sessionId, 'ai_summary_failed', {
      trigger,
      error: errorMessage,
    });

    if (statusUpdate === 'missing_columns') {
      return {
        ok: false,
        status: 'skipped',
        reason: 'ai_columns_unavailable',
      };
    }

    return {
      ok: false,
      status: 'failed',
      reason: errorMessage,
    };
  }
}

function queueAiSummaryGeneration(sessionId: string): void {
  if (!isAiSummaryEnabled()) {
    return;
  }

  void generateAiSummaryForSession(sessionId, 'auto').catch((error) => {
    logEvent('warn', 'queue_ai_summary_generation_failed', {
      sessionId,
      error: sanitizeErrorMessage(error),
    });
  });
}

export async function regenerateWhatsAppAiSummary(sessionId: string): Promise<AiSummaryGenerationResult> {
  return generateAiSummaryForSession(sessionId, 'manual');
}

function buildRecruiterNotificationMessage(notification: ScreeningNotificationRow): string {
  const session = notification.wa_screening_sessions;
  const jobTitle = session?.jobs?.title || 'the job';
  const result = (session?.result_label || 'review').toUpperCase();
  const score =
    typeof session?.weighted_score === 'number' ? `, score ${session.weighted_score}/100` : '';

  return `JobLinca screening update: candidate result for "${jobTitle}" is ${result}${score}. Check your recruiter dashboard for details.`;
}

async function setNotificationStatus(
  notificationId: string,
  status: 'pending' | 'sent' | 'failed' | 'skipped',
  updates: Record<string, unknown> = {}
): Promise<void> {
  const payload = {
    status,
    ...updates,
    updated_at: nowIso(),
  };

  const { error } = await screeningDb
    .from('wa_screening_notifications')
    .update(payload)
    .eq('id', notificationId);

  if (error) {
    logEvent('warn', 'set_notification_status_failed', {
      notificationId,
      status,
      error: error.message,
    });
  }
}

async function claimNotificationAttempt(
  notification: ScreeningNotificationRow
): Promise<ScreeningNotificationRow | null> {
  const { data, error } = await screeningDb
    .from('wa_screening_notifications')
    .update({
      attempt_count: notification.attempt_count + 1,
      updated_at: nowIso(),
      last_error: null,
    })
    .eq('id', notification.id)
    .in('status', ['pending', 'failed'])
    .eq('attempt_count', notification.attempt_count)
    .select(
      `
      id,
      session_id,
      recruiter_id,
      channel,
      destination,
      status,
      attempt_count,
      last_error,
      wa_screening_sessions:session_id (
        id,
        wa_phone,
        result_label,
        weighted_score,
        jobs:job_id (
          title
        )
      )
    `
    )
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  const row = data as Record<string, any>;
  const nestedSession = row.wa_screening_sessions as Record<string, any> | null;
  const nestedJobs = nestedSession?.jobs;
  const normalizedJob = Array.isArray(nestedJobs) ? nestedJobs[0] || null : nestedJobs || null;

  return {
    ...(row as any),
    wa_screening_sessions: nestedSession
      ? {
          ...(nestedSession as any),
          jobs: normalizedJob,
        }
      : null,
  } as ScreeningNotificationRow;
}

export async function processPendingWhatsAppScreeningNotifications(
  options: { limit?: number; maxAttempts?: number } = {}
): Promise<NotificationRetryResult> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const maxAttempts = Math.max(1, Math.min(10, options.maxAttempts ?? 5));

  const result: NotificationRetryResult = {
    selected: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    details: [],
  };

  const { data, error } = await screeningDb
    .from('wa_screening_notifications')
    .select(
      `
      id,
      session_id,
      recruiter_id,
      channel,
      destination,
      status,
      attempt_count,
      last_error,
      wa_screening_sessions:session_id (
        id,
        wa_phone,
        result_label,
        weighted_score,
        jobs:job_id (
          title
        )
      )
    `
    )
    .in('status', ['pending', 'failed'])
    .lt('attempt_count', maxAttempts)
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logEvent('warn', 'fetch_pending_notifications_failed', {
      error: error.message,
      limit,
      maxAttempts,
    });
    return result;
  }

  const notifications = (data || []).map((row: any) => ({
    ...row,
    wa_screening_sessions: row.wa_screening_sessions
      ? {
          ...row.wa_screening_sessions,
          jobs: Array.isArray(row.wa_screening_sessions.jobs)
            ? row.wa_screening_sessions.jobs[0] || null
            : row.wa_screening_sessions.jobs || null,
        }
      : null,
  })) as ScreeningNotificationRow[];

  result.selected = notifications.length;

  for (const notification of notifications) {
    const claimed = await claimNotificationAttempt(notification);
    if (!claimed) {
      result.skipped += 1;
      result.details.push({
        notificationId: notification.id,
        channel: notification.channel,
        status: 'skipped',
        reason: 'already_claimed_or_status_changed',
      });
      continue;
    }

    if (claimed.channel === 'dashboard') {
      await setNotificationStatus(claimed.id, 'sent', {
        sent_at: nowIso(),
      });
      result.sent += 1;
      result.details.push({
        notificationId: claimed.id,
        channel: claimed.channel,
        status: 'sent',
      });
      continue;
    }

    if (claimed.channel === 'email') {
      await setNotificationStatus(claimed.id, 'skipped', {
        last_error: 'email_channel_not_implemented',
      });
      result.skipped += 1;
      result.details.push({
        notificationId: claimed.id,
        channel: claimed.channel,
        status: 'skipped',
        reason: 'email_channel_not_implemented',
      });
      continue;
    }

    if (!claimed.destination) {
      await setNotificationStatus(claimed.id, 'skipped', {
        last_error: 'missing_destination',
      });
      result.skipped += 1;
      result.details.push({
        notificationId: claimed.id,
        channel: claimed.channel,
        status: 'skipped',
        reason: 'missing_destination',
      });
      continue;
    }

    try {
      await sendWhatsappMessage(claimed.destination, buildRecruiterNotificationMessage(claimed));
      await setNotificationStatus(claimed.id, 'sent', {
        sent_at: nowIso(),
      });
      result.sent += 1;
      result.details.push({
        notificationId: claimed.id,
        channel: claimed.channel,
        status: 'sent',
      });
    } catch (error) {
      const message = sanitizeErrorMessage(error);
      await setNotificationStatus(claimed.id, 'failed', {
        last_error: message,
      });
      result.failed += 1;
      result.details.push({
        notificationId: claimed.id,
        channel: claimed.channel,
        status: 'failed',
        reason: message,
      });
    }
  }

  return result;
}

async function createSessionForIntent(
  input: InboundScreeningInput,
  entrySource: 'reply' | 'apply_command' | 'shortlink' | 'unknown'
): Promise<ScreeningSessionRow | null> {
  const resolvedPhone = toE164(input.waPhone);
  const userId = await resolveUserIdByPhone(resolvedPhone, input.conversationUserId);

  const session = await insertSession({
    wa_conversation_id: input.conversationId,
    wa_phone: resolvedPhone,
    user_id: userId,
    entry_source: entrySource,
    state: 'awaiting_language',
    language_code: 'en',
    started_at: nowIso(),
    session_day: dayUtc(),
    last_inbound_message_id: input.message.id,
    last_inbound_at: nowIso(),
  });

  if (!session) return null;

  await recordInboundEvent(session.id, input.message, input.textBody);
  return session;
}

async function processAwaitingLanguage(session: ScreeningSessionRow, input: InboundScreeningInput): Promise<void> {
  const selectedLanguage = parseLanguageSelection(input.textBody ?? '');
  if (!selectedLanguage) {
    await sendSafeWhatsappMessage(session.wa_phone, languagePrompt());
    return;
  }

  const updated = await updateSession(session.id, {
    language_code: selectedLanguage,
    state: 'awaiting_job_reference',
    last_inbound_message_id: input.message.id,
    last_inbound_at: nowIso(),
  });

  if (!updated) return;
  await sendSafeWhatsappMessage(updated.wa_phone, jobReferencePrompt(selectedLanguage));
}

async function processAwaitingJobReference(session: ScreeningSessionRow, input: InboundScreeningInput): Promise<void> {
  const intent = parseApplyIntent(
    input.textBody ?? '',
    input.message.referral?.source_url ?? null,
    Boolean(input.message.context?.id)
  );
  const lang = session.language_code;

  const contextJobId = await resolveJobIdFromContext(input.message.context?.id);
  const resolvedJobId = intent.jobId ?? contextJobId;

  if (!resolvedJobId) {
    await sendSafeWhatsappMessage(session.wa_phone, jobReferencePrompt(lang));
    return;
  }

  const job = await getJob(resolvedJobId);
  if (!job) {
    await sendSafeWhatsappMessage(
      session.wa_phone,
      t(
        lang,
        'Job not found or not accepting applications. Please send a valid APPLY <jobId>.',
        'Offre introuvable ou non disponible. Envoyez un APPLY <jobId> valide.'
      )
    );
    return;
  }

  const resolvedUserId = await resolveUserIdByPhone(session.wa_phone, session.user_id);
  const dailyLimit = await getDailyLimit(resolvedUserId);
  const dailyCount = await getDailyCount(resolvedUserId, session.wa_phone);

  if (dailyCount >= dailyLimit) {
    await updateSession(session.id, {
      user_id: resolvedUserId,
      job_id: job.id,
      recruiter_id: job.recruiter_id,
      state: 'quota_blocked',
      daily_limit: dailyLimit,
      last_inbound_message_id: input.message.id,
      last_inbound_at: nowIso(),
    });
    await sendSafeWhatsappMessage(session.wa_phone, quotaPrompt(lang, dailyLimit));
    return;
  }

  const updated = await updateSession(session.id, {
    user_id: resolvedUserId,
    job_id: job.id,
    recruiter_id: job.recruiter_id,
    entry_source: intent.entrySource,
    state: 'awaiting_consent',
    daily_limit: dailyLimit,
    last_inbound_message_id: input.message.id,
    last_inbound_at: nowIso(),
  });

  if (!updated) return;

  const prompt = consentPrompt(lang, job.title || 'Selected Job');
  await sendSafeWhatsappMessage(updated.wa_phone, prompt);
}

async function processAwaitingConsent(session: ScreeningSessionRow, input: InboundScreeningInput): Promise<void> {
  const lang = session.language_code;
  const consent = parseYesNo(input.textBody ?? '');
  if (consent === null) {
    await sendSafeWhatsappMessage(
      session.wa_phone,
      validationPrompt(
        lang,
        'Please reply YES to continue or NO to cancel.',
        'Veuillez repondre OUI pour continuer ou NON pour annuler.'
      )
    );
    return;
  }

  if (!consent) {
    await updateSession(session.id, {
      state: 'cancelled',
      cancelled_at: nowIso(),
      last_inbound_message_id: input.message.id,
      last_inbound_at: nowIso(),
    });
    await sendSafeWhatsappMessage(session.wa_phone, cancelledPrompt(lang));
    return;
  }

  const { data: jobData } = await screeningDb
    .from('jobs')
    .select('title, description')
    .eq('id', session.job_id)
    .maybeSingle();

  const { catalog, aiFollowUpQuestion } = await buildQuestionCatalogWithOptionalAiFollowUp(
    session.language_code,
    jobData?.title || 'Job',
    jobData?.description || null
  );
  const updated = await updateSession(session.id, {
    state: 'awaiting_question',
    question_catalog: catalog,
    total_questions: catalog.length,
    current_question_index: 0,
    last_inbound_message_id: input.message.id,
    last_inbound_at: nowIso(),
  });

  if (!updated) return;

  if (aiFollowUpQuestion) {
    void updateAiSessionFields(session.id, {
      ai_followup_generated: true,
      ai_followup_question: aiFollowUpQuestion,
    });
  }

  await sendSafeWhatsappMessage(
    updated.wa_phone,
    questionPrompt(updated.language_code, catalog[0], 1, catalog.length)
  );
}

async function processAwaitingQuestion(session: ScreeningSessionRow, input: InboundScreeningInput): Promise<void> {
  const lang = session.language_code;
  const catalog = Array.isArray(session.question_catalog) && session.question_catalog.length > 0
    ? session.question_catalog
    : buildHybridQuestionCatalog('Job');

  const index = session.current_question_index;
  const currentQuestion = catalog[index];

  if (!currentQuestion) {
    await updateSession(session.id, { state: 'completed', completed_at: nowIso() });
    return;
  }

  const evaluation = evaluateAnswer(currentQuestion, input.textBody ?? '');
  if (!evaluation.accepted) {
    await sendSafeWhatsappMessage(
      session.wa_phone,
      validationPrompt(
        lang,
        evaluation.validationMessageEn || 'Please send a valid answer.',
        evaluation.validationMessageFr || 'Veuillez envoyer une reponse valide.'
      )
    );
    return;
  }

  await upsertAnswer(session.id, currentQuestion, input.textBody ?? '', evaluation);

  const nextIndex = index + 1;
  if (nextIndex < catalog.length) {
    const updated = await updateSessionFromState(session.id, 'awaiting_question', {
      state: 'awaiting_question',
      current_question_index: nextIndex,
      total_questions: catalog.length,
      question_catalog: catalog,
      last_inbound_message_id: input.message.id,
      last_inbound_at: nowIso(),
    });

    if (!updated) return;
    await sendSafeWhatsappMessage(
      updated.wa_phone,
      questionPrompt(updated.language_code, catalog[nextIndex], nextIndex + 1, catalog.length)
    );
    return;
  }

  const evaluations = await loadAnswerEvaluations(session.id);
  const scoring = computeFinalScoring(catalog, evaluations);
  const dailyCount = await getDailyCount(session.user_id, session.wa_phone);

  const completed = await updateSessionFromState(session.id, 'awaiting_question', {
    state: 'completed',
    completed_at: nowIso(),
    weighted_score: scoring.weightedScore,
    must_have_passed: scoring.mustHavePassed,
    must_have_fail_reasons: scoring.mustHaveFailReasons,
    score_breakdown: scoring.scoreBreakdown,
    result_label: scoring.resultLabel,
    daily_count_at_completion: dailyCount + 1,
    last_inbound_message_id: input.message.id,
    last_inbound_at: nowIso(),
  });

  if (!completed) {
    logEvent('info', 'completion_already_processed_or_state_changed', {
      sessionId: session.id,
      waMessageId: input.message.id,
    });
    return;
  }

  if (isAiSummaryEnabled()) {
    void updateAiSessionFields(completed.id, {
      ai_summary_status: 'pending',
      ai_error: null,
    });
  } else {
    void updateAiSessionFields(completed.id, {
      ai_summary_status: 'skipped',
      ai_error: 'openai_not_configured',
    });
  }

  await queueRecruiterNotifications(completed, scoring.resultLabel, scoring.weightedScore);
  await sendSafeWhatsappMessage(
    completed.wa_phone,
    completionPrompt(
      completed.language_code,
      scoring.mustHavePassed,
      scoring.weightedScore,
      scoring.resultLabel
    )
  );

  queueAiSummaryGeneration(completed.id);
}

async function processSessionByState(session: ScreeningSessionRow, input: InboundScreeningInput): Promise<void> {
  if (session.state === 'awaiting_language') {
    await processAwaitingLanguage(session, input);
    return;
  }

  if (session.state === 'awaiting_job_reference') {
    await processAwaitingJobReference(session, input);
    return;
  }

  if (session.state === 'awaiting_consent') {
    await processAwaitingConsent(session, input);
    return;
  }

  if (session.state === 'awaiting_question') {
    await processAwaitingQuestion(session, input);
    return;
  }

  if (TERMINAL_STATES.has(session.state)) {
    const intent = parseApplyIntent(
      input.textBody ?? '',
      input.message.referral?.source_url ?? null,
      Boolean(input.message.context?.id)
    );
    if (intent.isApplyIntent) {
      const fresh = await createSessionForIntent(input, intent.entrySource);
      if (!fresh) return;
      await sendSafeWhatsappMessage(fresh.wa_phone, languagePrompt());
    }
  }
}

export async function handleWhatsAppScreeningInbound(
  input: InboundScreeningInput
): Promise<InboundScreeningResult> {
  const textBody = input.textBody?.trim() ?? null;
  if (!textBody) {
    return { handled: false, reason: 'not_text' };
  }

  const applyIntent = parseApplyIntent(
    textBody,
    input.message.referral?.source_url ?? null,
    Boolean(input.message.context?.id)
  );

  if (await findDuplicateInbound(input.message.id)) {
    logEvent('info', 'duplicate_inbound', {
      waMessageId: input.message.id,
      phone: maskPhone(input.waPhone),
    });
    return { handled: true, reason: 'duplicate_message' };
  }

  const latestSession = await findLatestSession(input.conversationId);

  if (latestSession && !TERMINAL_STATES.has(latestSession.state)) {
    if (isEscapeToMenuIntent(textBody)) {
      await recordInboundEvent(latestSession.id, input.message, textBody);
      await updateSession(latestSession.id, {
        state: 'cancelled',
        cancelled_at: nowIso(),
        last_inbound_message_id: input.message.id,
        last_inbound_at: nowIso(),
      });
      logEvent('info', 'session_cancelled_for_menu_escape', {
        sessionId: latestSession.id,
        state: latestSession.state,
        phone: maskPhone(input.waPhone),
      });
      return { handled: false, reason: 'bypassed_session' };
    }

    const idleMinutes = getSessionIdleMinutes(latestSession);
    if (
      idleMinutes !== null &&
      idleMinutes > ACTIVE_SCREENING_IDLE_TIMEOUT_MINUTES &&
      !applyIntent.isApplyIntent &&
      !isCancelIntent(textBody)
    ) {
      logEvent('info', 'stale_active_session_bypassed', {
        sessionId: latestSession.id,
        state: latestSession.state,
        idleMinutes: Math.round(idleMinutes),
        timeoutMinutes: ACTIVE_SCREENING_IDLE_TIMEOUT_MINUTES,
        waMessageId: input.message.id,
      });
      return { handled: false, reason: 'bypassed_session' };
    }
  }

  if (isCancelIntent(textBody) && latestSession && !TERMINAL_STATES.has(latestSession.state)) {
    await recordInboundEvent(latestSession.id, input.message, textBody);
    await updateSession(latestSession.id, {
      state: 'cancelled',
      cancelled_at: nowIso(),
      last_inbound_message_id: input.message.id,
      last_inbound_at: nowIso(),
    });
    await sendSafeWhatsappMessage(latestSession.wa_phone, cancelledPrompt(latestSession.language_code));
    return { handled: true, reason: 'screening_cancelled' };
  }

  if (!latestSession) {
    if (!applyIntent.isApplyIntent) {
      return { handled: false, reason: 'not_apply_intent' };
    }

    const session = await createSessionForIntent(input, applyIntent.entrySource);
    if (!session) {
      return { handled: true, reason: 'screening_handled' };
    }

    await sendSafeWhatsappMessage(session.wa_phone, languagePrompt());
    return { handled: true, reason: 'screening_handled' };
  }

  if (TERMINAL_STATES.has(latestSession.state)) {
    if (!applyIntent.isApplyIntent && !isCancelIntent(textBody)) {
      return { handled: false, reason: 'not_apply_intent' };
    }
  }

  await recordInboundEvent(latestSession.id, input.message, textBody);

  try {
    await processSessionByState(latestSession, input);
    return { handled: true, reason: 'screening_handled' };
  } catch (error) {
    logEvent('error', 'process_session_failed', {
      sessionId: latestSession.id,
      state: latestSession.state,
      waMessageId: input.message.id,
      phone: maskPhone(input.waPhone),
      textPreview: safeTextPreview(textBody),
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { handled: true, reason: 'screening_handled' };
  }
}
