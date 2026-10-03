/**
 * Phase 5 WhatsApp templates (see docs/whatsapp-templates.md).
 *
 * Every send tries the approved template first and falls back to the plain
 * text we sent before, so this is safe to ship before Meta approves anything:
 * until a template exists, the template call fails and the text goes out as
 * it always did. Once approved, delivery outside the 24h window starts working
 * with no further deploy. Set a template's env var to "off" to skip it.
 */

import type { WATemplateComponent } from '@/lib/whatsapp';

export type TemplateLanguage = 'en' | 'fr';

interface TemplateSpec {
  env: string;
  defaultName: string;
  languages: TemplateLanguage[];
}

export const WA_TEMPLATES = {
  adminHandoff: { env: 'WA_ADMIN_HANDOFF_TEMPLATE', defaultName: 'admin_handoff_alert_v1', languages: ['en'] },
  adminUserMessage: { env: 'WA_ADMIN_USER_MESSAGE_TEMPLATE', defaultName: 'admin_user_message_v1', languages: ['en'] },
  teamReply: { env: 'WA_TEAM_REPLY_TEMPLATE', defaultName: 'team_reply_v1', languages: ['en', 'fr'] },
  signupReminder: { env: 'WA_SIGNUP_REMINDER_TEMPLATE', defaultName: 'signup_link_reminder_v1', languages: ['en', 'fr'] },
  jobPostApproved: { env: 'WA_JOB_POST_APPROVED_TEMPLATE', defaultName: 'job_post_approved_v1', languages: ['en', 'fr'] },
  jobPostRejected: { env: 'WA_JOB_POST_REJECTED_TEMPLATE', defaultName: 'job_post_rejected_v1', languages: ['en', 'fr'] },
} satisfies Record<string, TemplateSpec>;

export type TemplateKey = keyof typeof WA_TEMPLATES;

/** Meta rejects template parameters containing newlines, tabs or 4+ spaces (error 132018). */
export function toTemplateParam(value: string, maxLength = 900): string {
  const flat = value.replace(/\s+/g, ' ').trim();
  return (flat.length > maxLength ? `${flat.slice(0, maxLength - 1)}…` : flat) || '-';
}

export function resolveTemplate(
  key: TemplateKey,
  language: TemplateLanguage | null | undefined,
  env: Record<string, string | undefined> = process.env
): { name: string; language: TemplateLanguage } | null {
  const spec = WA_TEMPLATES[key];
  const configured = (env[spec.env] || '').trim();
  if (configured.toLowerCase() === 'off') return null;
  const lang: TemplateLanguage = language === 'fr' && (spec.languages as TemplateLanguage[]).includes('fr') ? 'fr' : 'en';
  return { name: configured || spec.defaultName, language: lang };
}

export interface TemplateSenders {
  sendTemplate: (to: string, name: string, language: string, components: WATemplateComponent[]) => Promise<unknown>;
  sendText: (to: string, text: string) => Promise<unknown>;
}

export type TemplateSendResult = 'template' | 'text' | 'failed';

/**
 * Send `template` with `body` parameters (and an optional dynamic URL button
 * suffix); if that fails or the template is switched off, send `fallbackText`.
 */
export async function sendTemplateWithFallback(
  senders: TemplateSenders,
  opts: {
    to: string;
    template: TemplateKey;
    language?: TemplateLanguage | null;
    body: string[];
    urlButtonSuffix?: string;
    fallbackText: string;
  }
): Promise<TemplateSendResult> {
  const resolved = resolveTemplate(opts.template, opts.language);
  if (resolved) {
    const components: WATemplateComponent[] = [
      { type: 'body', parameters: opts.body.map((text) => ({ type: 'text', text: toTemplateParam(text) })) },
      ...(opts.urlButtonSuffix
        ? [{ type: 'button' as const, sub_type: 'url' as const, index: '0', parameters: [{ type: 'text' as const, text: opts.urlButtonSuffix }] }]
        : []),
    ];
    try {
      await senders.sendTemplate(opts.to, resolved.name, resolved.language, components);
      return 'template';
    } catch (error) {
      console.warn('[wa-templates] template send failed, falling back to text', {
        template: resolved.name,
        error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
      });
    }
  }

  try {
    await senders.sendText(opts.to, opts.fallbackText);
    return 'text';
  } catch (error) {
    console.warn('[wa-templates] text fallback failed', {
      template: opts.template,
      error: error instanceof Error ? error.message.slice(0, 200) : 'unknown',
    });
    return 'failed';
  }
}

/** Whether a free-form message can still reach this person (24h customer-service window). */
export function isWithinServiceWindow(lastInboundAt: string | null | undefined, now = Date.now()): boolean {
  if (!lastInboundAt) return false;
  const at = new Date(lastInboundAt).getTime();
  return Number.isFinite(at) && now - at < 24 * 60 * 60 * 1000;
}
