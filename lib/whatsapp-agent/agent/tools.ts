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
import { evaluateViewBatch, FREE_MONTHLY_VIEW_LIMIT } from '@/lib/whatsapp-agent/limits';

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
}

export interface AgentToolContext {
  lead: WaLeadRow;
  /** The message being answered; confirm_signup checks it in code. */
  inboundText: string;
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
];

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
