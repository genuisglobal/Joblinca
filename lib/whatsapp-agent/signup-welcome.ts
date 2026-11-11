import { sendSignupWelcomeInAppMessage } from '@/lib/messaging/in-app';
import { sendWhatsappMessage, sendWhatsappQuickReplies } from '@/lib/messaging/whatsapp';
import {
  findWaLeadByPhone,
  syncLeadUserLink,
  updateLeadStateWithoutTouch,
} from '@/lib/whatsapp-agent/leads';
import { mergePayload } from '@/lib/whatsapp-agent/state-machine';
import { decideAgentRoute } from '@/lib/whatsapp-agent/agent-config';

const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function getFirstName(fullName: string | null | undefined): string | null {
  const compact = (fullName || '').trim();
  if (!compact) return null;
  const [firstName] = compact.split(/\s+/);
  return firstName || null;
}

function isWithinServiceWindow(lastSeenAt: string | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const timestamp = new Date(lastSeenAt).getTime();
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= SERVICE_WINDOW_MS;
}

function buildWelcomeText(opts: {
  fullName?: string | null;
  pendingApplyJobPublicId?: string | null;
}): string {
  const firstName = getFirstName(opts.fullName);
  const greeting = firstName
    ? `Thank you for signing up, ${firstName}.`
    : 'Thank you for signing up.';

  const lines = [
    greeting,
    "I'm your JobLinca WhatsApp agent.",
    'You can search jobs here and apply directly through this chat.',
    'Reply 1 to find jobs or 3 to find internships.',
    'Use DETAILS JL-1000 to inspect a job and APPLY JL-1000 to apply.',
  ];

  if (opts.pendingApplyJobPublicId) {
    lines.push(
      `You already started an application for ${opts.pendingApplyJobPublicId}. Reply APPLY ${opts.pendingApplyJobPublicId} to continue.`
    );
  }

  return lines.join('\n');
}

export function buildAgentWelcomeText(opts: {
  fullName?: string | null;
  language?: 'en' | 'fr' | null;
  pendingApplyJobPublicId?: string | null;
}): string {
  const firstName = getFirstName(opts.fullName);
  if (opts.language === 'fr') {
    return [
      `C'est fait${firstName ? `, ${firstName}` : ''} ! Votre compte JobLinca est prêt. 🎉`,
      'Vous voyez maintenant toutes les offres. Dites-moi simplement ce que vous cherchez, par exemple « caissier à Douala ».',
      ...(opts.pendingApplyJobPublicId
        ? [`Pour reprendre votre candidature, répondez APPLY ${opts.pendingApplyJobPublicId}.`]
        : []),
    ].join('\n');
  }
  return [
    `You're in${firstName ? `, ${firstName}` : ''}! Your JobLinca account is ready. 🎉`,
    'You can now see every job. Just tell me what you are looking for, e.g. "cashier in Douala".',
    ...(opts.pendingApplyJobPublicId
      ? [`To pick up your application, reply APPLY ${opts.pendingApplyJobPublicId}.`]
      : []),
  ].join('\n');
}

export async function sendSignupWelcomeFromAgent(opts: {
  phone: string;
  userId: string;
  fullName?: string | null;
}): Promise<{ sent: boolean; reason: string; channel: 'whatsapp' | 'in_app' | null }> {
  const normalizedPhone = opts.phone.trim();
  if (!normalizedPhone) {
    return { sent: false, reason: 'missing_phone', channel: null };
  }

  const lead = await findWaLeadByPhone(normalizedPhone);
  if (!lead) {
    return { sent: false, reason: 'no_whatsapp_lead', channel: null };
  }

  const linkedLead = await syncLeadUserLink(lead, opts.userId);
  if (!isWithinServiceWindow(linkedLead.last_seen_at)) {
    const inAppResult = await sendSignupWelcomeInAppMessage({
      receiverId: opts.userId,
      fullName: opts.fullName,
      pendingApplyJobPublicId: linkedLead.pending_apply_job_public_id,
    });
    return {
      sent: inAppResult.sent,
      reason: inAppResult.sent ? 'outside_service_window_in_app_sent' : inAppResult.reason,
      channel: inAppResult.sent ? 'in_app' : null,
    };
  }

  // Leads talking to the conversational agent get a plain-language welcome
  // and stay with the agent instead of being dropped back on the numbered menu.
  if (decideAgentRoute(linkedLead.phone_e164) === 'live') {
    await sendWhatsappMessage(
      linkedLead.phone_e164,
      buildAgentWelcomeText({
        fullName: opts.fullName,
        language: linkedLead.language,
        pendingApplyJobPublicId: linkedLead.pending_apply_job_public_id,
      }),
      opts.userId
    );
    await updateLeadStateWithoutTouch(
      linkedLead.id,
      'agent',
      'jobseeker',
      mergePayload(linkedLead.state_payload, {})
    );
    return { sent: true, reason: 'sent', channel: 'whatsapp' };
  }

  const welcomeText = buildWelcomeText({
    fullName: opts.fullName,
    pendingApplyJobPublicId: linkedLead.pending_apply_job_public_id,
  });

  await sendWhatsappMessage(linkedLead.phone_e164, welcomeText, opts.userId);
  await sendWhatsappQuickReplies({
    to: linkedLead.phone_e164,
    body: 'Choose your next step.',
    footer: 'JobLinca WhatsApp Agent',
    buttons: [
      { id: 'welcome_job_search', title: '1 Find job' },
      { id: 'welcome_internships', title: '3 Internship' },
      { id: 'welcome_menu', title: 'MENU' },
    ],
    userId: opts.userId,
  });

  await updateLeadStateWithoutTouch(
    linkedLead.id,
    'menu',
    'jobseeker',
    mergePayload(linkedLead.state_payload, {})
  );

  return { sent: true, reason: 'sent', channel: 'whatsapp' };
}
