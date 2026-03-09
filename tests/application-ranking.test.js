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
  const ranking = loadModule(path.join('lib', 'applications', 'ranking.ts'));

  const explanation = ranking.summarizeRankingExplanation({
    rankingScore: 82,
    rankingBreakdown: {
      ai_match: 15,
      completeness: 12,
      stage_score: 10,
      feedback_signal: 6,
      eligibility: 10,
      decision: 0,
      rating: 8,
      recency: 12,
    },
    recruiterRating: 4,
    overallStageScore: 78,
    eligibilityStatus: 'eligible',
    currentStageType: 'interview',
  });

  assert.equal(explanation.label, 'High priority');
  assert.equal(explanation.tone, 'positive');
  assert.match(explanation.signals.map((signal) => signal.label).join(' '), /Eligibility confirmed/);
  console.log('ok - ranking explanation highlights strong ATS positives');

  const weakExplanation = ranking.summarizeRankingExplanation({
    rankingScore: 24,
    rankingBreakdown: {
      ai_match: 0,
      completeness: 0,
      stage_score: 0,
      feedback_signal: -6,
      eligibility: -10,
      decision: -8,
      rating: 0,
      recency: 6,
    },
    eligibilityStatus: 'ineligible',
    decisionStatus: 'rejected',
    currentStageType: 'applied',
  });

  assert.equal(weakExplanation.label, 'Lower priority');
  assert.equal(weakExplanation.tone, 'negative');
  assert.match(
    weakExplanation.signals.map((signal) => signal.label).join(' '),
    /Eligibility blocked/
  );
  console.log('ok - ranking explanation highlights blocking ATS negatives');

  const analytics = ranking.summarizeRecruiterAnalytics([
    {
      decisionStatus: 'hired',
      eligibilityStatus: 'eligible',
      rankingScore: 88,
      rankingBreakdown: { ai_match: 14 },
      overallStageScore: 82,
      viewedAt: '2026-03-08T10:00:00.000Z',
      currentStageType: 'hire',
    },
    {
      decisionStatus: null,
      eligibilityStatus: 'needs_review',
      rankingScore: 54,
      rankingBreakdown: { ai_match: 8 },
      overallStageScore: 61,
      viewedAt: null,
      currentStageType: 'review',
    },
    {
      decisionStatus: 'rejected',
      eligibilityStatus: 'ineligible',
      rankingScore: 19,
      rankingBreakdown: { ai_match: 2 },
      overallStageScore: 20,
      viewedAt: '2026-03-08T11:00:00.000Z',
      currentStageType: 'rejected',
    },
  ]);

  assert.equal(analytics.totalApplications, 3);
  assert.equal(analytics.unreadCount, 1);
  assert.equal(analytics.eligibleCount, 1);
  assert.equal(analytics.needsReviewCount, 1);
  assert.equal(analytics.ineligibleCount, 1);
  assert.equal(analytics.hiredCount, 1);
  assert.equal(analytics.rejectedCount, 1);
  assert.equal(analytics.advancedStageCount, 1);
  assert.equal(Math.round(analytics.averageAiMatch), 8);
  console.log('ok - recruiter analytics aggregate ATS outcome signals');

  const timeline = ranking.buildRecruiterAnalyticsTimeline(
    [
      {
        createdAt: '2026-03-08T10:00:00.000Z',
        decisionStatus: 'hired',
        eligibilityStatus: 'eligible',
        viewedAt: '2026-03-08T11:00:00.000Z',
        currentStageType: 'hire',
      },
      {
        createdAt: '2026-03-06T10:00:00.000Z',
        decisionStatus: null,
        eligibilityStatus: 'eligible',
        viewedAt: null,
        currentStageType: 'interview',
      },
      {
        createdAt: '2026-02-20T10:00:00.000Z',
        decisionStatus: 'rejected',
        eligibilityStatus: 'ineligible',
        viewedAt: '2026-02-20T12:00:00.000Z',
        currentStageType: 'rejected',
      },
    ],
    '7d',
    new Date('2026-03-08T12:00:00.000Z')
  );

  assert.equal(timeline.windowDays, 7);
  assert.equal(timeline.bucketSpanDays, 1);
  assert.equal(timeline.totals.applications, 2);
  assert.equal(timeline.totals.eligible, 2);
  assert.equal(timeline.totals.hired, 1);
  assert.equal(timeline.totals.advanced, 2);
  assert.equal(timeline.totals.unread, 1);
  console.log('ok - recruiter analytics timeline buckets respect selected window');

  const funnelTimeline = ranking.buildRecruiterFunnelTimeline(
    [
      { createdAt: '2026-03-08T10:00:00.000Z', type: 'apply' },
      { createdAt: '2026-03-08T10:00:00.000Z', type: 'eligible' },
      { createdAt: '2026-03-07T10:00:00.000Z', type: 'interview' },
      { createdAt: '2026-03-05T10:00:00.000Z', type: 'offer' },
      { createdAt: '2026-03-04T10:00:00.000Z', type: 'hire' },
      { createdAt: '2026-02-01T10:00:00.000Z', type: 'apply' },
    ],
    '7d',
    new Date('2026-03-08T12:00:00.000Z')
  );

  assert.equal(funnelTimeline.totals.apply, 1);
  assert.equal(funnelTimeline.totals.eligible, 1);
  assert.equal(funnelTimeline.totals.interview, 1);
  assert.equal(funnelTimeline.totals.offer, 1);
  assert.equal(funnelTimeline.totals.hire, 1);
  console.log('ok - recruiter funnel timeline uses stage events within selected window');

  const conversions = ranking.summarizeFunnelConversions({
    apply: 20,
    eligible: 10,
    interview: 5,
    offer: 2,
    hire: 1,
  });

  assert.equal(conversions.eligibilityFromApply, 50);
  assert.equal(conversions.interviewFromEligible, 50);
  assert.equal(conversions.offerFromInterview, 40);
  assert.equal(conversions.hireFromOffer, 50);
  assert.equal(conversions.hireFromApply, 5);
  console.log('ok - funnel conversion percentages are derived from event totals');

  const segmented = ranking.summarizeSegmentedFunnel(
    [
      {
        createdAt: '2026-03-08T10:00:00.000Z',
        type: 'apply',
        segmentKey: 'native',
        segmentLabel: 'Native',
      },
      {
        createdAt: '2026-03-08T10:00:00.000Z',
        type: 'eligible',
        segmentKey: 'native',
        segmentLabel: 'Native',
      },
      {
        createdAt: '2026-03-07T10:00:00.000Z',
        type: 'hire',
        segmentKey: 'native',
        segmentLabel: 'Native',
      },
      {
        createdAt: '2026-03-06T10:00:00.000Z',
        type: 'apply',
        segmentKey: 'whatsapp',
        segmentLabel: 'WhatsApp',
      },
      {
        createdAt: '2026-03-05T10:00:00.000Z',
        type: 'interview',
        segmentKey: 'whatsapp',
        segmentLabel: 'WhatsApp',
      },
      {
        createdAt: '2026-02-01T10:00:00.000Z',
        type: 'apply',
        segmentKey: 'external',
        segmentLabel: 'External',
      },
    ],
    '7d',
    new Date('2026-03-08T12:00:00.000Z')
  );

  assert.equal(segmented.length, 2);
  assert.equal(segmented[0].key, 'native');
  assert.equal(segmented[0].totals.apply, 1);
  assert.equal(segmented[0].totals.hire, 1);
  assert.equal(segmented[0].conversions.eligibilityFromApply, 100);
  assert.equal(segmented[0].conversions.hireFromApply, 100);
  assert.equal(segmented[1].key, 'whatsapp');
  assert.equal(segmented[1].totals.interview, 1);
  console.log('ok - segmented funnel summaries group and filter event windows correctly');
}

try {
  run();
  console.log('All application ranking tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
