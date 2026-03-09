/**
 * AI Application Analysis Module
 *
 * This module provides functions for analyzing job applications using AI.
 * It extracts key information from CVs and cover letters, and scores
 * candidates against job requirements.
 *
 * In production, this uses a structured OpenAI call when available and
 * falls back to an explicit rule-based review when AI is unavailable.
 */

import { z } from 'zod';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';
import {
  buildApplicationAnalysisSystemPrompt,
  buildApplicationAnalysisUserPrompt,
} from '@/lib/ai/policies';

export interface ParsedProfile {
  skills: string[];
  experience: {
    title: string;
    company: string;
    duration: string;
    description?: string;
  }[];
  education: {
    degree: string;
    institution: string;
    year?: string;
  }[];
  location?: string;
  links: {
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary?: string;
}

export interface AIAnalysisResult {
  parsedProfile: ParsedProfile;
  matchScore: number;
  strengths: string[];
  gaps: string[];
  reasoning: string;
  tokensUsed?: number;
  modelUsed?: string;
}

export interface AnalysisInput {
  applicationId: string;
  coverLetter?: string | null;
  resumeUrl?: string | null;
  resumeText?: string | null;
  answers?: unknown[] | null;
  jobTitle: string;
  jobDescription?: string | null;
  jobLocation?: string | null;
  requiredSkills?: string[];
}

const parsedProfileSchema = z.object({
  skills: z.array(z.string()).default([]),
  experience: z
    .array(
      z.object({
        title: z.string().default(''),
        company: z.string().default(''),
        duration: z.string().default(''),
        description: z.string().optional(),
      })
    )
    .default([]),
  education: z
    .array(
      z.object({
        degree: z.string().default(''),
        institution: z.string().default(''),
        year: z.string().optional(),
      })
    )
    .default([]),
  location: z.string().optional(),
  links: z
    .object({
      linkedin: z.string().optional(),
      github: z.string().optional(),
      portfolio: z.string().optional(),
    })
    .default({}),
  summary: z.string().optional(),
});

const analysisResponseSchema = z.object({
  parsedProfile: parsedProfileSchema,
  matchScore: z.number().min(0).max(100),
  strengths: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  reasoning: z.string(),
});

/**
 * Analyze an application using AI
 *
 * In production, this function should:
 * 1. Extract text from the resume PDF/DOCX
 * 2. Send the extracted text + cover letter + job description to OpenAI
 * 3. Parse the structured response
 *
 * Current implementation provides mock results for development.
 */
export async function analyzeApplication(
  input: AnalysisInput
): Promise<AIAnalysisResult> {
  if (isAiConfigured()) {
    try {
      return await performRealAnalysis(input);
    } catch (error) {
      console.error('AI analysis error:', error);
      return performRuleBasedAnalysis(input, 'AI review unavailable. Showing rule-based screening only.');
    }
  }

  return performRuleBasedAnalysis(input, 'AI service unavailable. Showing rule-based screening only.');
}

/**
 * Real AI analysis using OpenAI
 */
async function performRealAnalysis(
  input: AnalysisInput
): Promise<AIAnalysisResult> {
  const { parsed, model, tokensUsed } = await callAiJson({
    schema: analysisResponseSchema,
    temperature: 0.2,
    timeoutMs: 15000,
    messages: [
      {
        role: 'system',
        content: buildApplicationAnalysisSystemPrompt(),
      },
      {
        role: 'user',
        content: buildApplicationAnalysisUserPrompt(input),
      },
    ],
  });

  return {
    parsedProfile: {
      skills: parsed.parsedProfile.skills ?? [],
      experience: (parsed.parsedProfile.experience ?? []).map((item) => ({
        title: item.title ?? '',
        company: item.company ?? '',
        duration: item.duration ?? '',
        description: item.description,
      })),
      education: (parsed.parsedProfile.education ?? []).map((item) => ({
        degree: item.degree ?? '',
        institution: item.institution ?? '',
        year: item.year,
      })),
      location: parsed.parsedProfile.location,
      links: {
        linkedin: parsed.parsedProfile.links?.linkedin,
        github: parsed.parsedProfile.links?.github,
        portfolio: parsed.parsedProfile.links?.portfolio,
      },
      summary: parsed.parsedProfile.summary,
    },
    matchScore: Math.min(100, Math.max(0, parsed.matchScore)),
    strengths: (parsed.strengths ?? []).slice(0, 5),
    gaps: (parsed.gaps ?? []).slice(0, 5),
    reasoning: parsed.reasoning ?? 'AI analysis completed with limited explanation.',
    tokensUsed,
    modelUsed: model,
  };
}

/**
 * Deterministic fallback when AI is unavailable or fails.
 */
function performRuleBasedAnalysis(
  input: AnalysisInput,
  unavailableReason: string
): AIAnalysisResult {
  const coverLetterLower = (input.coverLetter || '').toLowerCase();
  const hasExperience = coverLetterLower.includes('experience') || coverLetterLower.includes('years');
  const hasSkills = coverLetterLower.includes('skill') || coverLetterLower.includes('proficient');
  const hasEducation = coverLetterLower.includes('degree') || coverLetterLower.includes('university');
  const hasAnswers = Array.isArray(input.answers) && input.answers.length > 0;
  const requiredSkills = input.requiredSkills || [];
  const resumeText = (input.resumeText || '').toLowerCase();
  const matchedRequiredSkills = requiredSkills.filter((skill) =>
    resumeText.includes(skill.toLowerCase()) || coverLetterLower.includes(skill.toLowerCase())
  );

  let baseScore = 50;
  if (hasExperience) baseScore += 15;
  if (hasSkills) baseScore += 15;
  if (hasEducation) baseScore += 10;
  if (input.resumeUrl) baseScore += 10;
  if (hasAnswers) baseScore += 5;
  if (requiredSkills.length > 0) {
    baseScore += Math.min(10, matchedRequiredSkills.length * 3);
  }

  const strengths: string[] = [];
  const gaps: string[] = [];

  if (input.coverLetter && input.coverLetter.length > 200) {
    strengths.push('Provided a detailed cover letter with useful context for recruiter review');
  }
  if (input.resumeUrl) {
    strengths.push('Submitted a resume/CV for review');
  }
  if (hasExperience) {
    strengths.push('Mentions relevant professional experience');
  }
  if (matchedRequiredSkills.length > 0) {
    strengths.push(`Shows evidence of required skills: ${matchedRequiredSkills.slice(0, 4).join(', ')}`);
  }

  if (!input.coverLetter) {
    gaps.push('No cover letter provided, so motivation and role-specific context are limited');
  }
  if (!input.resumeUrl) {
    gaps.push('No resume uploaded, which limits qualification review');
  }
  if (requiredSkills.length > 0 && matchedRequiredSkills.length === 0) {
    gaps.push('No clear evidence of the required skills was detected in the available materials');
  }
  if (strengths.length === 0) {
    gaps.push('Application would benefit from more detailed evidence about skills and experience');
  }

  if (strengths.length === 0) {
    strengths.push('Demonstrated interest by applying to the position');
  }
  if (gaps.length === 0) {
    gaps.push('Consider providing more specific examples of relevant experience');
  }

  return {
    parsedProfile: {
      skills: [],
      experience: [],
      education: [],
      links: {},
      summary: 'Profile parsed from application',
    },
    matchScore: Math.min(100, Math.max(0, baseScore)),
    strengths,
    gaps,
    reasoning: `${unavailableReason} This is a deterministic rule-based assessment using the submitted materials only. ${
      input.resumeUrl
        ? 'A resume was provided for detailed review.'
        : 'No resume was provided, limiting the depth of this assessment.'
    } ${
      input.coverLetter
        ? 'The cover letter provides additional context about the candidate.'
        : 'A cover letter would help better understand the candidate\'s motivation.'
    } For a complete assessment, please review all submitted materials directly.`,
    modelUsed: 'rule_based_v1',
    tokensUsed: 0,
  };
}

/**
 * Extract text from a PDF resume
 * This is a placeholder - in production, use a PDF parsing library
 */
export async function extractTextFromResume(
  resumeUrl: string
): Promise<string | null> {
  // In production, implement PDF text extraction using:
  // - pdf-parse for Node.js
  // - Or call an external service
  //
  // For now, return null to indicate extraction not available
  console.log('Resume text extraction not implemented for:', resumeUrl);
  return null;
}
