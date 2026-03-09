import { z } from 'zod';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';
import {
  buildFollowUpQuestionSystemPrompt,
  buildFollowUpQuestionUserPrompt,
  buildRecruiterSummarySystemPrompt,
  buildRecruiterSummaryUserPrompt,
} from '@/lib/ai/policies';
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
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
  risks: string[];
  nextStep: string;
  model: string;
  tokensUsed: number;
}

export interface FollowUpQuestionInput {
  language: SupportedLanguage;
  jobTitle: string;
  jobDescription: string;
}

const recruiterSummarySchema = z.object({
  summary: z.string().trim().min(1).max(900),
  recommendation: z.enum(['strong_yes', 'review', 'reject']),
  confidence: z.enum(['high', 'medium', 'low']),
  evidence: z.array(z.string().trim()).default([]),
  risks: z.array(z.string().trim()).default([]),
  nextStep: z.string().trim().min(1).max(240),
});

const followUpQuestionSchema = z.object({
  question: z.string().trim().min(1).max(140),
});

export function formatRecruiterSummaryText(summary: Pick<
  RecruiterSummaryOutput,
  'summary' | 'confidence' | 'nextStep'
>): string {
  return [
    summary.summary.trim(),
    `Confidence: ${summary.confidence}`,
    `Next step: ${summary.nextStep.trim()}`,
  ].join('\n\n');
}

export async function generateRecruiterSummary(
  input: RecruiterSummaryInput
): Promise<RecruiterSummaryOutput | null> {
  if (!isAiConfigured()) {
    return null;
  }

  const { parsed, model, tokensUsed } = await callAiJson({
    schema: recruiterSummarySchema,
    timeoutMs: 12000,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildRecruiterSummarySystemPrompt() },
      { role: 'user', content: buildRecruiterSummaryUserPrompt(input) },
    ],
  });

  return {
    summary: parsed.summary.trim(),
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    evidence: (parsed.evidence ?? []).filter(Boolean).slice(0, 4),
    risks: (parsed.risks ?? []).filter(Boolean).slice(0, 4),
    nextStep: (parsed.nextStep ?? '').trim(),
    model,
    tokensUsed,
  };
}

export async function generateOptionalFollowUpQuestion(
  input: FollowUpQuestionInput
): Promise<string | null> {
  if (!isAiConfigured()) {
    return null;
  }

  const languageHint = input.language === 'fr' ? 'French' : 'English';
  const { parsed } = await callAiJson({
    schema: followUpQuestionSchema,
    timeoutMs: 7000,
    temperature: 0.2,
    messages: [
      { role: 'system', content: buildFollowUpQuestionSystemPrompt() },
      {
        role: 'user',
        content: buildFollowUpQuestionUserPrompt({
          language: languageHint,
          jobTitle: input.jobTitle,
          jobDescription: input.jobDescription,
        }),
      },
    ],
  });

  return (parsed.question ?? '').trim();
}

export function isAiFollowUpEnabled(): boolean {
  return process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED === 'true';
}

export function isAiSummaryEnabled(): boolean {
  return isAiConfigured();
}
