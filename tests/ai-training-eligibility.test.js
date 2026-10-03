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

console.log(`\nai-training-eligibility: ${passed} passed`);
