import type { SupportedLanguage } from '@/lib/whatsapp-screening/state-machine';

interface SummaryAnswer {
  question: string;
  answer: string;
  isMustHave: boolean;
  scoreDelta: number;
}

export interface RecruiterSummaryInput {
  language: SupportedLanguage;
  jobTitle: string;
  jobDescription: string;
  weightedScore: number;
  mustHavePassed: boolean;
  resultLabel: 'qualified' | 'review' | 'reject';
  answers: SummaryAnswer[];
}

export interface RecruiterSummaryOutput {
  summary: string;
  recommendation: 'strong_yes' | 'review' | 'reject';
  strengths: string[];
  risks: string[];
  model: string;
  tokensUsed: number;
}

export interface FollowUpQuestionInput {
  language: SupportedLanguage;
  jobTitle: string;
  jobDescription: string;
}

function isOpenAiAvailable(): boolean {
  const key = process.env.OPENAI_API_KEY;
  return Boolean(key && key.trim().length > 0);
}

async function callOpenAIChatJson<T>(
  messages: Array<{ role: 'system' | 'user'; content: string }>,
  timeoutMs = 12000
): Promise<{ parsed: T; model: string; tokensUsed: number }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error('OPENAI_API_KEY missing');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenAI call failed (${response.status}): ${text}`);
    }

    const payload = await response.json();
    const raw = payload?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') {
      throw new Error('OpenAI returned empty content');
    }

    return {
      parsed: JSON.parse(raw) as T,
      model: (payload?.model as string) || 'gpt-4o-mini',
      tokensUsed: (payload?.usage?.total_tokens as number) || 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateRecruiterSummary(
  input: RecruiterSummaryInput
): Promise<RecruiterSummaryOutput | null> {
  if (!isOpenAiAvailable()) {
    return null;
  }

  const systemPrompt = `You are a recruiter assistant for JobLinca.
Create concise, factual summaries from WhatsApp screening answers.
Return valid JSON only with this shape:
{
  "summary": "string",
  "recommendation": "strong_yes|review|reject",
  "strengths": ["string", "string"],
  "risks": ["string", "string"]
}
Rules:
- Keep summary under 120 words.
- Do not include protected characteristics.
- Be consistent with must-have pass/fail and score.
- Use neutral, professional tone.
`;

  const userPrompt = `Job title: ${input.jobTitle}
Job description: ${input.jobDescription || 'Not provided'}
Language: ${input.language}
Must-have passed: ${input.mustHavePassed ? 'yes' : 'no'}
Weighted score: ${input.weightedScore}/100
System label: ${input.resultLabel}
Answers:
${JSON.stringify(input.answers)}
`;

  const { parsed, model, tokensUsed } = await callOpenAIChatJson<{
    summary?: string;
    recommendation?: 'strong_yes' | 'review' | 'reject';
    strengths?: string[];
    risks?: string[];
  }>([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt },
  ]);

  const summary = parsed.summary?.trim();
  const recommendation = parsed.recommendation;
  const strengths = Array.isArray(parsed.strengths)
    ? parsed.strengths.filter((item) => typeof item === 'string').slice(0, 4)
    : [];
  const risks = Array.isArray(parsed.risks)
    ? parsed.risks.filter((item) => typeof item === 'string').slice(0, 4)
    : [];

  if (!summary || !recommendation) {
    return null;
  }

  return {
    summary,
    recommendation,
    strengths,
    risks,
    model,
    tokensUsed,
  };
}

export async function generateOptionalFollowUpQuestion(
  input: FollowUpQuestionInput
): Promise<string | null> {
  if (!isOpenAiAvailable()) {
    return null;
  }

  const systemPrompt = `Generate one short follow-up screening question for WhatsApp.
Output JSON: {"question":"..."}.
Rules:
- max 140 characters
- practical and role-relevant
- avoid personal/protected data`;

  const languageHint = input.language === 'fr' ? 'French' : 'English';
  const userPrompt = `Language: ${languageHint}
Job title: ${input.jobTitle}
Job description: ${input.jobDescription || 'Not provided'}
Generate one follow-up question only.`;

  const { parsed } = await callOpenAIChatJson<{ question?: string }>(
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    7000
  );

  const question = parsed.question?.trim() || null;
  if (!question) return null;
  return question.length <= 140 ? question : `${question.slice(0, 137)}...`;
}

export function isAiFollowUpEnabled(): boolean {
  return process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED === 'true';
}

export function isAiSummaryEnabled(): boolean {
  return isOpenAiAvailable();
}

