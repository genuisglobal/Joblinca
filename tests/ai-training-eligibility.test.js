/**
 * Cameroon eligibility for live AI-training openings (lib/ai-training-jobs.ts).
 *
 * Every title/location pair below was copied from the live vendor boards on
 * 2026-10-03 (Appen, RWS, Remotasks, Toloka, CloudFactory, Remotive). On that
 * day exactly one posting across those boards was genuinely open to someone
 * in Cameroon; the rest are country- or language-locked, which is why these
 * rules are strict.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpiled)(require, module, module.exports);
  return module.exports;
}

const {
  evaluateCameroonEligibility,
  isLocationOpenToCameroon,
  refileEligibleAiTrainingJobs,
  AI_TRAINING_CATEGORY,
} = loadModule('lib/ai-training-jobs.ts');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}
const verdict = (title, location) => evaluateCameroonEligibility(title, location);

// ── Kept ────────────────────────────────────────────────────────────────
test('keeps the one real eligible posting from 2026-10-03 (Remotasks, Non-US)', () => {
  assert.deepEqual(verdict('Threat Intel - AI / LLM Trainer - Make Your Own Hours', 'Remote - Non-US'), { eligible: true });
});

test('keeps worldwide and "Any" locations', () => {
  assert.equal(verdict('Data Annotator', 'Worldwide').eligible, true);
  assert.equal(verdict('AI Trainer (French)', 'Any / Any').eligible, true);
});

test('keeps postings targeted at Cameroon or Africa, even when the title names Cameroon', () => {
  assert.equal(verdict('Gig Guru Wanted: Pay-by-Task Opportunities in Cameroon', 'Cameroon').eligible, true);
  assert.equal(verdict('Speech Data Collection Contributor (French - Cameroon)', 'Cameroon').eligible, true);
  assert.equal(verdict('AI Data Annotator', 'Remote - Africa').eligible, true);
});

test('keeps Cameroonian languages', () => {
  assert.equal(verdict('Fulfulde Speech Data Contributor', 'Any').eligible, true);
  assert.equal(verdict('Cameroonian Pidgin Transcription Expert', 'Worldwide').eligible, true);
});

// ── Dropped: country-locked ─────────────────────────────────────────────
test('drops French roles for residents of France (RWS)', () => {
  assert.deepEqual(verdict('Search Engine Evaluator - French (France)', 'Paris / Paris'), { eligible: false, reason: 'location' });
  assert.deepEqual(verdict('Speech AI Evaluation Specialist - French (France)', 'Paris / Paris'), { eligible: false, reason: 'location' });
});

test('drops neighbouring-country gigs — DRC/CAR/Nigeria are not Cameroon (Appen, Remotasks)', () => {
  assert.equal(verdict('Gig Guru Wanted: Pay-by-Task Opportunities in Democratic Republic of the Congo', 'Democratic Republic of the Congo').eligible, false);
  assert.equal(verdict('Gig Guru Wanted: Pay-by-Task Opportunities in the Central African Republic', 'Central African Republic').eligible, false);
  assert.equal(verdict('AI Training for Igbo Writers', 'Remote -  Nigeria').eligible, false);
});

test('drops "Remote" when the title pins another country (RWS)', () => {
  assert.deepEqual(verdict('Speech AI Evaluation Specialist - Data Collection (USA)', 'Remote / Remote'), {
    eligible: false,
    reason: 'country_in_title',
  });
});

test('drops multi-country lists that leave Cameroon out (Remotive)', () => {
  assert.equal(verdict('AI Response Evaluator', 'France, Japan, Turkey, Vietnam, Mexico, Norway').eligible, false);
  assert.equal(isLocationOpenToCameroon('EMEA'), false);
});

test('a missing location is not treated as open', () => {
  assert.deepEqual(verdict('Video Data Annotator', ''), { eligible: false, reason: 'location' });
  assert.deepEqual(verdict('AI Trainer Image QA Evaluator', null), { eligible: false, reason: 'location' });
});

// ── Dropped: language-locked ────────────────────────────────────────────
test('drops "Any"-location roles that need a language Cameroonians do not speak (Appen)', () => {
  for (const title of [
    'Czech Language Transcription Expert',
    'Greek Language Transcription Expert',
    'Hindi Language Transcription Expert',
    'Mandarin Chinese (Simplified) Language Transcription Expert',
    'Portuguese Language Transcription Expert',
  ]) {
    assert.deepEqual(verdict(title, 'Any / Any'), { eligible: false, reason: 'language' }, title);
  }
});

// ── Dropped: not AI-data work ───────────────────────────────────────────
test('drops vendor staff roles even when they mention the work', () => {
  assert.equal(verdict('Freelance AI Data Project Manager', 'Worldwide').eligible, false);
  assert.equal(verdict('Global Specialized Domain Expert Recruiter (Contractor)', 'Worldwide').eligible, false);
  assert.equal(verdict('Research Engineer, Coding Evaluation & Training Data', 'Worldwide').eligible, false);
  assert.equal(verdict('Accountant', 'Any').eligible, false);
});

// ── Re-filing general-feed jobs ─────────────────────────────────────────
test('re-files only eligible AI-training jobs from the general feeds into the AI tab', () => {
  const jobs = [
    { source: 'remotive', title: 'Data Annotator', location: 'Worldwide', category: 'Other', url: 'u1', external_id: '1' },
    { source: 'remotive', title: 'AI Response Evaluator', location: 'France, Japan', category: 'Other', url: 'u2', external_id: '2' },
    { source: 'remoteok', title: 'Senior React Developer', location: 'Worldwide', category: 'Engineering', url: 'u3', external_id: '3' },
  ];
  const out = refileEligibleAiTrainingJobs(jobs);
  assert.equal(out[0].category, AI_TRAINING_CATEGORY);
  assert.equal(out[1].category, 'Other');
  assert.equal(out[2].category, 'Engineering');
  assert.equal(jobs[0].category, 'Other', 'input is not mutated');
});

// ── Mercor (sitemap + job pages; eligibility from the listing record) ────
const {
  extractMercorEligibility,
  mercorListingOpenToCameroon,
  extractJobPostingLd,
  formatJobPostingPay,
  parseMercorSitemap,
} = loadModule('lib/ai-training-jobs.ts');

/** A job page shaped like Mercor's on 2026-10-03: JSON-LD block + embedded listing record. */
function mercorPage({ record, ld }) {
  const recordJson = JSON.stringify({ title: ld.title, location: 'Remote', ...record }).slice(1, -1);
  return `<html><head><script type="application/ld+json">${JSON.stringify(ld)}</script></head>` +
    `<body><script>self.__next_f.push([1,"..."]);{"listing":{${recordJson},"formId":null}}</script></body></html>`;
}
const OPEN_RECORD = {
  workArrangement: 'remote',
  eligibleLocation: null,
  eligibleResidenceLocation: null,
  ineligibleLocation: ['CUB', 'IRN', 'PRK', 'SYR', 'RUS', 'BLR', 'VEN'],
  ineligibleResidenceLocation: null,
  disableApplications: false,
  isPrivate: false,
};
const LD = (title, extra = {}) => ({ '@context': 'https://schema.org/', '@type': 'JobPosting', title, ...extra });
const open = (record, title = 'Multimodal Image Expert') =>
  mercorListingOpenToCameroon({ ...OPEN_RECORD, ...record }, title);

