/**
 * WhatsApp job-forward intake — turns the community into scouts.
 *
 * When someone forwards a job posting to the Joblinca WhatsApp number, we
 * detect it, store it as a raw post in the same table the Facebook Groups
 * pipeline processes, and thank the sender. The existing extraction cron
 * (scrape-source?source=facebook) then runs AI extraction, trust/scam
 * scoring, and the review/publish flow — identical to any other raw post.
 */

import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { storeFacebookRawPosts } from '@/lib/scrapers/facebook-pipeline';
import type { FacebookRawPost } from '@/lib/scrapers/providers/facebook';

/** Below this length a message is a chat/search query, not a forwarded posting */
const MIN_FORWARD_LENGTH = 180;

const JOB_SIGNALS = [
  // FR
  'recrute',
  'recrutement',
  'offre d\'emploi',
  'offre demploi',
  'avis de recrutement',
  'poste à pourvoir',
  'poste a pourvoir',
  'candidature',
  'date limite',
  'dossier de candidature',
  // EN
  'job vacancy',
  'vacancy announcement',
  'job opening',
  'we are hiring',
  'is hiring',
  'job offer',
  'applications should',
  'how to apply',
  'deadline for application',
];

const APPLY_SIGNALS = [
  'postul',
  'candidat',
  'apply',
  'cv',
  'deadline',
  'date limite',
  '@',
  'wa.me',
  'whatsapp',
];

/**
 * Heuristic: long message + job-announcement vocabulary + an application
 * channel. Deliberately conservative — a missed forward costs nothing (the
 * user gets the normal menu), a false positive hijacks a conversation.
 */
export function looksLikeForwardedJobPosting(text: string): boolean {
  if (!text || text.length < MIN_FORWARD_LENGTH) return false;
  const lower = text.toLowerCase();

  const hasJobSignal = JOB_SIGNALS.some((signal) => lower.includes(signal));
  if (!hasJobSignal) return false;

  return APPLY_SIGNALS.some((signal) => lower.includes(signal));
}

export interface ForwardIntakeResult {
  stored: boolean;
  duplicate: boolean;
}

/**
 * Store a forwarded posting as a pending raw post. The sender's number is
 * hashed, never stored — the forwarder is a scout, not a data subject.
 */
export async function storeForwardedJobPosting(
  text: string,
  senderPhoneE164: string
): Promise<ForwardIntakeResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return { stored: false, duplicate: false };
  }

  const supabase = createClient(url, key);

  const normalized = text.replace(/\s+/g, ' ').trim().toLowerCase();
  const contentHash = createHash('sha256').update(normalized).digest('hex').slice(0, 24);
  const senderHash = createHash('sha256').update(senderPhoneE164).digest('hex').slice(0, 12);

  const rawPost: FacebookRawPost = {
    // Content-hashed id: the same posting forwarded by many users dedupes to one row
    id: `whatsapp:${contentHash}`,
    text: text.trim().slice(0, 8000),
    timestamp: new Date().toISOString(),
    group_name: 'WhatsApp Forwards',
    author: `wa-scout-${senderHash}`,
  };

  const inserted = await storeFacebookRawPosts(supabase, [rawPost]);
  return { stored: true, duplicate: inserted === 0 };
}
