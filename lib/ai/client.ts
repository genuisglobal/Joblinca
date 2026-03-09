import { z, type ZodType } from 'zod';

export type AiChatRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiChatRole;
  content: string;
}

interface BaseAiCallOptions {
  messages: AiChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeoutMs?: number;
  retryCount?: number;
}

export interface AiTextResult {
  text: string;
  model: string;
  tokensUsed: number;
}

export interface AiJsonResult<T> {
  parsed: T;
  model: string;
  tokensUsed: number;
}

export const DEFAULT_OPERATIONAL_MODEL = 'gpt-4o-mini';

function getOpenAiApiKey(): string {
  const apiKey = (process.env.OPENAI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'your_openai_api_key_here') {
    throw new Error('OPENAI_API_KEY missing');
  }

  return apiKey;
}

export function isAiConfigured(): boolean {
  try {
    getOpenAiApiKey();
    return true;
  } catch {
    return false;
  }
}

function normalizeContent(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('OpenAI returned empty content');
  }

  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('OpenAI returned empty content');
  }

  if (trimmed.startsWith('```')) {
    return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }

  return trimmed;
}

function toOpenAiMessages(messages: AiChatMessage[]) {
  return messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

async function performOpenAiCall(
  options: BaseAiCallOptions & {
    responseFormat?: { type: 'json_object' };
  }
): Promise<{ model: string; tokensUsed: number; content: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || 12000);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getOpenAiApiKey()}`,
      },
      body: JSON.stringify({
        model: options.model || DEFAULT_OPERATIONAL_MODEL,
        messages: toOpenAiMessages(options.messages),
        temperature: options.temperature ?? 0.2,
        max_tokens: options.maxTokens,
        response_format: options.responseFormat,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      const error = new Error(`OpenAI call failed (${response.status}): ${text}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    const payload = await response.json();

    return {
      model: (payload?.model as string) || options.model || DEFAULT_OPERATIONAL_MODEL,
      tokensUsed: (payload?.usage?.total_tokens as number) || 0,
      content: normalizeContent(payload?.choices?.[0]?.message?.content),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isTransientAiError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const status = (error as Error & { status?: number }).status;
  if (typeof status === 'number' && [408, 409, 429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const name = (error as Error & { name?: string }).name || '';
  if (name === 'AbortError' || name === 'TimeoutError') {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('econnreset') ||
    message.includes('socket hang up')
  );
}

function shouldRetryJsonError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return (
    isTransientAiError(error) ||
    message.includes('invalid json') ||
    message.includes('expected') ||
    message.includes('required')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetries<T>(
  attempts: number,
  shouldRetry: (error: unknown) => boolean,
  operation: () => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !shouldRetry(error)) {
        throw error;
      }
      await sleep(250 * (attempt + 1));
    }
  }

  throw lastError instanceof Error ? lastError : new Error('AI operation failed');
}

export async function callAiText(
  options: BaseAiCallOptions
): Promise<AiTextResult> {
  const result = await withRetries(options.retryCount ?? 1, isTransientAiError, () =>
    performOpenAiCall(options)
  );
  return {
    text: result.content,
    model: result.model,
    tokensUsed: result.tokensUsed,
  };
}

export async function callAiJson<T>(
  options: BaseAiCallOptions & {
    schema: ZodType<T>;
  }
): Promise<AiJsonResult<T>> {
  const result = await withRetries(options.retryCount ?? 1, shouldRetryJsonError, async () => {
    const aiResult = await performOpenAiCall({
      ...options,
      responseFormat: { type: 'json_object' },
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(aiResult.content);
    } catch (error) {
      throw new Error(
        `OpenAI returned invalid JSON: ${error instanceof Error ? error.message : 'unknown_error'}`
      );
    }

    return {
      parsed: options.schema.parse(parsedJson),
      model: aiResult.model,
      tokensUsed: aiResult.tokensUsed,
    };
  });

  return {
    parsed: result.parsed,
    model: result.model,
    tokensUsed: result.tokensUsed,
  };
}

export const nonEmptyTrimmedString = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length > 0, 'Expected a non-empty string');
