/**
 * Tools the WhatsApp agent can call.
 *
 * The model chooses which tool to call and with what filters; everything that
 * matters is enforced here in code -- preview and monthly view caps, account
 * linkage, signup confirmation. Model arguments are treated as untrusted
 * input: validated with zod, and only ever used as search filters or as the
 * details of the person's own signup.
 *
 * Job lists, job details and links are rendered here, deterministically, as
 * "attachments" appended to the model's short reply. The model never writes a
 * job list or a URL itself, so it cannot invent a job or a link.
 *
 * In shadow mode (`dryRun`) tools read but never write: no view counters, no
 * saved searches, no signups. That keeps a shadow turn invisible to the user
 * and to the live state machine that is actually answering them.
 */

import { z } from 'zod';
import type { AiToolDefinition } from '@/lib/ai/client';
import type { WaLeadRow } from '@/lib/whatsapp-agent/leads';
import type { SearchJobRow, TimeFilter } from '@/lib/whatsapp-agent/job-search';
import type {
  AgentResultRef,
  AgentStatePayload,
  WaConversationState,
} from '@/lib/whatsapp-agent/state-machine';
import type { AgentSearchQuery, AgentSearchResult, RankedSearchFn, WidenStep } from './search';
import type { WhatsappSelfSignupResult } from '@/lib/field-registration/service';
import type { ReportReason, SubmitReportResult } from '@/lib/jobs/report-job';
import type {
  CreateJobResult,
  PostingAccess,
  WhatsappJobDraft,
} from '@/lib/whatsapp-agent/recruiter-posting';
import type { AgentJobDraft } from '@/lib/whatsapp-agent/state-machine';
import {
  evaluateViewBatch,
  FREE_MONTHLY_APPLY_LIMIT,
  FREE_MONTHLY_VIEW_LIMIT,
} from '@/lib/whatsapp-agent/limits';

export const SEARCH_PAGE_SIZE = 10;
export const NO_ACCOUNT_PREVIEW_LIMIT = 3;

export type AgentLanguage = 'en' | 'fr';

/** Everything with a side effect or a network call, injectable for tests. */
export interface AgentToolDeps {
  searchWithWidening: (query: AgentSearchQuery, limit: number) => Promise<AgentSearchResult>;
  rankedSearch: RankedSearchFn;
  getJobByPublicId: (publicId: string) => Promise<SearchJobRow | null>;
  getJobById: (id: string) => Promise<SearchJobRow | null>;
  saveLastSearch: (
    leadId: string,
    params: { location: string; roleKeywords: string; timeFilter: TimeFilter; offset: number }
  ) => Promise<void>;
  setLastSearchOffset: (leadId: string, offset: number) => Promise<void>;
  incrementViewCounter: (lead: WaLeadRow, incrementBy: number) => Promise<void>;
  createSignupInvite: (input: {
    fullName: string;
    phone: string;
    email: string;
    intendedRole: 'job_seeker' | 'recruiter';
  }) => Promise<WhatsappSelfSignupResult>;
  buildRegisterUrl: (phone: string, role: 'job_seeker' | 'recruiter') => string;
  menuMessage: (language: AgentLanguage) => string;
  storePendingApply: (leadId: string, jobId: string, jobPublicId: string) => Promise<void>;
  submitReport: (params: {
    jobId: string;
    reporterId: string;
    reason: ReportReason;
    description: string | null;
  }) => Promise<SubmitReportResult>;
  listSeekerPlans: () => Promise<Array<{ name: string; amountXaf: number; durationDays: number | null }>>;
  pauseLead: (leadId: string, untilIso: string, reason: string) => Promise<void>;
  alertAdmins: (message: string) => Promise<{ configured: boolean; sent: number }>;
  checkPostingAccess: (linkedUserId: string | null, role: string | null) => Promise<PostingAccess>;
  createJob: (userId: string, draft: WhatsappJobDraft) => Promise<CreateJobResult>;
  /** Absolute URLs on our own site, attached by tools (never typed by the model). */
  links: {
    subscribe: string;
    recruiterSubscribe: string;
    recruiterProfile: string;
    recruiterJobs: string;
    profile: string;
    cvBuilder: string;
    login: string;
    forgotPassword: string;
  };
}

/** Work the router does after sending the reply, with its existing handlers. */
export type AgentFollowUp = { type: 'apply'; publicId: string };

/** How long the bot stays quiet after a handoff, unless an admin resumes it. */
export const HANDOFF_PAUSE_MS = 24 * 60 * 60 * 1000;

export interface AgentToolContext {
  lead: WaLeadRow;
  /** The message being answered, line breaks kept; confirmations are checked against it in code. */
  inboundText: string;
  /** profiles.role when they have an account. */
  role: string | null;
  language: AgentLanguage;
  subscribed: boolean;
  dryRun: boolean;
  deps: AgentToolDeps;
  /** Agent memory; mutated by tools, persisted by the caller after a live turn. */
  memory: AgentStatePayload;
  /** Deterministic text appended to the model's reply, in order. */
  attachments: string[];
  /** Set by show_menu: hand the conversation back to the numbered menu. */
  nextState: WaConversationState | null;
  /** Set by apply_to_job; never set in dry runs. */
  followUp: AgentFollowUp | null;
  /** For handoff alerts. */
  displayName?: string | null;
}

