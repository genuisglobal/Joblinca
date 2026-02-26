#!/usr/bin/env node

/**
 * Daily Job Refresh Agent
 *
 * This script fetches remote jobs from all configured providers
 * (Remotive, Jobicy, Findwork) and upserts them into the external_jobs
 * table in Supabase.
 *
 * Usage:
 *   node scripts/refresh-jobs.mjs
 *
 * Environment variables required:
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   FINDWORK_API_KEY - enables Findwork provider
 *
 * Can be scheduled via:
 *   - Vercel Cron (automatic via vercel.json)
 *   - GitHub Actions (see .github/workflows example)
 *   - System cron: 0 6 * * * node /path/to/scripts/refresh-jobs.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ─── Category derivation ───────────────────────────
const CATEGORY_RULES = [
  { keywords: ['software', 'developer', 'engineer', 'frontend', 'backend', 'fullstack', 'devops', 'python', 'javascript', 'react', 'node', 'java', 'golang'], category: 'Engineering' },
  { keywords: ['product manager', 'product owner', 'scrum', 'program manager'], category: 'Product' },
  { keywords: ['design', 'ux', 'ui ', 'figma', 'graphic', 'creative'], category: 'Design' },
  { keywords: ['marketing', 'seo', 'content', 'social media', 'growth', 'copywriter'], category: 'Marketing' },
  { keywords: ['sales', 'account executive', 'business development'], category: 'Sales' },
  { keywords: ['customer support', 'customer success', 'customer service', 'helpdesk'], category: 'Customer Support' },
  { keywords: ['teacher', 'teaching', 'tutor', 'educator', 'instructor', 'esl'], category: 'Teaching' },
  { keywords: ['finance', 'accounting', 'accountant', 'bookkeeper'], category: 'Finance' },
  { keywords: ['human resources', 'hr ', 'recruiter', 'recruiting', 'talent acquisition'], category: 'HR & Recruiting' },
  { keywords: ['data analyst', 'data scientist', 'analytics', 'business intelligence'], category: 'Data & Analytics' },
  { keywords: ['qa', 'quality assurance', 'tester', 'test engineer'], category: 'QA & Testing' },
  { keywords: ['security', 'cybersecurity', 'infosec'], category: 'Security' },
  { keywords: ['writer', 'editor', 'technical writer', 'documentation'], category: 'Writing' },
  { keywords: ['intern', 'internship', 'trainee', 'entry level'], category: 'Internships & Entry Level' },
];

function deriveCategory(title, industry, description) {
  const text = `${title} ${industry || ''} ${description || ''}`.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (text.includes(kw)) return rule.category;
    }
  }
  if (industry) return industry;
  return 'Other';
}

// ─── Providers ─────────────────────────────────────

async function fetchRemotive() {
  console.log('  Fetching from Remotive...');
  try {
    const res = await fetch('https://remotive.com/api/remote-jobs');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = data.jobs || [];
    console.log(`  Remotive: ${jobs.length} jobs`);
    return jobs.map(job => ({
      external_id: String(job.id),
      source: 'remotive',
      title: job.title,
      company_name: job.company_name,
      company_logo: job.company_logo || null,
      location: job.candidate_required_location,
      salary: job.salary || null,
      job_type: job.job_type,
      category: job.category || deriveCategory(job.title),
      url: job.url,
      fetched_at: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('  Remotive failed:', err.message);
    return [];
  }
}

async function fetchJobicy() {
  console.log('  Fetching from Jobicy...');
  try {
    const res = await fetch('https://jobicy.com/api/v2/remote-jobs?count=50');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = data.jobs || [];
    console.log(`  Jobicy: ${jobs.length} jobs`);
    return jobs.map(job => {
      let salary = null;
      if (job.annualSalaryMin && job.annualSalaryMax) {
        salary = `${job.annualSalaryMin}–${job.annualSalaryMax} ${job.salaryCurrency || ''}`.trim();
      }
      return {
        external_id: String(job.id),
        source: 'jobicy',
        title: job.jobTitle,
        company_name: job.companyName,
        company_logo: job.companyLogo || null,
        location: job.jobGeo || null,
        salary,
        job_type: job.jobType || null,
        category: deriveCategory(job.jobTitle || '', job.jobIndustry || ''),
        url: job.url,
        fetched_at: new Date().toISOString(),
      };
    });
  } catch (err) {
    console.error('  Jobicy failed:', err.message);
    return [];
  }
}

async function fetchFindwork() {
  const apiKey = process.env.FINDWORK_API_KEY;
  if (!apiKey) {
    console.log('  Findwork: skipped (no API key)');
    return [];
  }
  console.log('  Fetching from Findwork...');
  try {
    const res = await fetch('https://findwork.dev/api/jobs/?search=remote&sort_by=relevance', {
      headers: { Authorization: `Token ${apiKey}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const jobs = data.results || [];
    console.log(`  Findwork: ${jobs.length} jobs`);
    return jobs.map(job => ({
      external_id: String(job.id),
      source: 'findwork',
      title: job.role || job.title || 'Untitled',
      company_name: job.company_name || null,
      company_logo: job.company_logo || null,
      location: job.location || 'Remote',
      salary: null,
      job_type: job.employment_type || null,
      category: deriveCategory(job.role || job.title || '', '', job.text || ''),
      url: job.url,
      fetched_at: new Date().toISOString(),
    }));
  } catch (err) {
    console.error('  Findwork failed:', err.message);
    return [];
  }
}

// ─── Main ──────────────────────────────────────────

async function main() {
  console.log(`\n=== Job Refresh Agent ===`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  // Fetch from all providers
  const [remotiveJobs, jobicyJobs, findworkJobs] = await Promise.all([
    fetchRemotive(),
    fetchJobicy(),
    fetchFindwork(),
  ]);

  const allJobs = [...remotiveJobs, ...jobicyJobs, ...findworkJobs];
  console.log(`\nTotal fetched: ${allJobs.length} jobs`);

  if (allJobs.length === 0) {
    console.log('No jobs to insert. Exiting.');
    return;
  }

  // Group jobs by source for atomic replacement
  const bySource = {};
  for (const job of allJobs) {
    if (!bySource[job.source]) bySource[job.source] = [];
    bySource[job.source].push(job);
  }

  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  // For each source: delete old rows, then batch insert fresh ones
  for (const [source, sourceJobs] of Object.entries(bySource)) {
    const { error: delErr } = await supabase
      .from('external_jobs')
      .delete()
      .eq('source', source);

    if (delErr) {
      console.error(`  Delete ${source} error:`, delErr.message);
      errors += sourceJobs.length;
      continue;
    }

    for (let i = 0; i < sourceJobs.length; i += BATCH_SIZE) {
      const batch = sourceJobs.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('external_jobs')
        .insert(batch);

      if (error) {
        console.error(`  Insert ${source} batch error:`, error.message);
        errors += batch.length;
      } else {
        inserted += batch.length;
      }
    }
  }

  // Summary
  console.log(`\n=== Summary ===`);
  console.log(`Remotive: ${remotiveJobs.length}`);
  console.log(`Jobicy:   ${jobicyJobs.length}`);
  console.log(`Findwork: ${findworkJobs.length}`);
  console.log(`Inserted/Updated: ${inserted}`);
  console.log(`Errors: ${errors}`);
  console.log(`Sources replaced: ${Object.keys(bySource).join(', ')}`);
  console.log(`Done.\n`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
