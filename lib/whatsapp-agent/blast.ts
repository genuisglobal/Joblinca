import { createServiceSupabaseClient } from '@/lib/supabase/service';
import {
  sendWhatsappMessage,
  sendWhatsappTemplate,
} from '@/lib/messaging/whatsapp';
import type { WATemplateComponent } from '@/lib/whatsapp';

const blastDb = createServiceSupabaseClient();

export type BlastRole = 'job_seeker' | 'talent';

export interface BlastFilters {
  keywords?: string[];
  qualifications?: string[];
  locations?: string[];
  roles?: BlastRole[];
  seekerIds?: string[];
  requirePhone?: boolean;
}

export interface BlastRecipient {
  userId: string;
  phone: string;
  firstName: string | null;
  fullName: string | null;
  role: BlastRole | string;
  location: string | null;
}

export interface BlastSendResult {
  total: number;
  sent: number;
  failed: number;
  errors: Array<{ userId: string; phone: string; error: string }>;
}

function normaliseList(values: string[] | undefined): string[] {
  if (!values) return [];
  return values
    .map((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
    .filter(Boolean);
}

function haystackIncludesAny(haystack: string, needles: string[]): boolean {
  if (needles.length === 0) return true;
  return needles.some((needle) => haystack.includes(needle));
}

function stringifyUnknown(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return '';
  }
}

export async function findTargetSeekers(
  filters: BlastFilters
): Promise<BlastRecipient[]> {
  const roles: BlastRole[] =
    filters.roles && filters.roles.length > 0
      ? filters.roles
      : ['job_seeker', 'talent'];

  const keywords = normaliseList(filters.keywords);
  const qualifications = normaliseList(filters.qualifications);
  const locations = normaliseList(filters.locations);
  const seekerIds = (filters.seekerIds || []).filter(
    (id) => typeof id === 'string' && id.length > 0
  );

  let profileQuery = blastDb
    .from('profiles')
    .select(
      'id, first_name, last_name, full_name, phone, role, residence_location'
    )
    .in('role', roles);

  if (filters.requirePhone !== false) {
    profileQuery = profileQuery.not('phone', 'is', null);
  }

  if (seekerIds.length > 0) {
    profileQuery = profileQuery.in('id', seekerIds);
  }

  const { data: profiles, error: profilesError } = await profileQuery.limit(5000);
  if (profilesError) {
    throw new Error(`findTargetSeekers profiles: ${profilesError.message}`);
  }

  const userIds = (profiles || []).map((p) => p.id);
  if (userIds.length === 0) return [];

  const [jobSeekerRes, talentRes, resumeRes] = await Promise.all([
    blastDb
      .from('job_seeker_profiles')
      .select('user_id, headline, career_info, location, location_interests')
      .in('user_id', userIds),
    blastDb
      .from('talent_profiles')
      .select(
        'user_id, school_name, field_of_study, skills, location_interests'
      )
      .in('user_id', userIds),
    blastDb.from('resumes').select('user_id, data').in('user_id', userIds),
  ]);

  const jobSeekerByUser = new Map<string, any>();
  for (const row of jobSeekerRes.data || []) {
    jobSeekerByUser.set(row.user_id, row);
  }
  const talentByUser = new Map<string, any>();
  for (const row of talentRes.data || []) {
    talentByUser.set(row.user_id, row);
  }
  const resumeByUser = new Map<string, any>();
  for (const row of resumeRes.data || []) {
    resumeByUser.set(row.user_id, row);
  }

  const recipients: BlastRecipient[] = [];

  for (const profile of profiles || []) {
    const phone = (profile.phone || '').trim();
    if (filters.requirePhone !== false && !phone) continue;

    const js = jobSeekerByUser.get(profile.id);
    const talent = talentByUser.get(profile.id);
    const resume = resumeByUser.get(profile.id);

    const keywordBlob = [
      js?.headline,
      stringifyUnknown(js?.career_info),
      stringifyUnknown(talent?.skills),
      stringifyUnknown(resume?.data),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const qualificationBlob = [
      talent?.school_name,
      talent?.field_of_study,
      stringifyUnknown(resume?.data),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const locationBlob = [
      profile.residence_location,
      js?.location,
      stringifyUnknown(js?.location_interests),
      stringifyUnknown(talent?.location_interests),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (!haystackIncludesAny(keywordBlob, keywords)) continue;
    if (!haystackIncludesAny(qualificationBlob, qualifications)) continue;
    if (!haystackIncludesAny(locationBlob, locations)) continue;

    recipients.push({
      userId: profile.id,
      phone,
      firstName: profile.first_name,
      fullName:
        profile.full_name ||
        [profile.first_name, profile.last_name].filter(Boolean).join(' ') ||
        null,
      role: profile.role,
      location: profile.residence_location || js?.location || null,
    });
  }

  return recipients;
}

function personaliseMessage(template: string, recipient: BlastRecipient): string {
  const name =
    recipient.firstName || recipient.fullName?.split(' ')[0] || 'there';
  return template
    .replaceAll('{{name}}', name)
    .replaceAll('{{first_name}}', name)
    .replaceAll('{{location}}', recipient.location || 'your town');
}

export async function sendBlast(opts: {
  recipients: BlastRecipient[];
  message?: string;
  templateName?: string;
  templateLanguage?: string;
  templateComponents?: WATemplateComponent[];
  batchSize?: number;
  delayMs?: number;
}): Promise<BlastSendResult> {
  const total = opts.recipients.length;
  const result: BlastSendResult = { total, sent: 0, failed: 0, errors: [] };

  if (total === 0) return result;
  if (!opts.message && !opts.templateName) {
    throw new Error('sendBlast requires either `message` or `templateName`');
  }

  const batchSize = Math.max(1, Math.min(opts.batchSize ?? 20, 50));
  const delayMs = Math.max(0, opts.delayMs ?? 1000);

  for (let i = 0; i < total; i += batchSize) {
    const batch = opts.recipients.slice(i, i + batchSize);
    const outcomes = await Promise.allSettled(
      batch.map(async (recipient) => {
        if (opts.templateName) {
          await sendWhatsappTemplate(
            recipient.phone,
            opts.templateName,
            opts.templateLanguage || 'en',
            opts.templateComponents || [],
            recipient.userId
          );
          return;
        }
        const body = personaliseMessage(opts.message || '', recipient);
        await sendWhatsappMessage(recipient.phone, body, recipient.userId);
      })
    );

    outcomes.forEach((outcome, idx) => {
      const recipient = batch[idx];
      if (outcome.status === 'fulfilled') {
        result.sent += 1;
      } else {
        result.failed += 1;
        result.errors.push({
          userId: recipient.userId,
          phone: recipient.phone,
          error:
            outcome.reason instanceof Error
              ? outcome.reason.message
              : String(outcome.reason),
        });
      }
    });

    if (delayMs > 0 && i + batchSize < total) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  return result;
}