export interface ToolResult {
  ok: boolean;
  /** Compact JSON-able payload the model sees. */
  data: Record<string, unknown>;
}

// ─── Formatting ───────────────────────────────────────────────────────────────

function formatSalary(salary: number | null): string | null {
  if (salary === null || Number.isNaN(salary) || salary <= 0) return null;
  return `${Math.round(salary).toLocaleString('en-US')} XAF`;
}

export function formatAgentJobList(
  jobs: SearchJobRow[],
  options: { lockedCount: number; hasMore: boolean; language: AgentLanguage }
): string {
  const fr = options.language === 'fr';
  const lines = jobs.map((job, index) => {
    const parts = [
      `${index + 1}. ${job.title || (fr ? 'Poste sans titre' : 'Untitled role')}`,
      job.company_name,
      job.location,
      formatSalary(job.salary),
    ].filter(Boolean);
    return `${parts.join(' · ')}\n   ${job.public_id || job.id.slice(0, 8)}`;
  });

  if (options.lockedCount > 0) {
    lines.push(
      fr
        ? `🔒 +${options.lockedCount} autre(s) offre(s) -- créez un compte gratuit pour tout voir.`
        : `🔒 +${options.lockedCount} more -- create a free account to see them all.`
    );
  }

  lines.push(
    fr
      ? `Répondez avec un numéro pour les détails${options.hasMore ? ', ou "plus" pour la suite' : ''}.`
      : `Reply with a number for details${options.hasMore ? ', or "more" for the next page' : ''}.`
  );
  return lines.join('\n');
}

export function formatAgentJobDetails(job: SearchJobRow, language: AgentLanguage): string {
  const fr = language === 'fr';
  const description = (job.description || '').replace(/\s+/g, ' ').trim();
  const clipped = description.length > 400 ? `${description.slice(0, 397)}...` : description;
  const ref = job.public_id || job.id;
  return [
    `*${job.title || (fr ? 'Poste' : 'Role')}*${job.company_name ? ` -- ${job.company_name}` : ''}`,
    `📍 ${job.location || 'N/A'}`,
    ...(formatSalary(job.salary) ? [`💰 ${formatSalary(job.salary)}`] : []),
    '',
    clipped || (fr ? 'Pas de description.' : 'No description provided.'),
    '',
    fr ? `Pour postuler : APPLY ${ref}` : `To apply: APPLY ${ref}`,
  ].join('\n');
}

// ─── Small helpers ────────────────────────────────────────────────────────────

const AFFIRMATIVE = new Set([
  'yes', 'y', 'yeah', 'yep', 'ok', 'okay', 'sure', 'confirm', 'correct', 'right', 'go ahead',
  'oui', 'ouais', "d'accord", 'dac', 'daccord', 'confirmer', 'je confirme', 'exact', 'cest bon', "c'est bon",
]);

/** Whether this message is the person saying yes. Checked in code, not by the model. */
export function isAffirmative(text: string): boolean {
  const value = text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[!.,👍✅ ]+$/u, '')
    .trim();
  return AFFIRMATIVE.has(value);
}

function remainingPreview(lead: WaLeadRow): number {
  return Math.max(0, NO_ACCOUNT_PREVIEW_LIMIT - (lead.views_month_count || 0));
}

function toRefs(jobs: SearchJobRow[]): AgentResultRef[] {
  return jobs.map((job, index) => ({
    n: index + 1,
    id: job.id,
    publicId: job.public_id,
    title: job.title,
  }));
}

function summarizeForModel(jobs: SearchJobRow[]) {
  return jobs.map((job, index) => ({
    n: index + 1,
    ref: job.public_id,
    title: job.title,
    company: job.company_name,
    location: job.location,
  }));
}

/**
 * Show a page of results under the account/preview/monthly caps, record it in
 * memory, and (when live) count the views. Shared by search_jobs and
 * more_results so the caps can't drift between them.
 */