test('Mercor: trusts the listing record, not JSON-LD that mislabels open roles "US"', () => {
  // Real case: JSON-LD said US-only, the record was open to all but 7 sanctioned countries.
  const html = mercorPage({
    record: OPEN_RECORD,
    ld: LD('Multimodal Image Expert', {
      applicantLocationRequirements: [{ '@type': 'Country', name: 'US' }],
      jobLocationType: 'TELECOMMUTE',
    }),
  });
  const eligibility = extractMercorEligibility(html);
  assert.deepEqual(eligibility.ineligibleLocation, OPEN_RECORD.ineligibleLocation);
  assert.equal(mercorListingOpenToCameroon(eligibility, 'Multimodal Image Expert'), true);
});

test('Mercor: country allow-lists that leave Cameroon out are rejected', () => {
  assert.equal(open({ eligibleLocation: ['USA'] }), false);
  assert.equal(open({ eligibleLocation: ['USA', 'CAN', 'GBR'] }), false);
  assert.equal(open({ eligibleLocation: ['ZAF'] }), false, 'South Africa is not Cameroon');
  assert.equal(open({ eligibleResidenceLocation: ['CAN', 'USA'] }), false);
  assert.equal(open({ eligibleLocation: ['NGA', 'CMR'] }), true);
});

test('Mercor: Cameroon in a deny-list, on-site roles, closed or private listings are rejected', () => {
  assert.equal(open({ ineligibleLocation: ['CMR'] }), false);
  assert.equal(open({ ineligibleResidenceLocation: ['CMR'] }), false);
  assert.equal(open({ workArrangement: 'onsite' }), false);
  assert.equal(open({ disableApplications: true }), false);
  assert.equal(open({ isPrivate: true }), false);
});

test('Mercor: language rule still applies to open roles', () => {
  assert.equal(open({}, 'Audiobook QA Expert — French'), true);
  assert.equal(open({}, 'Bilingual French Generalist Expert — AI Safety'), true);
  assert.equal(open({}, 'Audiobook QA Expert — Japanese'), false);
});

test('Mercor: a page missing the record fields is not listed (fail closed)', () => {
  const html = `<script type="application/ld+json">${JSON.stringify(LD('Some Expert'))}</script>`;
  assert.equal(extractMercorEligibility(html), null);
});

test('Mercor: JSON-LD title and pay are read, ignoring malformed blocks', () => {
  const html =
    '<script type="application/ld+json">{not json</script>' +
    `<script type="application/ld+json">${JSON.stringify(
      LD('Nuclear Engineer, Fuel Cycle', {
        baseSalary: { currency: 'USD', value: { minValue: 65, maxValue: 75, unitText: 'HOUR' } },
      })
    )}</script>`;
  const ld = extractJobPostingLd(html);
  assert.equal(ld.title, 'Nuclear Engineer, Fuel Cycle');
  assert.equal(formatJobPostingPay(ld), '$65–75/hr');
  assert.equal(formatJobPostingPay(LD('x', { baseSalary: { currency: 'USD', value: { minValue: 100, maxValue: 100, unitText: 'HOUR' } } })), '$100/hr');
  assert.equal(formatJobPostingPay(LD('x')), null);
});

test('Mercor: sitemap yields only listing pages, newest first', () => {
  const xml = `<urlset>
    <url><loc>https://work.mercor.com/jobs/list_OLD/old-role</loc><lastmod>2026-09-01</lastmod></url>
    <url><loc>https://work.mercor.com/jobs/apply/interview-scheduled</loc><lastmod>2026-10-03</lastmod></url>
    <url><loc>https://work.mercor.com/jobs/list_NEW/new-role</loc><lastmod>2026-10-03</lastmod></url>
    <url><loc>https://work.mercor.com/explore</loc></url>
  </urlset>`;
  assert.deepEqual(parseMercorSitemap(xml), [
    'https://work.mercor.com/jobs/list_NEW/new-role',
    'https://work.mercor.com/jobs/list_OLD/old-role',
  ]);
});

console.log(`\nai-training-eligibility: ${passed} passed`);
