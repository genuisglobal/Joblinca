/**
 * LLM vetting pass for gray-zone discovered jobs.
 *
 * The keyword heuristics in ingestion catch the obvious cases; this pass
 * sends the ambiguous middle band (trust 40-60 or scam 20-50) to gpt-4o-mini
 * for a deeper look, and in the same call extracts structure the scrapers
 * can't parse reliably from free text:
 *   - scam probability with reasons (bilingual FR/EN aware)
 *   - cleaned plain-text description (nav junk / boilerplate stripped)
 *   - application deadline (most Cameroonian postings put it in the text)
 *   - city, employment type, language, category
 *
 * Cost-bounded: only unvetted gray-zone jobs, VETTING_BATCH_LIMIT per run.
 * Skips silently when OPENAI_API_KEY is not configured.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const VETTING_BATCH_LIMIT = 20;
const MODEL = 'gpt-4o-mini';

/** Blend: heuristic keyword score 40%, AI judgment 60% */
const HEURISTIC_WEIGHT = 0.4;
const AI_WEIGHT = 0.6;
const SUSPICIOUS_THRESHOLD = 50;
const CLEAR_THRESHOLD = 30;

export interface AiVettingStats {
  skipped?: string;
  examined: number;
  vetted: number;
  flagged: number;
  cleared: number;
  errors: number;
}

interface GrayZoneJob {
  id: string;
  title: string;
  company_name: string | null;
  location: string | null;
  city: string | null;
  employment_type: string | null;
  description_raw: string | null;
  description_clean: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_whatsapp: string | null;
  salary_min: string | null;
  trust_score: number | null;
  scam_score: number | null;
  expires_at: string | null;
  language: string | null;
  verification_status: string | null;
  ingestion_status: string | null;
}

interface VettingVerdict {
  scam_probability: number;
  scam_reasons: string[];
  cleaned_description: string | null;
  application_deadline: string | null;
  city: string | null;
  employment_type: string | null;
  language: 'fr' | 'en' | null;
  category: string | null;
}

const SYSTEM_PROMPT = `You vet job postings scraped from Cameroonian job boards and Facebook groups for a job platform. Postings are in French or English. Analyze the posting and return valid JSON:
{
  "scam_probability": number 0-100 (likelihood this is a scam/fraud: pay-to-apply fees, MLM/pyramid schemes, "gagner de l'argent facilement", vague get-rich promises, no real employer, personal WhatsApp as only contact for a "big company", requests for money/bank details, unrealistic salaries for the role),
  "scam_reasons": string[] (specific red flags found, empty if none),
  "cleaned_description": string (the job description as clean plain text: remove navigation junk, ads, unrelated boilerplate; keep the original language and all real content: duties, requirements, how to apply; null if there is no usable description),
  "application_deadline": string "YYYY-MM-DD" or null (deadline stated in the text, e.g. "date limite", "deadline", "au plus tard le"),
  "city": string or null (city in Cameroon if stated, e.g. Douala, Yaoundé),
  "employment_type": string or null (Full-time, Part-time, Internship, Contract, Freelance, Temporary),
  "language": "fr" or "en" (main language of the posting),
  "category": string or null (one of: Engineering, Product, Design, Marketing, Sales, Customer Support, Teaching, Finance, HR & Recruiting, Data & Analytics, Operations, Writing, QA & Testing, Security, Health, Logistics, Legal, Other)
}
Legitimate NGO/UN/corporate postings are common — a formal posting with a named employer, clear duties, and an official application channel is usually genuine. Judge on evidence, not tone.`;

function buildUserPrompt(job: GrayZoneJob): string {
  const parts = [
    `Title: ${job.title}`,
    `Company: ${job.company_name || '(none stated)'}`,
    `Location: ${[job.city, job.location].filter(Boolean).join(', ') || '(none)'}`,
    `Salary: ${job.salary_min || '(none stated)'}`,
    `Contacts: ${[
      job.contact_email && `email ${job.contact_email}`,
      job.contact_phone && `phone ${job.contact_phone}`,
      job.contact_whatsapp && `whatsapp ${job.contact_whatsapp}`,
    ]
      .filter(Boolean)
      .join(', ') || '(none)'}`,
    '',
    `Description:\n${(job.description_raw || job.description_clean || '(no description)').slice(0, 4000)}`,
  ];
  return parts.join('\n');
}

function parseVerdict(raw: string): VettingVerdict | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const probability = Number(parsed.scam_probability);
    if (!Number.isFinite(probability)) return null;

    const deadline =
      typeof parsed.application_deadline === 'string' &&
      /^\d{4}-\d{2}-\d{2}$/.test(parsed.application_deadline)
        ? parsed.application_deadline
        : null;

    return {
      scam_probability: Math.max(0, Math.min(100, Math.round(probability))),
      scam_reasons: Array.isArray(parsed.scam_reasons)
        ? (parsed.scam_reasons as unknown[]).filter((r): r is string => typeof r === 'string').slice(0, 8)
        : [],
      cleaned_description:
        typeof parsed.cleaned_description === 'string' && parsed.cleaned_description.trim().length >= 30
          ? parsed.cleaned_description.trim()
          : null,
      application_deadline: deadline,
      city: typeof parsed.city === 'string' && parsed.city.trim() ? parsed.city.trim() : null,
      employment_type:
        typeof parsed.employment_type === 'string' && parsed.employment_type.trim()
          ? parsed.employment_type.trim()
          : null,
      language: parsed.language === 'fr' || parsed.language === 'en' ? parsed.language : null,
      category: typeof parsed.category === 'string' && parsed.category.trim() ? parsed.category.trim() : null,
    };
  } catch {
    return null;
  }
}