async function presentPage(
  ctx: AgentToolContext,
  jobs: SearchJobRow[],
  query: AgentSearchQuery,
  offset: number,
  widened: WidenStep[]
): Promise<ToolResult> {
  const { lead } = ctx;
  const linked = Boolean(lead.linked_user_id);

  if (!linked && remainingPreview(lead) <= 0) {
    return {
      ok: true,
      data: {
        status: 'preview_limit_reached',
        note: `Without an account they can preview ${NO_ACCOUNT_PREVIEW_LIMIT} jobs a month and have used them. Offer to create a free account here in the chat (prepare_signup) or on the website (website_signup_link).`,
      },
    };
  }

  const decision = evaluateViewBatch({
    subscribed: ctx.subscribed,
    currentViews: lead.views_month_count || 0,
    batchSize: jobs.length,
  });
  const visibleCount = linked ? decision.visibleCount : Math.min(decision.visibleCount, remainingPreview(lead));
  const visible = jobs.slice(0, visibleCount);
  const lockedCount = jobs.length - visibleCount;
  const hasMore = jobs.length === SEARCH_PAGE_SIZE;

  ctx.attachments.push(formatAgentJobList(visible, { lockedCount, hasMore, language: ctx.language }));
  ctx.memory.lastResults = toRefs(visible);
  ctx.memory.lastQuery = query;

  if (!ctx.dryRun) {
    await ctx.deps.saveLastSearch(lead.id, {
      location: query.location || '',
      roleKeywords: query.role || '',
      timeFilter: query.recency,
      offset: offset + jobs.length,
    });
    await ctx.deps.incrementViewCounter(lead, visibleCount);
  }
  // Keep the in-memory row in step so a second search in this turn sees the cap.
  lead.views_month_count = (lead.views_month_count || 0) + visibleCount;

  return {
    ok: true,
    data: {
      status: 'shown',
      query,
      widened,
      shown: visibleCount,
      locked: lockedCount,
      has_more: hasMore,
      results: summarizeForModel(visible),
      ...(linked
        ? { monthly_free_views_left: ctx.subscribed ? 'unlimited' : Math.max(0, FREE_MONTHLY_VIEW_LIMIT - (lead.views_month_count || 0)) }
        : { account: 'none', preview_jobs_left: remainingPreview(lead) }),
      note: 'The numbered list is attached to your reply automatically. Do not repeat it.',
    },
  };
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const searchArgs = z.object({
  role: z.string().trim().max(80).nullish(),
  location: z.string().trim().max(60).nullish(),
  type: z.enum(['job', 'internship']).nullish(),
  recency: z.enum(['24h', '7d', '30d']).nullish(),
});

const jobDetailsArgs = z.object({ ref: z.string().trim().min(1).max(80) });

const prepareSignupArgs = z.object({
  full_name: z.string().trim().min(2).max(100),
  role: z.enum(['job_seeker', 'recruiter']),
  email: z.string().trim().max(120),
});

const websiteSignupArgs = z.object({ role: z.enum(['job_seeker', 'recruiter']).nullish() });

const noArgs = z.object({}).passthrough();

const faqArgs = z.object({
  topic: z.enum(['plans_and_prices', 'free_limits', 'how_to_apply', 'cv_upload', 'login_help', 'job_safety', 'about']),
});

const reportArgs = z.object({
  ref: z.string().trim().min(1).max(80),
  reason: z.enum(['scam', 'misleading', 'duplicate', 'offensive', 'wrong_info', 'other']),
  details: z.string().trim().max(500).nullish(),
});

const draftJobArgs = z.object({
  title: z.string().trim().max(120).nullish(),
  location: z.string().trim().max(80).nullish(),
  salary: z.string().trim().max(80).nullish(),
  how_to_apply: z.string().trim().max(300).nullish(),
  description: z.string().trim().max(3000).nullish(),
  use_message_as_description: z.boolean().nullish(),
});

const handoffArgs = z.object({
  reason: z.enum(['asked_for_human', 'scam_or_safety', 'payment_or_account', 'complaint', 'bot_stuck', 'other']),
  summary: z.string().trim().min(1).max(600),
});

interface ToolSpec {
  definition: AiToolDefinition;
  schema: z.ZodTypeAny;
  run: (ctx: AgentToolContext, args: any) => Promise<ToolResult>;
}

const TOOLS: ToolSpec[] = [
  {
    definition: {
      name: 'search_jobs',
      description:
        'Search open jobs or internships. Call as soon as you know roughly what they want -- every field is optional; do not ask for a town or a date range first. Empty results widen automatically.',
      parameters: {
        type: 'object',
        properties: {
          role: { type: 'string', description: 'Job title, field or skill in the user\'s own words, e.g. "cashier", "chauffeur", "développeur web". Omit for any role.' },
          location: { type: 'string', description: 'Town or city, e.g. "Douala". Omit for nationwide.' },
          type: { type: 'string', enum: ['job', 'internship'], description: 'Default job.' },
          recency: { type: 'string', enum: ['24h', '7d', '30d'], description: 'Only if they asked for recent postings. Default 30d.' },
        },
        additionalProperties: false,
      },
    },
    schema: searchArgs,
    run: async (ctx, args: z.infer<typeof searchArgs>) => {
      const query: AgentSearchQuery = {
        role: args.role || null,
        location: args.location || null,
        type: args.type || 'job',
        recency: args.recency || '30d',
      };
      const result = await ctx.deps.searchWithWidening(query, SEARCH_PAGE_SIZE);
      if (result.jobs.length === 0) {
        ctx.memory.lastResults = [];
        ctx.memory.lastQuery = null;
        return {
          ok: true,
          data: {
            status: 'no_results',
            query,
            note: 'Nothing found even after widening to all towns, all roles and the last 30 days. Say so briefly and suggest different words.',
          },
        };
      }
      return presentPage(ctx, result.jobs, result.query, 0, result.widened);
    },
  },
  {
    definition: {
      name: 'more_results',
      description: 'Next page of the last search. Use when they ask for more.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    schema: noArgs,
    run: async (ctx) => {
      const query = ctx.memory.lastQuery;
      if (!query) {
        return { ok: false, data: { error: 'no_previous_search', note: 'Ask what they are looking for and call search_jobs.' } };
      }
      const offset = ctx.lead.last_search_offset || 0;
      const jobs = await ctx.deps.rankedSearch(query, offset, SEARCH_PAGE_SIZE);
      if (jobs.length === 0) {
        return { ok: true, data: { status: 'no_more_results', query } };
      }
      return presentPage(ctx, jobs, query, offset, []);
    },
  },
  {
    definition: {
      name: 'job_details',
      description:
        'Show one job in full. ref is a number from the last list ("2"), a job ID ("JL-1042"), or words from its title ("the cashier one").',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
        additionalProperties: false,
      },
    },
    schema: jobDetailsArgs,
    run: async (ctx, args: z.infer<typeof jobDetailsArgs>) => {
      const job = await resolveJobRef(ctx, args.ref);
      if (!job) {
        return {
          ok: false,
          data: {
            error: 'job_not_found',
            last_results: (ctx.memory.lastResults || []).map((r) => ({ n: r.n, title: r.title })),
            note: 'Ask which one they mean, or search again.',
          },
        };
      }
      ctx.attachments.push(formatAgentJobDetails(job, ctx.language));
      return {
        ok: true,
        data: {
          status: 'shown',
          ref: job.public_id,
          title: job.title,
          company: job.company_name,
          location: job.location,
          apply_method: job.apply_method,
          note: `The details and "APPLY ${job.public_id || job.id}" instruction are attached automatically.`,
        },
      };
    },
  },
  {
    definition: {
      name: 'prepare_signup',
      description:
        'Start creating a free account in this chat. Only when they have no account and want one. Collect full name, role and email first (ask for whichever is missing, one short question at a time). This only saves a draft and returns a summary to read back -- nothing is created until they confirm.',
      parameters: {
        type: 'object',
        properties: {
          full_name: { type: 'string' },
          role: { type: 'string', enum: ['job_seeker', 'recruiter'] },
          email: { type: 'string' },
        },
        required: ['full_name', 'role', 'email'],
        additionalProperties: false,
      },
    },
    schema: prepareSignupArgs,
    run: async (ctx, args: z.infer<typeof prepareSignupArgs>) => {
      if (ctx.lead.linked_user_id) {
        return { ok: false, data: { error: 'already_has_account' } };
      }
      const email = args.email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        return { ok: false, data: { error: 'invalid_email', note: 'Ask them to re-type their email. If they have none, offer website_signup_link.' } };
      }
      ctx.memory.signupDraft = { fullName: args.full_name, role: args.role, email };
      return {
        ok: true,
        data: {
          status: 'awaiting_confirmation',
          summary: { full_name: args.full_name, role: args.role, email },
          note: 'Read these back and ask them to reply YES to create the account. When they say yes, call confirm_signup.',
        },
      };
    },
  },
  {
    definition: {
      name: 'confirm_signup',
      description: 'Create the account from the saved draft. Only right after they said yes to the summary.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    schema: noArgs,
    run: async (ctx) => {
      const draft = ctx.memory.signupDraft;
      if (!draft) {
        return { ok: false, data: { error: 'no_draft', note: 'Collect their details and call prepare_signup first.' } };
      }
      // The model saying "they confirmed" is not enough; the message must say yes.
      if (!isAffirmative(ctx.inboundText)) {
        return { ok: false, data: { error: 'not_confirmed', note: 'Their last message was not a clear yes. Ask them to reply YES, or to correct the details.' } };
      }
      if (ctx.dryRun) {
        return { ok: true, data: { status: 'dry_run', note: 'Shadow mode: nothing was created.' } };
      }

      const result = await ctx.deps.createSignupInvite({
        fullName: draft.fullName,
        phone: ctx.lead.phone_e164,
        email: draft.email,
        intendedRole: draft.role,
      });
      ctx.memory.signupDraft = null;

      if (result.status === 'existing_account') {
        return { ok: false, data: { error: 'phone_already_has_account', note: 'This WhatsApp number already has an account; they can log in on the website.' } };
      }
      if (result.status === 'invalid') {
        return { ok: false, data: { error: `invalid_${result.reason}` } };
      }

      const fr = ctx.language === 'fr';
      ctx.attachments.push(
        fr
          ? `👉 Dernière étape : choisissez votre mot de passe ici (lien valable 14 jours, à usage unique) :\n${result.claimUrl}`
          : `👉 Last step: set your password here (link works once, valid 14 days):\n${result.claimUrl}`
      );
      return {
        ok: true,
        data: {
          status: 'link_sent',
          note: 'The password link is attached. Tell them that once they set a password, they will see every job here in WhatsApp.',
        },
      };
    },
  },
  {
    definition: {
      name: 'website_signup_link',
      description: 'Send the website signup link instead of signing up in chat -- e.g. they have no email, or prefer the website.',
      parameters: {
        type: 'object',
        properties: { role: { type: 'string', enum: ['job_seeker', 'recruiter'] } },
        additionalProperties: false,
      },
    },
    schema: websiteSignupArgs,
    run: async (ctx, args: z.infer<typeof websiteSignupArgs>) => {
      ctx.attachments.push(ctx.deps.buildRegisterUrl(ctx.lead.phone_e164, args.role || 'job_seeker'));
      return { ok: true, data: { status: 'link_attached' } };
    },
  },
  {
    definition: {
      name: 'show_menu',
      description:
        'Show the numbered menu. Use when they ask for the menu, or want something you cannot do here: posting a job as a recruiter, or account and subscription questions.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    schema: noArgs,
    run: async (ctx) => {
      ctx.attachments.push(ctx.deps.menuMessage(ctx.language));
      ctx.nextState = 'menu';
      return { ok: true, data: { status: 'menu_attached' } };
    },
  },
  {
    definition: {
      name: 'apply_to_job',
      description:
        'Apply to a job for them. ref works like job_details. Call it when they ask to apply ("apply to the 2nd one") or say yes after you offered. The application itself is submitted right after your reply, with the existing limits and any screening questions.',
      parameters: {
        type: 'object',
        properties: { ref: { type: 'string' } },
        required: ['ref'],
        additionalProperties: false,
      },
    },
    schema: jobDetailsArgs,
    run: async (ctx, args: z.infer<typeof jobDetailsArgs>) => {
      const job = await resolveJobRef(ctx, args.ref);
      if (!job) {
        return { ok: false, data: { error: 'job_not_found', note: 'Ask which job they mean.' } };
      }
      const publicId = job.public_id || job.id;

      if (!ctx.lead.linked_user_id) {
        if (!ctx.dryRun) await ctx.deps.storePendingApply(ctx.lead.id, job.id, publicId);
        return {
          ok: true,
          data: {
            status: 'needs_account',
            ref: publicId,
            note: `Applying needs a free account. Offer to create one here (prepare_signup); once it is ready they reply APPLY ${publicId}. We saved this job for them.`,
          },
        };
      }

      // Applying uses up one of the free monthly applications, so it must be
      // what they asked for: either this message asks to apply, or it is a
      // yes to the job we offered last turn.
      const asked = APPLY_INTENT.test(ctx.inboundText);
      const confirmedOffer = isAffirmative(ctx.inboundText) && ctx.memory.proposedApply === publicId;
      if (!asked && !confirmedOffer) {
        ctx.memory.proposedApply = publicId;
        return {
          ok: true,
          data: {
            status: 'needs_confirmation',
            ref: publicId,
            title: job.title,
            company: job.company_name,
            note: 'Ask them to confirm with YES before applying.',
          },
        };
      }

      ctx.memory.proposedApply = null;
      if (!ctx.dryRun) ctx.followUp = { type: 'apply', publicId };
      return {
        ok: true,
        data: {
          status: 'submitting',
          ref: publicId,
          free_applications_per_month: ctx.subscribed ? 'unlimited' : FREE_MONTHLY_APPLY_LIMIT,
          note: 'Submission happens right after your reply and its result arrives as a separate message. Reply with one short line like "Applying now..." -- do not claim it succeeded.',
        },
      };
    },
  },
  {
    definition: {
      name: 'faq',
      description:
        'Facts about JobLinca for questions you would otherwise guess at. Answer from the returned facts only; any links are attached automatically.',
      parameters: {
        type: 'object',
        properties: {
          topic: {
            type: 'string',
            enum: ['plans_and_prices', 'free_limits', 'how_to_apply', 'cv_upload', 'login_help', 'job_safety', 'about'],
          },
        },
        required: ['topic'],
        additionalProperties: false,
      },
    },
    schema: faqArgs,
    run: async (ctx, args: z.infer<typeof faqArgs>) => {
      const { links } = ctx.deps;
      switch (args.topic) {
        case 'plans_and_prices': {
          const plans = await ctx.deps.listSeekerPlans();
          ctx.attachments.push(links.subscribe);
          return {
            ok: true,
            data: {
              plans: plans.map((p) => ({ name: p.name, price_xaf: p.amountXaf, days: p.durationDays })),
              what_you_get: 'Unlimited job views and applications through WhatsApp and the website.',
              payment: 'Paid on the website (link attached).',
            },
          };
        }
        case 'free_limits':
          return {
            ok: true,
            data: {
              without_account: `${NO_ACCOUNT_PREVIEW_LIMIT} job previews per month`,
              free_account: `${FREE_MONTHLY_VIEW_LIMIT} job views and ${FREE_MONTHLY_APPLY_LIMIT} applications per month, reset monthly`,
              subscribed: 'unlimited',
            },
          };
        case 'how_to_apply':
          return {
            ok: true,
            data: {
              steps: 'Find a job here, then reply APPLY with its ID (e.g. APPLY JL-001042), or ask me to apply to one from the list.',
              notes: [
                'Some employers ask a few screening questions here on WhatsApp after you apply.',
                'Some jobs are applied for on the employer\'s own site, by email or by phone; the job details say so.',
                'A free account is needed to apply.',
              ],
            },
          };
        case 'cv_upload':
          ctx.attachments.push(`${links.profile}\n${links.cvBuilder}`);
          return {
            ok: true,
            data: {
              how: 'Upload a CV on your profile page on the website, or build one with the free CV builder. Both links are attached. CVs cannot be uploaded in this chat yet.',
            },
          };
        case 'login_help':
          ctx.attachments.push(`${links.login}\n${links.forgotPassword}`);
          return {
            ok: true,
            data: {
              how: 'Log in on the website with your email and password. Forgot it? Use the reset link (attached). Your WhatsApp number links automatically when it matches the phone on your profile.',
            },
          };
        case 'job_safety':
          return {
            ok: true,
            data: {
              rules: [
                'Never pay money to get a job, an interview or training a recruiter demands.',
                'Be careful with jobs that ask for money transfers, ID documents up front, or meetings in private places.',
                'If a job looks suspicious, tell me and I will report it (report_job).',
              ],
            },
          };
        default:
          return {
            ok: true,
            data: {
              about: 'JobLinca is a job platform for Cameroon: jobs and internships from employers and trusted sources, searchable on the website and here on WhatsApp, in English and French.',
            },
          };
      }
    },
  },
  {
    definition: {
      name: 'report_job',
      description:
        'Report a job as a scam, misleading, duplicate, offensive or wrong. Needs an account. Ask what is wrong if they have not said.',
      parameters: {
        type: 'object',
        properties: {
          ref: { type: 'string' },
          reason: { type: 'string', enum: ['scam', 'misleading', 'duplicate', 'offensive', 'wrong_info', 'other'] },
          details: { type: 'string', description: 'Their own words about what is wrong.' },
        },
        required: ['ref', 'reason'],
        additionalProperties: false,
      },
    },
    schema: reportArgs,
    run: async (ctx, args: z.infer<typeof reportArgs>) => {
      if (!ctx.lead.linked_user_id) {
        return {
          ok: false,
          data: {
            error: 'needs_account',
            note: 'Reports need an account so we can follow up. Offer signup, or handoff_to_human if it is urgent (e.g. they were asked for money).',
          },
        };
      }
      const job = await resolveJobRef(ctx, args.ref);
      if (!job) return { ok: false, data: { error: 'job_not_found' } };
      if (ctx.dryRun) return { ok: true, data: { status: 'dry_run' } };

      const result = await ctx.deps.submitReport({
        jobId: job.id,
        reporterId: ctx.lead.linked_user_id,
        reason: args.reason,
        description: args.details ? `[via WhatsApp] ${args.details}` : '[via WhatsApp]',
      });
      if (result.status === 'reported') {
        return { ok: true, data: { status: 'reported', ref: job.public_id, note: 'Thank them; our team reviews every report.' } };
      }
      return { ok: false, data: { error: result.status } };
    },
  },
  {
    definition: {
      name: 'handoff_to_human',
      description:
        'Bring in a JobLinca team member. Use when they ask for a person, are upset, report being scammed or asked for money, have a payment or account problem you cannot solve, or you are going in circles. The bot then stays quiet in this chat until the team replies.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', enum: ['asked_for_human', 'scam_or_safety', 'payment_or_account', 'complaint', 'bot_stuck', 'other'] },
          summary: { type: 'string', description: 'One or two sentences for the team: who they are and what they need.' },
        },
        required: ['reason', 'summary'],
        additionalProperties: false,
      },
    },
    schema: handoffArgs,
    run: async (ctx, args: z.infer<typeof handoffArgs>) => {
      if (ctx.dryRun) return { ok: true, data: { status: 'dry_run' } };

      const phone = ctx.lead.phone_e164;
      const alert = await ctx.deps.alertAdmins(
        [
          `🙋 WhatsApp handoff (${args.reason})`,
          `${ctx.displayName || 'Unknown'} · ${phone}${ctx.lead.linked_user_id ? ' · has account' : ' · no account'}`,
          '',
          args.summary.slice(0, 500),
          '',
          `Reply to them: REPLY ${phone} <your message>`,
          `Hand back to the bot: RESUME ${phone}`,
          `Or chat directly: https://wa.me/${phone.replace(/\D/g, '')}`,
        ].join('\n')
      );
      if (!alert.configured || alert.sent === 0) {
        // Nobody would see it -- don't silence the bot for a handoff that went nowhere.
        return {
          ok: false,
          data: { error: 'team_unreachable', note: 'Apologise that no one is available right now and help as best you can.' },
        };
      }

      await ctx.deps.pauseLead(ctx.lead.id, new Date(Date.now() + HANDOFF_PAUSE_MS).toISOString(), args.reason);
      return {
        ok: true,
        data: {
          status: 'handed_off',
          note: 'Tell them a JobLinca team member will reply in this chat, usually within a few hours during the day. Do not promise an exact time.',
        },
      };
    },
  },
  {
    definition: {
      name: 'draft_job_post',
      description:
        'Recruiters only: start or update a job post. Call with whatever fields you have -- from a pasted ad or from the conversation -- and again as they fill gaps or correct things. If THIS message is the full ad, set use_message_as_description instead of copying it. Returns a preview and what is still missing; nothing is published until publish_job_post.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'Job title, e.g. "Cashier".' },
          location: { type: 'string', description: 'Town, e.g. "Douala".' },
          salary: { type: 'string', description: 'As they wrote it: "80 000 FCFA", "negotiable".' },
          how_to_apply: { type: 'string', description: 'A URL, email, phone, "WhatsApp 6...", or "JobLinca" to receive applications on JobLinca.' },
          description: { type: 'string', description: 'A short brief in their words, when they did not paste a full ad.' },
          use_message_as_description: { type: 'boolean', description: 'True when their current message is the full job ad.' },
        },
        additionalProperties: false,
      },
    },
    schema: draftJobArgs,
    run: async (ctx, args: z.infer<typeof draftJobArgs>) => {
      const access = await ctx.deps.checkPostingAccess(ctx.lead.linked_user_id, ctx.role);
      if (!access.allowed) return postingDenied(ctx, access.reason);

      const previous = ctx.memory.jobDraft || EMPTY_JOB_DRAFT;
      const draft: AgentJobDraft = {
        jobTitle: args.title || previous.jobTitle,
        location: args.location || previous.location,
        salary: args.salary || previous.salary,
        applicationMethod: args.how_to_apply || previous.applicationMethod,
        description: args.use_message_as_description
          ? ctx.inboundText.trim()
          : args.description || previous.description,
      };
      ctx.memory.jobDraft = draft;

      const missing = missingJobFields(draft);
      if (missing.length === 0) {
        ctx.attachments.push(formatJobDraftPreview(draft, ctx.language));
      }
      return {
        ok: true,
        data: {
          status: missing.length === 0 ? 'ready_to_publish' : 'incomplete',
          missing,
          optional_not_given: [
            ...(draft.salary ? [] : ['salary']),
            ...(draft.applicationMethod ? [] : ['how_to_apply (defaults to applying on JobLinca)']),
          ],
          note:
            missing.length === 0
              ? 'The preview is attached. Ask them to reply YES to submit it for review, or to tell you what to change.'
              : `Ask for: ${missing.join(', ')}. One short question.`,
        },
      };
    },
  },
  {
    definition: {
      name: 'publish_job_post',
      description: 'Submit the drafted job for review. Only right after they said yes to the preview.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
    schema: noArgs,
    run: async (ctx) => {
      const draft = ctx.memory.jobDraft;
      if (!draft || missingJobFields(draft).length > 0) {
        return { ok: false, data: { error: 'draft_incomplete', missing: draft ? missingJobFields(draft) : ['everything'] } };
      }
      if (!isAffirmative(ctx.inboundText)) {
        return { ok: false, data: { error: 'not_confirmed', note: 'Their last message was not a clear yes. Ask them to reply YES, or what to change.' } };
      }
      // Re-check: a subscription can lapse between drafting and publishing.
      const access = await ctx.deps.checkPostingAccess(ctx.lead.linked_user_id, ctx.role);
      if (!access.allowed) return postingDenied(ctx, access.reason);
      if (ctx.dryRun) return { ok: true, data: { status: 'dry_run' } };

      const result = await ctx.deps.createJob(ctx.lead.linked_user_id as string, {
        jobTitle: draft.jobTitle as string,
        location: draft.location as string,
        salary: draft.salary || '',
        description: draft.description as string,
        applicationMethod: draft.applicationMethod || 'JobLinca',
      });

      if (result.status === 'no_recruiter_profile') {
        ctx.attachments.push(ctx.deps.links.recruiterProfile);
        return { ok: false, data: { error: 'recruiter_profile_incomplete', note: 'They need to finish their recruiter profile on the website first (link attached). The draft is kept.' } };
      }
      if (result.status === 'error') {
        return { ok: false, data: { error: 'create_failed', note: 'Apologise; the draft is kept, they can say yes again in a moment.' } };
      }

      ctx.memory.jobDraft = null;
      const ref = result.publicId || result.jobId;
      const fr = ctx.language === 'fr';
      ctx.attachments.push(
        fr
          ? `✅ Offre ${ref} créée et envoyée pour vérification. Suivez-la ici :\n${ctx.deps.links.recruiterJobs}`
          : `✅ Job ${ref} created and sent for review. Track it here:\n${ctx.deps.links.recruiterJobs}`
      );
      return {
        ok: true,
        data: {
          status: 'submitted_for_review',
          ref,
          ...(access.feeXaf > 0 ? { posting_fee_xaf: access.feeXaf, fee_note: 'charged on the website' } : {}),
          note: 'Confirmation is attached. Our team reviews new posts before they go live, usually within a day.',
        },
      };
    },
  },
];

