/**
 * Inbound WhatsApp handler for daily quiz drill replies (A/B/C/D).
 *
 * Only claims the message when:
 *   - the trimmed lowercase text is exactly a/b/c/d (with optional trailing
 *     punctuation like 'a.' or 'A!'); and
 *   - the sender's phone has an unanswered daily_drill_dispatches row in the
 *     last 24 hours.
 *
 * Returning { handled: false } lets the rest of the webhook chain run. We
 * deliberately keep the "is this a drill reply" check narrow so this doesn't
 * swallow legitimate ABC replies meant for the screening or job agent flows.
 */
import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { sendWhatsappMessage } from '@/lib/messaging/whatsapp';
import { recordPracticeAttempt } from '@/lib/skillup/practice';

const REPLY_LETTER_PATTERN = /^([a-d])[.!)\s]*$/i;
const DISPATCH_LOOKBACK_HOURS = 24;

export interface DrillInboundContext {
  textBody: string | null;
  waPhone: string;
}

export interface DrillInboundResult {
  handled: boolean;
}

interface DispatchRow {
  id: string;
  user_id: string;
  challenge_id: string;
  question_id: string;
  domain: string | null;
  options: string[];
  correct_index: number;
}

function parseLetter(text: string | null): number | null {
  if (!text) return null;
  const match = REPLY_LETTER_PATTERN.exec(text.trim());
  if (!match) return null;
  const letter = match[1].toLowerCase();
  return letter.charCodeAt(0) - 'a'.charCodeAt(0);
}

export async function handleDailyDrillReply(
  context: DrillInboundContext
): Promise<DrillInboundResult> {
  const answerIndex = parseLetter(context.textBody);
  if (answerIndex === null) return { handled: false };

  const db = createServiceSupabaseClient();
  const lookbackIso = new Date(
    Date.now() - DISPATCH_LOOKBACK_HOURS * 60 * 60 * 1000
  ).toISOString();

  const { data: dispatchRow, error: dispatchError } = await db
    .from('daily_drill_dispatches')
    .select('id, user_id, challenge_id, question_id, domain, options, correct_index')
    .eq('phone_e164', context.waPhone)
    .is('answered_at', null)
    .gte('dispatched_at', lookbackIso)
    .order('dispatched_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (dispatchError || !dispatchRow) {
    return { handled: false };
  }
  const dispatch = dispatchRow as DispatchRow;

  if (answerIndex >= dispatch.options.length) {
    await sendWhatsappMessage(
      context.waPhone,
      `That option doesn't exist for today's question. Please reply with A, B, C, or D.`
    );
    return { handled: true };
  }

  let attemptId: string | null = null;
  let wasCorrect = false;
  try {
    const recorded = await recordPracticeAttempt({
      userId: dispatch.user_id,
      challengeId: dispatch.challenge_id,
      questionId: dispatch.question_id,
      domain: dispatch.domain,
      answerIndex,
      correctIndex: dispatch.correct_index,
      source: 'daily_drill',
    });
    attemptId = recorded.attemptId;
    wasCorrect = recorded.wasCorrect;
  } catch {
    // Fall through: we still want to send a reply even if the attempt insert
    // race-collides. Marking the dispatch as answered prevents repeat handling.
    wasCorrect = answerIndex === dispatch.correct_index;
  }

  await db
    .from('daily_drill_dispatches')
    .update({
      answered_at: new Date().toISOString(),
      practice_attempt_id: attemptId,
    })
    .eq('id', dispatch.id);

  const correctLetter = String.fromCharCode(65 + dispatch.correct_index);
  const correctOption = dispatch.options[dispatch.correct_index];
  const replyBody = wasCorrect
    ? `Correct! The answer is ${correctLetter}: ${correctOption}.\n\nTomorrow's drill arrives at 07:00.`
    : `Not quite. The answer is ${correctLetter}: ${correctOption}.\n\nWe'll bring this question back soon for another shot.`;

  try {
    await sendWhatsappMessage(context.waPhone, replyBody, dispatch.user_id);
  } catch {
    // Outbound failure shouldn't unset handled — the attempt is already recorded.
  }

  return { handled: true };
}
