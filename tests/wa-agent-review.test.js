const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

const review = loadTs('lib/whatsapp-agent/agent-review.ts', { '@/lib/supabase/service': serviceClientStub });

function main() {
  assert.deepEqual(review.parseReviewFilters({}), { range: '7d', route: 'all', outcome: 'all', phone: null, page: 1 });
  assert.deepEqual(
    review.parseReviewFilters({ range: '24h', route: 'shadow', outcome: 'fallback', phone: '+237 670 000 001', page: '3' }),
    { range: '24h', route: 'shadow', outcome: 'fallback', phone: '+237670000001', page: 3 }
  );
  assert.deepEqual(
    review.parseReviewFilters({ range: '1y', route: 'drop table', outcome: ['agent', 'x'], phone: '12', page: '-4' }),
    { range: '7d', route: 'all', outcome: 'agent', phone: null, page: 1 },
    'junk falls back to defaults'
  );
  console.log('ok - filters parse defensively');

  assert.equal(review.normalizeFallbackReason('model_error: OpenAI call failed (429): {"error":"quota"}'), 'model_error (429)');
  assert.equal(review.normalizeFallbackReason('tool_error:search_jobs: db down'), 'tool_error (search_jobs)');
  assert.equal(review.normalizeFallbackReason('turn_budget_exhausted'), 'turn_budget_exhausted');
  assert.equal(review.normalizeFallbackReason(null), 'unknown');
  console.log('ok - fallback reasons grouped');

  const rows = [
    { lead_id: 'a', route: 'shadow', outcome: 'agent', latency_ms: 1000, prompt_tokens: 1000, completion_tokens: 100, tool_calls: [{ name: 'search_jobs', ok: true }] },
    { lead_id: 'a', route: 'shadow', outcome: 'agent', latency_ms: 3000, prompt_tokens: 1000, completion_tokens: 100, tool_calls: [{ name: 'search_jobs', ok: true }, { name: 'job_details', ok: false }] },
    { lead_id: 'b', route: 'live', outcome: 'fallback', fallback_reason: 'model_error: OpenAI call failed (429): x', latency_ms: 9000, prompt_tokens: 0, completion_tokens: 0, tool_calls: [] },
    { lead_id: 'c', route: 'live', outcome: 'fallback', fallback_reason: 'model_error: OpenAI call failed (429): y', latency_ms: null, prompt_tokens: null, completion_tokens: null, tool_calls: null },
  ];
  const s = review.summarizeTurns(rows, false);
  assert.equal(s.total, 4);
  assert.deepEqual(s.byRoute, { shadow: 2, live: 2 });
  assert.equal(s.fallbackRate, 0.5);
  assert.deepEqual(s.fallbackReasons, [{ reason: 'model_error (429)', count: 2 }]);
  assert.deepEqual(s.tools, [{ name: 'search_jobs', count: 2, failed: 0 }, { name: 'job_details', count: 1, failed: 1 }]);
  assert.equal(s.latencyAvgMs, 4333);
  assert.equal(s.latencyP95Ms, 9000);
  assert.equal(s.distinctLeads, 3);
  assert.equal(s.promptTokens, 2000);
  assert.ok(Math.abs(s.estimatedCostUsd - (2000 * 0.15 + 200 * 0.6) / 1e6) < 1e-12);

  const empty = review.summarizeTurns([], false);
  assert.equal(empty.fallbackRate, 0);
  assert.equal(empty.latencyAvgMs, null);
  console.log('ok - summary maths: rates, reasons, tools, latency, cost');
}

try {
  main();
  console.log('All wa-agent review tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.stack : error);
  process.exit(1);
}