const EMPTY_JOB_DRAFT: AgentJobDraft = {
  jobTitle: null,
  location: null,
  salary: null,
  description: null,
  applicationMethod: null,
};

/** Required to publish; salary and how-to-apply are optional. */
export function missingJobFields(draft: AgentJobDraft): string[] {
  return [
    ...(draft.jobTitle ? [] : ['title']),
    ...(draft.location ? [] : ['location']),
    ...(draft.description && draft.description.trim().length >= 20 ? [] : ['description (what the job involves)']),
  ];
}

export function formatJobDraftPreview(draft: AgentJobDraft, language: AgentLanguage): string {
  const fr = language === 'fr';
  const description = (draft.description || '').trim();
  const clipped = description.length > 500 ? `${description.slice(0, 497)}...` : description;
  return [
    fr ? '📝 *Aperçu de votre offre*' : '📝 *Your job post*',
    `📌 ${draft.jobTitle}`,
    `📍 ${draft.location}`,
    `💰 ${draft.salary || (fr ? 'Non précisé' : 'Not specified')}`,
    `📮 ${fr ? 'Candidature' : 'Apply via'}: ${draft.applicationMethod || 'JobLinca'}`,
    '',
    clipped,
    ...(description.length < 300
      ? ['', fr ? '(La description sera développée avant la vérification.)' : '(The description will be expanded before review.)']
      : []),
  ].join('\n');
}

