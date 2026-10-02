const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

const baseStubs = {
  '@/lib/subscriptions': { getUserSubscription: async () => ({ isActive: false }) },
  '@/lib/supabase/service': serviceClientStub,
};

const runTurn = loadTs('lib/whatsapp-agent/agent/run-turn.ts', baseStubs);

function job(n) {
  return { id: `id-${n}`, public_id: `JL-${1000 + n}`, title: `Driver ${n}`, company_name: 'Co', location: 'Douala', salary: null, description: '', closes_at: null };
}

function deps(jobs = [job(1), job(2)]) {
  return {
    searchWithWidening: async (query) => ({ jobs, query, widened: [] }),
    rankedSearch: async () => [],
    getJobByPublicId: async () => null,
    getJobById: async (id) => jobs.find((j) => j.id === id) || null,
    saveLastSearch: async () => {},
    setLastSearchOffset: async () => {},
    incrementViewCounter: async () => {},
    createSignupInvite: async () => ({ status: 'invalid', reason: 'email' }),
    buildRegisterUrl: () => 'https://joblinca.com/auth/register',
    menuMessage: () => 'MENU',
  };
}

/** A scripted model: each call returns the next step, recording what it saw. */
function scriptedModel(steps) {
  const seen = [];
  const fn = async (options) => {
    // Snapshot: the loop keeps appending to the same array after the call.
    seen.push({ ...options, messages: [...options.messages] });
    const step = steps[seen.length - 1];
    if (!step) throw new Error('model called more times than scripted');
    if (step instanceof Error) throw step;
    return { model: 'gpt-4o-mini', promptTokens: 100, completionTokens: 20, text: null, toolCalls: [], ...step };
  };
  fn.seen = seen;
  return fn;
}

function input(callModel, extra = {}) {
  return {
    lead: { id: 'lead-1', phone_e164: '+237670000001', linked_user_id: 'u1', views_month_count: 0, last_search_offset: 0, pending_apply_job_public_id: null },
    inboundText: 'any driver jobs in Douala?',
    history: [{ role: 'user', content: 'hello' }, { role: 'assistant', content: 'Hi! What job are you looking for?' }],
    memory: {},
    language: 'en',
    subscribed: false,
    firstName: 'Ada',
    dryRun: false,
    deps: deps(),
    allowedLinkOrigins: ['https://joblinca.com'],
    callModel,
    ...extra,
  };
}

