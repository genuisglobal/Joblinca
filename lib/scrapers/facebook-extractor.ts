/**
 * LLM-powered job extraction from unstructured Facebook group posts.
 *
 * Facebook job posts in Cameroon are typically:
 * - Free-form text (French or English) with job details
 * - Image flyers with job info (handled separately via OCR)
 * - Shared links to external job boards
 *
 * This module uses GPT-4o-mini to extract structured job data from
 * raw post text, handling bilingual content and varied formats.
 */

import { z } from 'zod';
import { callAiJson, isAiConfigured } from '@/lib/ai/client';

/** Schema for a single extracted job from a Facebook post. */
const extractedJobSchema = z.object({
  is_job_post: z.boolean().describe('Whether this post is actually a job posting'),
  title: z.string().nullable().describe('Job title'),
  company: z.string().nullable().describe('Company or organization name'),
  location: z.string().nullable().describe('City or region in Cameroon'),
  job_type: z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance', 'Temporary', 'Volunteer']).nullable(),
  salary: z.string().nullable().describe('Salary or compensation info'),
  requirements: z.string().nullable().describe('Key requirements (brief summary)'),
  contact: z.string().nullable().describe('How to apply (email, phone, WhatsApp, link)'),
  deadline: z.string().nullable().describe('Application deadline if mentioned (YYYY-MM-DD)'),
  language: z.enum(['fr', 'en']).describe('Primary language of the post'),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

const EXTRACTION_PROMPT = `You are a job posting parser for Cameroon. Given a Facebook group post, determine if it's a job posting and extract structured data.

Rules:
- Many posts are in French. Handle both French and English.
- If the post is NOT a job posting (e.g., job seeking, ads, spam, general discussion), set is_job_post=false and null all other fields.
- For job title: extract or infer the most specific job title. "Recrutement d'un comptable" → "Comptable"
- For company: extract the hiring organization name. If embedded in text like "la société ABC recrute", extract "ABC".
- For location: extract Cameroon city/region. Common: Douala, Yaoundé/Yaounde, Bamenda, Buea, Bafoussam, Garoua, Maroua.
- For deadline: convert to YYYY-MM-DD if possible. "avant le 25 mars 2026" → "2026-03-25"
- For contact: extract email, phone/WhatsApp number, or application link.
- Be concise in requirements — just key qualifications in one sentence.

Respond with valid JSON matching the schema.`;

/**
 * Extract structured job data from a raw Facebook post text.
 * Returns null if AI is not configured.
 */
export async function extractJobFromPost(postText: string): Promise<ExtractedJob | null> {
  if (!isAiConfigured()) {
    console.warn('[facebook-extractor] OpenAI not configured, skipping extraction');
    return null;
  }

  if (!postText || postText.trim().length < 20) {
    return null;
  }

  try {
    const result = await callAiJson({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        { role: 'user', content: postText.slice(0, 3000) }, // Cap input to control cost
      ],
      schema: extractedJobSchema,
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 500,
      timeoutMs: 10000,
    });

    return result.parsed;
  } catch (err) {
    console.error('[facebook-extractor] Extraction failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Batch extract jobs from multiple posts.
 * Processes sequentially with a small delay to avoid rate limits.
 */
export async function extractJobsFromPosts(
  posts: Array<{ id: string; text: string; url?: string; posted_at?: string }>,
): Promise<Array<{ postId: string; extraction: ExtractedJob | null }>> {
  const results: Array<{ postId: string; extraction: ExtractedJob | null }> = [];

  for (const post of posts) {
    const extraction = await extractJobFromPost(post.text);
    results.push({ postId: post.id, extraction });

    // Small delay between API calls
    if (results.length < posts.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}
