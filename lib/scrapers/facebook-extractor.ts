/**
 * LLM-powered job extraction from unstructured Facebook group posts.
 *
 * Facebook job posts in Cameroon are typically:
 * - Free-form text (French or English) with job details
 * - Image flyers with job info embedded in the post artwork
 * - Shared links to external job boards
 *
 * This module uses GPT-4o-mini to extract structured job data from
 * raw post text and attached flyer images.
 */

import { z } from 'zod';
import {
  callAiJson,
  isAiConfigured,
  type AiChatContentPart,
} from '@/lib/ai/client';

/** Schema for a single extracted job from a Facebook post. */
const extractedJobSchema = z.object({
  is_job_post: z.boolean().describe('Whether this post is actually a job posting'),
  title: z.string().nullable().describe('Job title'),
  company: z.string().nullable().describe('Company or organization name'),
  location: z.string().nullable().describe('City or region in Cameroon'),
  job_type: z
    .enum([
      'Full-time',
      'Part-time',
      'Contract',
      'Internship',
      'Freelance',
      'Temporary',
      'Volunteer',
    ])
    .nullable(),
  salary: z.string().nullable().describe('Salary or compensation info'),
  requirements: z.string().nullable().describe('Key requirements (brief summary)'),
  contact: z.string().nullable().describe('How to apply (email, phone, WhatsApp, link)'),
  deadline: z.string().nullable().describe('Application deadline if mentioned (YYYY-MM-DD)'),
  language: z.enum(['fr', 'en']).describe('Primary language of the post'),
});

export type ExtractedJob = z.infer<typeof extractedJobSchema>;

export interface FacebookExtractionDetail {
  extraction: ExtractedJob | null;
  error: string | null;
  imageCount: number;
}

const EXTRACTION_PROMPT = `You are a job posting parser for Cameroon. Given a Facebook group post and any attached flyer images, determine if it's a job posting and extract structured data.

Rules:
- Many posts are in French. Handle both French and English.
- If attached images contain a flyer or poster, read the visible text and use it as evidence.
- Image content is allowed to fill gaps when the caption is short or missing.
- If the post is NOT a job posting (e.g., job seeking, ads, spam, general discussion), set is_job_post=false and null all other fields.
- For job title: extract or infer the most specific job title. "Recrutement d'un comptable" -> "Comptable"
- For company: extract the hiring organization name. If embedded in text like "la societe ABC recrute", extract "ABC".
- For location: extract Cameroon city/region. Common: Douala, Yaounde, Bamenda, Buea, Bafoussam, Garoua, Maroua.
- For deadline: convert to YYYY-MM-DD if possible. "avant le 25 mars 2026" -> "2026-03-25"
- For contact: extract email, phone/WhatsApp number, or application link.
- Be concise in requirements; just key qualifications in one sentence.

Respond with valid JSON matching the schema.`;

function sanitizeImageUrls(imageUrls: string[] | undefined): string[] {
  return (imageUrls || [])
    .map((value) => value.trim())
    .filter((value) => /^https?:\/\//i.test(value))
    .slice(0, 3);
}

function buildUserContent(postText: string, imageUrls: string[]): string | AiChatContentPart[] {
  const contentBlock = [
    'Facebook post text:',
    postText.trim() || '[No caption text provided]',
    imageUrls.length > 0
      ? `Attached images: ${imageUrls.length}. Use the flyer/poster text if the caption is incomplete.`
      : 'Attached images: none.',
  ].join('\n\n');

  if (imageUrls.length === 0) {
    return contentBlock;
  }

  return [
    { type: 'text', text: contentBlock },
    ...imageUrls.map(
      (url): AiChatContentPart => ({
        type: 'image_url',
        image_url: {
          url,
          detail: 'high',
        },
      })
    ),
  ];
}

/**
 * Extract structured job data from a raw Facebook post.
 * Supports image-assisted extraction for flyer-heavy posts.
 */
export async function extractJobFromPostDetailed(
  postText: string,
  imageUrls: string[] = []
): Promise<FacebookExtractionDetail> {
  if (!isAiConfigured()) {
    console.warn('[facebook-extractor] OpenAI not configured, skipping extraction');
    return { extraction: null, error: 'ai_not_configured', imageCount: 0 };
  }

  const normalizedText = (postText || '').trim();
  const normalizedImageUrls = sanitizeImageUrls(imageUrls);

  if (!normalizedText && normalizedImageUrls.length === 0) {
    return { extraction: null, error: 'empty_post', imageCount: 0 };
  }

  if (normalizedText.length < 20 && normalizedImageUrls.length === 0) {
    return { extraction: null, error: 'text_too_short', imageCount: 0 };
  }

  try {
    const result = await callAiJson({
      messages: [
        { role: 'system', content: EXTRACTION_PROMPT },
        {
          role: 'user',
          content: buildUserContent(normalizedText.slice(0, 3000), normalizedImageUrls),
        },
      ],
      schema: extractedJobSchema,
      model: 'gpt-4o-mini',
      temperature: 0.1,
      maxTokens: 700,
      timeoutMs: normalizedImageUrls.length > 0 ? 15000 : 10000,
      retryCount: 2,
    });

    return {
      extraction: result.parsed,
      error: null,
      imageCount: normalizedImageUrls.length,
    };
  } catch (err) {
    console.error(
      '[facebook-extractor] Extraction failed:',
      err instanceof Error ? err.message : err
    );
    return {
      extraction: null,
      error: err instanceof Error ? err.message : 'unknown_extraction_error',
      imageCount: normalizedImageUrls.length,
    };
  }
}

/**
 * Backward-compatible convenience wrapper.
 */
export async function extractJobFromPost(
  postText: string,
  imageUrls: string[] = []
): Promise<ExtractedJob | null> {
  const { extraction } = await extractJobFromPostDetailed(postText, imageUrls);
  return extraction;
}

/**
 * Batch extract jobs from multiple posts.
 * Processes sequentially with a small delay to avoid rate limits.
 */
export async function extractJobsFromPosts(
  posts: Array<{ id: string; text: string; url?: string; posted_at?: string; image_urls?: string[] }>
): Promise<Array<{ postId: string; extraction: ExtractedJob | null }>> {
  const results: Array<{ postId: string; extraction: ExtractedJob | null }> = [];

  for (const post of posts) {
    const extraction = await extractJobFromPost(post.text, post.image_urls || []);
    results.push({ postId: post.id, extraction });

    if (results.length < posts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return results;
}
