/**
 * One conversational turn of the WhatsApp agent: model -> tools -> model,
 * until the model answers in text or the turn runs out of budget.
 *
 * Never throws. Every failure -- model down, timeout, a tool erroring, too
 * many tool rounds -- comes back as `{ ok: false, reason }` so the caller can
 * hand the message to the menu flow instead, and log why.
 */

import {
  callAiToolTurn,
  type AiToolLoopMessage,
  type AiToolTurnResult,
} from '@/lib/ai/client';
import type { WaLeadRow } from '@/lib/whatsapp-agent/leads';
import type { AgentStatePayload, WaConversationState } from '@/lib/whatsapp-agent/state-machine';
import type { AgentToolCallRecord } from '@/lib/whatsapp-agent/agent-log';
import {
  AGENT_TOOL_DEFINITIONS,
  executeTool,
  type AgentLanguage,
  type AgentFollowUp,
  type AgentToolContext,
  type AgentToolDeps,
} from './tools';
import { buildSystemPrompt } from './prompt';

/** Model calls per turn: up to 3 rounds of tools, then a final answer. */
const MAX_MODEL_CALLS = 4;
/** Whole-turn budget. The webhook's maxDuration is 60s for the full payload. */
const TURN_BUDGET_MS = 20000;
const PER_CALL_TIMEOUT_MS = 9000;
const MAX_REPLY_CHARS = 3500;

export interface AgentTurnInput {
  lead: WaLeadRow;
  inboundText: string;
  history: AiToolLoopMessage[];
  memory: AgentStatePayload;
  language: AgentLanguage;
  subscribed: boolean;
  firstName: string | null;
  /** Full name for handoff alerts, when known. */
  displayName?: string | null;
  dryRun: boolean;
  deps: AgentToolDeps;
  /** Origins whose links may appear in model-written text. */
  allowedLinkOrigins: string[];
  callModel?: typeof callAiToolTurn;
  now?: () => number;
}

export type AgentTurnOutcome =
  | {
      ok: true;
      reply: string;
      memory: AgentStatePayload;
      nextState: WaConversationState;
      /** Work for the router after it sends `reply` (e.g. submit an application). */
      followUp: AgentFollowUp | null;
      toolCalls: AgentToolCallRecord[];
      model: string | null;
      promptTokens: number;
      completionTokens: number;
    }
  | {
      ok: false;
      reason: string;
      toolCalls: AgentToolCallRecord[];
      model: string | null;
      promptTokens: number;
      completionTokens: number;
    };

/**
 * Drop links the model wrote itself unless they point at our own site. Real
 * links (signup, password) arrive as attachments, which bypass this.
 */
export function stripForeignLinks(text: string, allowedOrigins: string[]): string {
  return text
    .replace(/https?:\/\/[^\s)]+/gi, (url) =>
      allowedOrigins.some((origin) => url.toLowerCase().startsWith(origin.toLowerCase())) ? url : ''
    )
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function composeReply(modelText: string | null, attachments: string[]): string {
  const parts = [modelText?.trim() || '', ...attachments.map((a) => a.trim())].filter(Boolean);
  const joined = parts.join('\n\n');
  return joined.length > MAX_REPLY_CHARS ? `${joined.slice(0, MAX_REPLY_CHARS - 3)}...` : joined;
}

export async function runAgentTurn(input: AgentTurnInput): Promise<AgentTurnOutcome> {
  const now = input.now ?? Date.now;
  const callModel = input.callModel ?? callAiToolTurn;
  const startedAt = now();

  const ctx: AgentToolContext = {
    // Tools update counters on this copy so a second search in the same turn
    // sees the first one's views; the caller's row is left untouched.
    lead: { ...input.lead },
    inboundText: input.inboundText,
    language: input.language,
    subscribed: input.subscribed,
    dryRun: input.dryRun,
    deps: input.deps,
    memory: { ...input.memory },
    attachments: [],
    nextState: null,
    followUp: null,
    displayName: input.displayName ?? null,
  };

  const messages: AiToolLoopMessage[] = [
    {
      role: 'system',
      content: buildSystemPrompt({
        lead: input.lead,
        firstName: input.firstName,
        subscribed: input.subscribed,
        language: input.language,
        memory: input.memory,
        today: new Date(startedAt).toISOString().slice(0, 10),
      }),
    },
    ...input.history,
    { role: 'user', content: input.inboundText.slice(0, 1000) },
  ];

  const toolCalls: AgentToolCallRecord[] = [];
  let model: string | null = null;
  let promptTokens = 0;
  let completionTokens = 0;
  const fail = (reason: string): AgentTurnOutcome => ({
    ok: false,
    reason,
    toolCalls,
    model,
    promptTokens,
    completionTokens,
  });

  for (let call = 0; call < MAX_MODEL_CALLS; call += 1) {
    const remaining = TURN_BUDGET_MS - (now() - startedAt);
    if (remaining < 1500) return fail('turn_budget_exhausted');

    let step: AiToolTurnResult;
    try {
      step = await callModel({
        messages,
        tools: AGENT_TOOL_DEFINITIONS,
        temperature: 0.3,
        maxTokens: 350,
        timeoutMs: Math.min(PER_CALL_TIMEOUT_MS, remaining),
        retryCount: 0,
      });
    } catch (error) {
      return fail(`model_error: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
    }

    model = step.model;
    promptTokens += step.promptTokens;
    completionTokens += step.completionTokens;

    if (step.toolCalls.length === 0) {
      const text = stripForeignLinks(step.text || '', input.allowedLinkOrigins);
      const reply = composeReply(text, ctx.attachments);
      if (!reply) return fail('empty_reply');
      return {
        ok: true,
        reply,
        memory: ctx.memory,
        nextState: ctx.nextState ?? 'agent',
        followUp: ctx.followUp,
        toolCalls,
        model,
        promptTokens,
        completionTokens,
      };
    }

    if (call === MAX_MODEL_CALLS - 1) return fail('too_many_tool_rounds');

    messages.push({ role: 'assistant', content: step.text, toolCalls: step.toolCalls });
    for (const toolCall of step.toolCalls) {
      const toolStarted = now();
      let content: string;
      try {
        const result = await executeTool(ctx, toolCall.name, toolCall.arguments);
        toolCalls.push({ name: toolCall.name, args: result.args, ok: result.ok, ms: now() - toolStarted });
        content = JSON.stringify({ ok: result.ok, ...result.data });
      } catch (error) {
        toolCalls.push({ name: toolCall.name, args: {}, ok: false, ms: now() - toolStarted });
        return fail(`tool_error:${toolCall.name}: ${error instanceof Error ? error.message.slice(0, 200) : 'unknown'}`);
      }
      messages.push({ role: 'tool', toolCallId: toolCall.id, content });
    }
  }

  return fail('too_many_tool_rounds');
}