function postingDenied(
  ctx: AgentToolContext,
  reason: 'missing_account' | 'not_recruiter' | 'missing_subscription'
): ToolResult {
  if (reason === 'missing_subscription') {
    ctx.attachments.push(ctx.deps.links.recruiterSubscribe);
    return { ok: false, data: { error: 'recruiter_subscription_required', note: 'Posting needs an active recruiter subscription (link attached). Keep the draft for when they are subscribed.' } };
  }
  ctx.attachments.push(ctx.deps.buildRegisterUrl(ctx.lead.phone_e164, 'recruiter'));
  return {
    ok: false,
    data: {
      error: reason === 'missing_account' ? 'no_account' : 'not_a_recruiter_account',
      note: 'Posting jobs needs a recruiter account linked to this WhatsApp number (signup link attached).',
    },
  };
}

const APPLY_INTENT =/\b(apply|applying|postuler|postule|candidater|candidature)\b/i;

export const AGENT_TOOL_DEFINITIONS: AiToolDefinition[] = TOOLS.map((tool) => tool.definition);

async function resolveJobRef(ctx: AgentToolContext, rawRef: string): Promise<SearchJobRow | null> {
  const ref = rawRef.trim();
  const results = ctx.memory.lastResults || [];

  const publicId = ref.match(/\bJL-?\s*(\d+)\b/i);
  if (publicId) return ctx.deps.getJobByPublicId(`JL-${publicId[1]}`);

  const position = ref.match(/^\D{0,20}?(\d{1,2})\D{0,20}$/);
  if (position) {
    const hit = results.find((r) => r.n === Number(position[1]));
    return hit ? ctx.deps.getJobById(hit.id) : null;
  }

  const words = ref.toLowerCase().split(/\s+/).filter((w) => w.length > 2 && !['the', 'one', 'job', 'that', 'celui', 'poste'].includes(w));
  const matches = results.filter((r) => words.some((w) => (r.title || '').toLowerCase().includes(w)));
  return matches.length === 1 ? ctx.deps.getJobById(matches[0].id) : null;
}

/**
 * Validate and run one tool call. Bad arguments and unknown tools come back
 * to the model as errors it can recover from; exceptions from the tool itself
 * propagate, and the turn falls back to the menu flow.
 */
export async function executeTool(
  ctx: AgentToolContext,
  name: string,
  rawArgs: string
): Promise<ToolResult & { args: Record<string, unknown> }> {
  const tool = TOOLS.find((t) => t.definition.name === name);
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawArgs || '{}');
  } catch {
    return { ok: false, data: { error: 'arguments_not_json' }, args: {} };
  }
  const args = (parsedJson && typeof parsedJson === 'object' ? parsedJson : {}) as Record<string, unknown>;

  if (!tool) return { ok: false, data: { error: `unknown_tool:${name}` }, args };

  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return {
      ok: false,
      data: { error: 'invalid_arguments', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) },
      args,
    };
  }

  const result = await tool.run(ctx, parsed.data);
  return { ...result, args };
}
