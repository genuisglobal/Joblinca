import assert from 'node:assert/strict';

import { buildJobIdentity, compareJobIdentity } from '@/lib/jobs/dedupe-model';
import { deduplicateCrossSources } from '@/lib/scrapers/dedup';
import type { ScrapedJob } from '@/lib/scrapers/types';

function makeJob(overrides: Partial<ScrapedJob>): ScrapedJob {
  return {
    external_id: overrides.external_id || 'job-1',
    source: overrides.source || 'minajobs',
    title: overrides.title || 'Software Engineer',
    company_name: overrides.company_name ?? 'Orange Cameroun',
    company_logo: overrides.company_logo ?? null,
    location: overrides.location ?? 'Douala, Cameroon',
    salary: overrides.salary ?? null,
    job_type: overrides.job_type ?? 'Full-time',
    category: overrides.category ?? 'Engineering',
    description: overrides.description ?? null,
    url: overrides.url || 'https://example.com/jobs/software-engineer',
    region: overrides.region ?? 'Littoral',
    language: overrides.language ?? 'fr',
    is_cameroon_local: overrides.is_cameroon_local ?? true,
    posted_at: overrides.posted_at ?? '2026-04-02T00:00:00.000Z',
    closing_at: overrides.closing_at ?? null,
    fetched_at: overrides.fetched_at ?? '2026-04-02T00:00:00.000Z',
    contact_email: overrides.contact_email ?? null,
    contact_phone: overrides.contact_phone ?? null,
    contact_whatsapp: overrides.contact_whatsapp ?? null,
  };
}

function testExactUrlMatch() {
  const a = buildJobIdentity({
    title: 'Software Engineer',
    companyName: 'Orange Cameroun',
    urls: ['https://jobs.example.com/opening/software-engineer?utm_source=facebook&ref=feed'],
  });
  const b = buildJobIdentity({
    title: 'Senior Software Engineer',
    companyName: 'Orange Cameroun SA',
    urls: ['https://jobs.example.com/opening/software-engineer'],
  });

  const match = compareJobIdentity(a, b);
  assert.equal(match.duplicate, true);
  assert.equal(match.reason, 'exact_url');
}

function testFuzzyDuplicateMatch() {
  const a = buildJobIdentity({
    title: "Recrutement d'un Comptable Senior",
    companyName: 'Acme SARL',
  });
  const b = buildJobIdentity({
    title: 'Comptable Senior',
    companyName: 'Acme',
  });

  const match = compareJobIdentity(a, b);
  assert.equal(match.duplicate, true);
  assert.ok(match.reason === 'exact_text' || match.reason === 'fuzzy');
}

function testNonDuplicateMatch() {
  const a = buildJobIdentity({
    title: 'Software Engineer',
    companyName: 'Orange Cameroun',
  });
  const b = buildJobIdentity({
    title: 'Accountant',
    companyName: 'KPMG Cameroon',
  });

  const match = compareJobIdentity(a, b);
  assert.equal(match.duplicate, false);
}

function testCrossSourceDedupKeepsRicherJob() {
  const sparse = makeJob({
    external_id: 'job-1',
    source: 'minajobs',
    title: 'Accountant',
    company_name: 'Confidential',
    description: null,
    salary: null,
    url: 'https://boards.example.com/jobs/accountant?utm_campaign=social',
  });
  const rich = makeJob({
    external_id: 'job-2',
    source: 'jobincamer',
    title: 'Accountant',
    company_name: 'Confidential',
    description: 'Five years accounting experience required.',
    salary: '150,000 XAF',
    url: 'https://boards.example.com/jobs/accountant',
  });

  const result = deduplicateCrossSources([sparse, rich]);
  assert.equal(result.unique.length, 1);
  assert.equal(result.stats.duplicates_removed, 1);
  assert.equal(result.unique[0].source, 'jobincamer');
}

testExactUrlMatch();
testFuzzyDuplicateMatch();
testNonDuplicateMatch();
testCrossSourceDedupKeepsRicherJob();

console.log('job dedup model test passed');
