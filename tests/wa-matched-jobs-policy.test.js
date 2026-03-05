const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  const module = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(require, module, module.exports);
  return module.exports;
}

function run() {
  const policy = loadModule(path.join('lib', 'whatsapp-agent', 'matched-jobs-policy.ts'));

  const friday = new Date('2026-03-06T08:00:00.000Z');
  const thursday = new Date('2026-03-05T08:00:00.000Z');

  const freeThursday = policy.computeMatchedJobsEligibility('lead-1', {
    subscribed: false,
    lastMatchedJobsSentAt: null,
    lastMatchedJobsWeekKey: null,
    now: thursday,
  });
  assert.equal(freeThursday.eligible, false);
  assert.equal(freeThursday.reason, 'free_not_friday');
  console.log('ok - free blocked on non-friday');

  const freeFriday = policy.computeMatchedJobsEligibility('lead-1', {
    subscribed: false,
    lastMatchedJobsSentAt: null,
    lastMatchedJobsWeekKey: null,
    now: friday,
  });
  assert.equal(freeFriday.eligible, true);
  assert.equal(freeFriday.reason, 'ok');
  console.log('ok - free allowed on friday');

  const freeAlreadySent = policy.computeMatchedJobsEligibility('lead-1', {
    subscribed: false,
    lastMatchedJobsSentAt: '2026-03-06T07:00:00.000Z',
    lastMatchedJobsWeekKey: freeFriday.weekKey,
    now: friday,
  });
  assert.equal(freeAlreadySent.eligible, false);
  assert.equal(freeAlreadySent.reason, 'free_already_sent_week');
  console.log('ok - free once per week');

  const paidSoon = policy.computeMatchedJobsEligibility('lead-2', {
    subscribed: true,
    lastMatchedJobsSentAt: '2026-03-06T07:30:00.000Z',
    lastMatchedJobsWeekKey: null,
    now: new Date('2026-03-06T08:00:00.000Z'),
    subscriberFrequencyHours: 2,
  });
  assert.equal(paidSoon.eligible, false);
  assert.equal(paidSoon.reason, 'subscriber_too_soon');
  console.log('ok - subscriber frequency gate');

  const paidAllowed = policy.computeMatchedJobsEligibility('lead-2', {
    subscribed: true,
    lastMatchedJobsSentAt: '2026-03-06T01:00:00.000Z',
    lastMatchedJobsWeekKey: null,
    now: new Date('2026-03-06T08:00:00.000Z'),
    subscriberFrequencyHours: 2,
  });
  assert.equal(paidAllowed.eligible, true);
  assert.equal(paidAllowed.reason, 'ok');
  console.log('ok - subscriber allowed after frequency window');
}

try {
  run();
  console.log('All wa-matched-jobs policy tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}

