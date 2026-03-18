import { createServiceSupabaseClient } from '@/lib/supabase/service';

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://joblinca.com').replace(/\/$/, '');

function getAgentProfileId(): string | null {
  const value = (process.env.JOBLINCA_AGENT_PROFILE_ID || '').trim();
  return value || null;
}

function getFirstName(fullName: string | null | undefined): string | null {
  const compact = (fullName || '').trim();
  if (!compact) return null;
  const [firstName] = compact.split(/\s+/);
  return firstName || null;
}

function buildSignupWelcomeMessage(opts: {
  fullName?: string | null;
  pendingApplyJobPublicId?: string | null;
}): string {
  const firstName = getFirstName(opts.fullName);
  const greeting = firstName
    ? `Thank you for signing up, ${firstName}.`
    : 'Thank you for signing up.';

  const lines = [
    greeting,
    "I'm your JobLinca agent.",
    'Your WhatsApp chat window was inactive, so I am sending this welcome inside the app.',
    `Browse jobs now: ${APP_URL}/dashboard/job-seeker/browse`,
    'When you reopen WhatsApp, reply MENU, 1 for jobs, or 3 for internships.',
    'Use DETAILS JL-1000 to inspect a role and APPLY JL-1000 to apply through the agent.',
    `Open your inbox: ${APP_URL}/dashboard/job-seeker/messages`,
  ];

  if (opts.pendingApplyJobPublicId) {
    lines.push(
      `You already started an application for ${opts.pendingApplyJobPublicId}. Reopen WhatsApp and reply APPLY ${opts.pendingApplyJobPublicId} to continue.`
    );
  }

  return lines.join('\n');
}

export async function sendInAppAgentMessage(opts: {
  receiverId: string;
  body: string;
  jobId?: string | null;
}): Promise<{ sent: boolean; reason: string }> {
  const senderId = getAgentProfileId();
  if (!senderId) {
    return { sent: false, reason: 'missing_agent_profile_id' };
  }

  if (senderId === opts.receiverId) {
    return { sent: false, reason: 'invalid_agent_profile_id' };
  }

  const supabase = createServiceSupabaseClient();
  const { data: senderProfile, error: senderError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', senderId)
    .maybeSingle();

  if (senderError || !senderProfile?.id) {
    return { sent: false, reason: 'agent_profile_not_found' };
  }

  const { error: insertError } = await supabase.from('messages').insert({
    sender_id: senderId,
    receiver_id: opts.receiverId,
    job_id: opts.jobId ?? null,
    body: opts.body.trim(),
  });

  if (insertError) {
    throw new Error(`in_app_message_insert_failed: ${insertError.message}`);
  }

  return { sent: true, reason: 'sent' };
}

export async function sendSignupWelcomeInAppMessage(opts: {
  receiverId: string;
  fullName?: string | null;
  pendingApplyJobPublicId?: string | null;
}): Promise<{ sent: boolean; reason: string }> {
  return sendInAppAgentMessage({
    receiverId: opts.receiverId,
    body: buildSignupWelcomeMessage({
      fullName: opts.fullName,
      pendingApplyJobPublicId: opts.pendingApplyJobPublicId,
    }),
  });
}