/**
 * Vet up to `limit` unvetted gray-zone jobs and write results back to
 * discovered_jobs. Recomputes the blended scam score and moves jobs across
 * the suspicious/normalized boundary so the auto-publish pass sees them.
 */
export async function runAiVettingPass(
  supabase: SupabaseClient,
  limit = VETTING_BATCH_LIMIT
): Promise<AiVettingStats> {
  const stats: AiVettingStats = { examined: 0, vetted: 0, flagged: 0, cleared: 0, errors: 0 };

  if (!process.env.OPENAI_API_KEY) {
    return { ...stats, skipped: 'OPENAI_API_KEY not configured' };
  }

  const { data: candidates, error } = await supabase
    .from('discovered_jobs')
    .select(
      'id, title, company_name, location, city, employment_type, description_raw, description_clean, contact_email, contact_phone, contact_whatsapp, salary_min, trust_score, scam_score, expires_at, language, verification_status, ingestion_status'
    )
    .is('ai_vetted_at', null)
    .is('native_job_id', null)
    .not('ingestion_status', 'in', '("published","hidden")')
    .or(
      'and(trust_score.gte.40,trust_score.lte.60),and(scam_score.gte.20,scam_score.lte.50)'
    )
    .order('discovered_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[ai-vetting] Candidate query failed:', error.message);
    return { ...stats, skipped: `query failed: ${error.message}` };
  }

  const jobs = (candidates || []) as GrayZoneJob[];
  stats.examined = jobs.length;
  if (jobs.length === 0) return stats;

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  for (const job of jobs) {
    try {
      const completion = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserPrompt(job) },
        ],
        max_tokens: 1200,
        response_format: { type: 'json_object' },
      });

      const raw = completion.choices?.[0]?.message?.content?.trim();
      const verdict = raw ? parseVerdict(raw) : null;

      if (!verdict) {
        // Mark as vetted with no verdict so a malformed response can't make
        // the same job burn budget every run
        await supabase
          .from('discovered_jobs')
          .update({ ai_vetted_at: new Date().toISOString(), ai_vetting_json: { error: 'unparseable_response' } })
          .eq('id', job.id);
        stats.errors++;
        continue;
      }

      const heuristicScam = job.scam_score ?? 0;
      const blendedScam = Math.round(
        HEURISTIC_WEIGHT * heuristicScam + AI_WEIGHT * verdict.scam_probability
      );

      const patch: Record<string, unknown> = {
        ai_scam_probability: verdict.scam_probability,
        ai_vetting_json: {
          model: MODEL,
          heuristic_scam_score: heuristicScam,
          blended_scam_score: blendedScam,
          scam_reasons: verdict.scam_reasons,
          category: verdict.category,
        },
        ai_vetted_at: new Date().toISOString(),
        scam_score: blendedScam,
      };

      if (verdict.cleaned_description) patch.description_clean = verdict.cleaned_description;
      if (verdict.application_deadline && !job.expires_at) {
        patch.expires_at = `${verdict.application_deadline}T23:59:59Z`;
      }
      if (verdict.city && !job.city) patch.city = verdict.city;
      if (verdict.employment_type && !job.employment_type) {
        patch.employment_type = verdict.employment_type;
      }
      if (verdict.language && !job.language) patch.language = verdict.language;

      if (blendedScam >= SUSPICIOUS_THRESHOLD) {
        patch.verification_status = 'suspicious';
        patch.ingestion_status = 'review_required';
        stats.flagged++;
      } else if (
        blendedScam < CLEAR_THRESHOLD &&
        (job.verification_status === 'suspicious' || job.ingestion_status === 'review_required')
      ) {
        // Heuristics flagged it, AI cleared it — release to the auto-publish pass
        patch.verification_status = 'discovered';
        patch.ingestion_status = 'normalized';
        stats.cleared++;
      }

      const { error: updateErr } = await supabase
        .from('discovered_jobs')
        .update(patch)
        .eq('id', job.id);

      if (updateErr) {
        console.error(`[ai-vetting] Update failed for ${job.id}:`, updateErr.message);
        stats.errors++;
        continue;
      }

      stats.vetted++;
    } catch (err) {
      console.error(`[ai-vetting] Error vetting ${job.id}:`, err);
      stats.errors++;
    }
  }

  console.log(
    `[ai-vetting] ${stats.vetted}/${stats.examined} vetted, ${stats.flagged} flagged, ${stats.cleared} cleared, ${stats.errors} errors`
  );

  return stats;
}
