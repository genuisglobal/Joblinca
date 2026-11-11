const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativeParts, localRequire = require) {
  const source = fs.readFileSync(path.join(process.cwd(), ...relativeParts), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpiled)(localRequire, module, module.exports);
  return module.exports;
}

async function run() {
  const cfg = loadModule(['lib', 'whatsapp-agent', 'agent-config.ts']);
  const phone = '+237670000001';

  // Mode parsing: anything unrecognised is off, so a typo can never go live.
  assert.equal(cfg.readAgentConfig({}).mode, 'off');
  assert.equal(cfg.readAgentConfig({ WA_AGENT_MODE: ' Shadow ' }).mode, 'shadow');
  assert.equal(cfg.readAgentConfig({ WA_AGENT_MODE: 'ON' }).mode, 'on');
  assert.equal(cfg.readAgentConfig({ WA_AGENT_MODE: 'live' }).mode, 'off');
  console.log('ok - mode parsing defaults to off');

  // Percent is clamped and junk becomes 0.
  assert.equal(cfg.readAgentConfig({ WA_AGENT_ROLLOUT_PERCENT: '250' }).rolloutPercent, 100);
  assert.equal(cfg.readAgentConfig({ WA_AGENT_ROLLOUT_PERCENT: '-5' }).rolloutPercent, 0);
  assert.equal(cfg.readAgentConfig({ WA_AGENT_ROLLOUT_PERCENT: 'abc' }).rolloutPercent, 0);
  console.log('ok - rollout percent clamped');

  const route = (env) => cfg.decideAgentRoute(phone, cfg.readAgentConfig(env));

  assert.equal(route({ WA_AGENT_MODE: 'off', WA_AGENT_ALLOWLIST: phone }), 'off');
  assert.equal(route({ WA_AGENT_MODE: 'shadow' }), 'shadow');
  assert.equal(route({ WA_AGENT_MODE: 'on' }), 'off', 'on with 0% and no allowlist reaches nobody');
  assert.equal(route({ WA_AGENT_MODE: 'on', WA_AGENT_ROLLOUT_PERCENT: '100' }), 'live');
  console.log('ok - route by mode');

  // Allowlist matches regardless of formatting.
  assert.equal(route({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237 670 000 001, 123' }), 'live');
  assert.equal(route({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '237670000002' }), 'off');
  console.log('ok - allowlist ignores formatting');

  // Buckets are stable, format-insensitive, in range, and roughly even.
  assert.equal(cfg.rolloutBucket('+237 670-000-001'), cfg.rolloutBucket('237670000001'));
  const counts = new Array(10).fill(0);
  for (let i = 0; i < 5000; i += 1) {
    const bucket = cfg.rolloutBucket(`+2376${String(70000000 + i * 7919)}`);
    assert.ok(bucket >= 0 && bucket < 100);
    counts[Math.floor(bucket / 10)] += 1;
  }
  for (const count of counts) {
    assert.ok(count > 350 && count < 650, `uneven bucket spread: ${counts.join(',')}`);
  }
  // Raising the percentage only ever adds leads, never drops one.
  const at = (pct) => cfg.decideAgentRoute(phone, cfg.readAgentConfig({ WA_AGENT_MODE: 'on', WA_AGENT_ROLLOUT_PERCENT: String(pct) }));
  const firstLive = [...Array(101).keys()].find((pct) => at(pct) === 'live');
  for (let pct = firstLive; pct <= 100; pct += 1) assert.equal(at(pct), 'live');
  console.log('ok - rollout buckets stable and monotonic');

  // logAgentTurn never throws, caps text, and maps fields to columns.
  const log = loadModule(['lib', 'whatsapp-agent', 'agent-log.ts'], (id) => {
    if (id === '@/lib/supabase/service') return { createServiceSupabaseClient: () => null };
    return require(id);
  });
  let inserted = null;
  const okDb = { from: () => ({ insert: async (row) => { inserted = row; return { error: null }; } }) };
  await log.logAgentTurn(
    { leadId: 'l1', waMessageId: 'w1', route: 'shadow', outcome: 'agent', inboundText: 'x'.repeat(5000), replyText: 'hi' },
    okDb
  );
  assert.equal(inserted.lead_id, 'l1');
  assert.equal(inserted.route, 'shadow');
  assert.equal(inserted.inbound_text.length, 2000);
  assert.deepEqual(inserted.tool_calls, []);

  const errorDb = { from: () => ({ insert: async () => ({ error: { message: 'relation does not exist' } }) }) };
  const throwingDb = { from: () => { throw new Error('boom'); } };
  await log.logAgentTurn({ leadId: null, waMessageId: null, route: 'live', outcome: 'fallback', inboundText: null, replyText: null }, errorDb);
  await log.logAgentTurn({ leadId: null, waMessageId: null, route: 'live', outcome: 'fallback', inboundText: null, replyText: null }, throwingDb);
  console.log('ok - logAgentTurn caps text and never throws');
}

run()
  .then(() => console.log('All wa-agent config tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
