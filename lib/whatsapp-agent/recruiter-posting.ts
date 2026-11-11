/**
 * Job posting from WhatsApp, shared by the menu flow's 5-question recruiter
 * form and the conversational agent. Everything here returns a result instead
 * of messaging the user, so each caller words its own replies.
 *
 * Jobs created here are unpublished and pending review, exactly as the menu
 * flow always created them; the posting gate's LLM sweep picks them up.
 */

import { createServiceSupabaseClient } from '@/lib/supabase/service';
import { callAiText, isAiConfigured } from '@/lib/ai/client';
import { buildRecruiterDescriptionSystemPrompt } from '@/lib/ai/policies';
import { resolveJobLifecycleStatus } from '@/lib/jobs/lifecycle';
import { getUserSubscription } from '@/lib/subscriptions';

export const WA_RECRUITER_POSTING_FEE_XAF = Number(process.env.WA_RECRUITER_POSTING_FEE_XAF || '0');
const WA_RECRUITER_REQUIRE_SUBSCRIPTION = process.env.WA_RECRUITER_REQUIRE_SUBSCRIPTION !== '0';

/** Briefs shorter than this are expanded into a full description by AI. */
const EXPAND_BELOW_CHARS = 300;

export interface WhatsappJobDraft {
  jobTitle: string;
  location: string;
  /** Free text as the recruiter wrote it ("80k", "100 000 FCFA", "negotiable"). */
  salary: string;
  description: string;
  /** Free text: a URL, email, phone, "WhatsApp 6...", or "JobLinca". */
  applicationMethod: string;
}

export function parseSalary(raw: string): number | null {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return null;
  const value = Number(digits);
  if (Number.isNaN(value)) return null;
  return value;
}

export function detectApplyMethod(raw: string): {
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
    return { applyMethod: 'external_url', externalApplyUrl: urlMatch[0], applyEmail: null, applyPhone: null, applyWhatsapp: null };
  }
  if (emailMatch) {
    return { applyMethod: 'email', externalApplyUrl: null, applyEmail: emailMatch[0], applyPhone: null, applyWhatsapp: null };
  }
  if (lower.includes('whatsapp') && phoneDigits.length >= 8) {
    return { applyMethod: 'whatsapp', externalApplyUrl: null, applyEmail: null, applyPhone: null, applyWhatsapp: phoneDigits };
  }
  if (phoneDigits.length >= 8) {
    return { applyMethod: 'phone', externalApplyUrl: null, applyEmail: null, applyPhone: phoneDigits, applyWhatsapp: null };
  }
  return { applyMethod: 'joblinca', externalApplyUrl: null, applyEmail: null, applyPhone: null, applyWhatsapp: null };
}

export async function expandRecruiterDescriptionWithAi(input: {
  jobTitle: string;
  companyName: string | null;
  seedDescription: string;
}): Promise<string> {
  const seed = input.seedDescription.trim();
  if (!seed) return seed;
  if (!isAiConfigured()) return seed;

  try {
    const completionPromise = callAiText({
      temperature: 0.3,
      maxTokens: 700,
      timeoutMs: 8000,
      messages: [
        { role: 'system', content: buildRecruiterDescriptionSystemPrompt() },
        {
          role: 'user',
          content: [
            `Job title: ${input.jobTitle}`,
            `Company: ${input.companyName || 'Not specified'}`,
            `Recruiter short brief: ${seed}`,
            'Rewrite the brief into a practical markdown job description.',
          ].join('\n'),
        },
      ],
    });

    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000));
    const completion = await Promise.race([completionPromise, timeoutPromise]);
    if (!completion) return seed;

    const generated = completion.text?.trim();
    return generated || seed;
  } catch (error) {
    console.warn('[wa-recruiter-posting] description expansion failed', {
      error: error instanceof Error ? error.message : 'unknown_error',
    });
    return seed;
  }
}

export type PostingAccess =
  | { allowed: true; feeXaf: number }
  | { allowed: false; reason: 'missing_account' | 'not_recruiter' | 'missing_subscription' };

/** Who may post jobs from WhatsApp. Same rules the menu flow always applied. */
export async function checkRecruiterPostingAccess(
  linkedUserId: string | null,
  role: string | null
): Promise<PostingAccess> {
  if (!linkedUserId) return { allowed: false, reason: 'missing_account' };
  if (role !== 'recruiter' && role !== 'admin' && role !== 'staff') {
    return { allowed: false, reason: 'not_recruiter' };
  }
  if (role === 'admin' || role === 'staff' || !WA_RECRUITER_REQUIRE_SUBSCRIPTION) {
    return { allowed: true, feeXaf: 0 };
  }

  const subscription = await getUserSubscription(linkedUserId);
  if (!subscription.isActive || subscription.plan?.role !== 'recruiter') {
    return { allowed: false, reason: 'missing_subscription' };
  }
  return { allowed: true, feeXaf: WA_RECRUITER_POSTING_FEE_XAF };
}

export type CreateJobResult =
  | { status: 'created'; jobId: string; publicId: string | null }
  | { status: 'no_recruiter_profile' }
  | { status: 'error'; message: string };

/**
 * Create the job, unpublished and pending review. Short briefs are expanded
 * into a full description; a pasted full ad is kept as written.
 */
export async function createJobFromWhatsappDraft(
  userId: string,
  draft: WhatsappJobDraft
): Promise<CreateJobResult> {
  const db = createServiceSupabaseClient();
  const recruiterProfile = await db
    .from('recruiters')
    .select('id, company_name')
    .eq('id', userId)
    .maybeSingle();

  if (!recruiterProfile.data?.id) return { status: 'no_recruiter_profile' };

  const companyName = (recruiterProfile.data.company_name as string | null) || null;
  const applyMethod = detectApplyMethod(draft.applicationMethod);
  const description =
    draft.description.trim().length < EXPAND_BELOW_CHARS
      ? await expandRecruiterDescriptionWithAi({
          jobTitle: draft.jobTitle,
          companyName,
          seedDescription: draft.description,
        })
      : draft.description.trim();

  const { data: createdJob, error } = await db
    .from('jobs')
    .insert({
      recruiter_id: userId,
      posted_by: userId,
      posted_by_role: 'recruiter',
      title: draft.jobTitle,
      location: draft.location,
      salary: parseSalary(draft.salary),
      description: description || draft.description,
      company_name: companyName,
      published: false,
      approval_status: 'pending',
      lifecycle_status: resolveJobLifecycleStatus({
        published: false,
        approval_status: 'pending',
        closes_at: null,
        removed_at: null,
        archived_at: null,
        filled_at: null,
      }),
      apply_method: applyMethod.applyMethod,
      external_apply_url: applyMethod.externalApplyUrl,
      apply_email: applyMethod.applyEmail,
      apply_phone: applyMethod.applyPhone,
      apply_whatsapp: applyMethod.applyWhatsapp,
    })
    .select('id, public_id')
    .single();

  if (error || !createdJob) return { status: 'error', message: error?.message || 'insert returned no row' };
  return { status: 'created', jobId: createdJob.id as string, publicId: (createdJob.public_id as string | null) ?? null };
}