async function main() {
  {
    const model = scriptedModel([
      { toolCalls: [{ id: 'c1', name: 'search_jobs', arguments: '{"role":"driver","location":"Douala"}' }] },
      { text: 'Here are driver jobs in Douala. Details at https://evil.example/x or https://joblinca.com/jobs' },
    ]);
    const outcome = await runTurn.runAgentTurn(input(model));
    assert.equal(outcome.ok, true, outcome.reason);
    assert.equal(outcome.nextState, 'agent');
    assert.ok(outcome.reply.startsWith('Here are driver jobs in Douala.'));
    assert.ok(!outcome.reply.includes('evil.example'), 'foreign link stripped');
    assert.ok(outcome.reply.includes('https://joblinca.com/jobs'), 'own-site link kept');
    assert.match(outcome.reply, /1\. Driver 1/, 'job list attached after the text');
    assert.equal(outcome.memory.lastResults.length, 2);
    assert.deepEqual(outcome.toolCalls.map((c) => [c.name, c.ok]), [['search_jobs', true]]);
    assert.equal(outcome.promptTokens, 200);

    // What the model saw: system prompt, history, then the new message, then the tool result.
    const first = model.seen[0].messages;
    assert.equal(first[0].role, 'system');
    assert.match(first[0].content, /first name: Ada/);
    assert.deepEqual(first.slice(1).map((m) => m.role), ['user', 'assistant', 'user']);
    const second = model.seen[1].messages;
    assert.equal(second.at(-1).role, 'tool');
    assert.equal(second.at(-1).toolCallId, 'c1');
    assert.match(second.at(-1).content, /"status":"shown"/);
    console.log('ok - search turn: tool result fed back, list attached, foreign links stripped');
  }

  {
    const outcome = await runTurn.runAgentTurn(input(scriptedModel([new Error('OpenAI call failed (429): quota')])));
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /^model_error: OpenAI call failed \(429\)/);
    console.log('ok - model error falls back with the reason recorded');
  }

  {
    const loop = { toolCalls: [{ id: 'x', name: 'show_menu', arguments: '{}' }] };
    const outcome = await runTurn.runAgentTurn(input(scriptedModel([loop, loop, loop, loop])));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'too_many_tool_rounds');
    console.log('ok - endless tool calling is cut off');
  }

  {
    let clock = 0;
    const slowModel = async () => {
      clock += 19000;
      return { model: 'm', promptTokens: 1, completionTokens: 1, text: null, toolCalls: [{ id: 'a', name: 'show_menu', arguments: '{}' }] };
    };
    const outcome = await runTurn.runAgentTurn(input(slowModel, { now: () => clock }));
    assert.equal(outcome.ok, false);
    assert.equal(outcome.reason, 'turn_budget_exhausted');
    console.log('ok - turn budget stops a slow model before the webhook deadline');
  }

  {
    const throwingDeps = { ...deps(), searchWithWidening: async () => { throw new Error('db down'); } };
    const model = scriptedModel([{ toolCalls: [{ id: 'c1', name: 'search_jobs', arguments: '{}' }] }]);
    const outcome = await runTurn.runAgentTurn(input(model, { deps: throwingDeps }));
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /^tool_error:search_jobs: db down/);
    console.log('ok - a tool exception falls back instead of replying half-done');
  }

  {
    const model = scriptedModel([
      { toolCalls: [{ id: 'm', name: 'show_menu', arguments: '{}' }] },
      { text: 'Here is the menu.' },
    ]);
    const outcome = await runTurn.runAgentTurn(input(model));
    assert.equal(outcome.nextState, 'menu');
    assert.equal(outcome.reply, 'Here is the menu.\n\nMENU');
    console.log('ok - show_menu hands the conversation back to the numbered menu');
  }

  // ── eligibility ───────────────────────────────────────────────────────────
  const orchestrator = loadTs('lib/whatsapp-agent/agent/orchestrator.ts', {
    ...baseStubs,
    '@/lib/whatsapp-agent/leads': {},
    '@/lib/field-registration/service': {},
    '@/lib/whatsapp-agent/job-search': {},
    '@/lib/whatsapp-agent/agent-log': {},
    '@/lib/ai/client': {},
    '@/lib/i18n/server-t': { getServerT: () => (key) => key },
    './search': {},
    './history': {},
    './run-turn': {},
  });
  const eligible = (state, text) => orchestrator.isAgentEligible({ conversation_state: state }, text);
  assert.equal(eligible('idle', 'hi'), true);
  assert.equal(eligible('agent', '2'), true, 'a number after an agent list is the agent\'s');
  assert.equal(eligible('menu', '2'), false, 'a number at the numbered menu is a menu choice');
  assert.equal(eligible('menu', 'driver jobs in Buea'), true);
  assert.equal(eligible('jobseeker.awaiting_location_town', 'actually show me drivers'), true);
  assert.equal(eligible('recruiter.awaiting_salary', '150000'), false);
  assert.equal(eligible('agent', 'APPLY JL-1001'), false);
  assert.equal(eligible('agent', 'DETAILS JL-1001'), false);
  assert.equal(eligible('agent', 'NEXT'), false);
  assert.equal(eligible('agent', 'STOP'), false);
  console.log('ok - eligibility keeps commands, recruiter forms and menu digits deterministic');

  // ── lock ──────────────────────────────────────────────────────────────────
  const lock = loadTs('lib/whatsapp-agent/agent/lock.ts', baseStubs);
  function fakeLockDb(attemptsBeforeFree, { error } = {}) {
    const calls = { attempts: 0, released: 0 };
    const db = {
      from: () => ({
        update: (values) => {
          const chain = {
            eq: () => chain,
            or: () => chain,
            select: async () => {
              calls.attempts += 1;
              if (error) return { data: null, error: { message: error } };
              return { data: calls.attempts > attemptsBeforeFree ? [{ id: 'lead-1' }] : [], error: null };
            },
            then: (resolve) => {
              if (values.agent_lock_until === null) calls.released += 1;
              resolve({ error: null });
            },
          };
          return chain;
        },
      }),
    };
    return { db, calls };
  }
  {
    const { db, calls } = fakeLockDb(2);
    const held = await lock.acquireLeadLock('lead-1', { db, sleep: async () => {} });
    assert.equal(held.acquired, true);
    assert.equal(calls.attempts, 3, 'waited for the current holder');
    await held.release();
    assert.equal(calls.released, 1);

    let t = 0;
    const stuck = fakeLockDb(Infinity);
    const timedOut = await lock.acquireLeadLock('lead-1', { db: stuck.db, sleep: async () => { t += 400; }, now: () => t });
    assert.equal(timedOut.acquired, false, 'gives up after the wait budget and runs unlocked');

    const missing = fakeLockDb(0, { error: 'column "agent_lock_until" does not exist' });
    const open = await lock.acquireLeadLock('lead-1', { db: missing.db, sleep: async () => {} });
    assert.equal(open.acquired, false);
    assert.equal(missing.calls.attempts, 1, 'fails open immediately when the lease column is missing');
    console.log('ok - lease waits, times out, and fails open');
  }
}

main()
  .then(() => console.log('All wa-agent run-turn tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
