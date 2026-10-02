const assert = require('node:assert/strict');
const { loadTs, serviceClientStub } = require('./helpers/load-ts');

/**
 * Drive the real router entry point with the agent and the menu flow's
 * collaborators stubbed, and check who answers under each WA_AGENT_MODE.
 */
function loadRouter({ agentOutcome = { ok: true, reply: 'AGENT REPLY' }, state = 'idle' } = {}) {
  const calls = { sent: [], agentRuns: [], locks: 0, released: 0, stateUpdates: [] };
  const lead = {
    id: 'lead-1',
    phone_e164: '+237670000001',
    linked_user_id: null,
    conversation_state: state,
    role_selected: null,
    state_payload: {},
    views_month_count: 0,
    applies_month_count: 0,
    last_search_offset: 0,
    language: null,
  };

  const router = loadTs('lib/whatsapp-agent/router.ts', {
    '@/lib/supabase/service': serviceClientStub,
    '@/lib/whatsapp': { toE164: (v) => (v.startsWith('+') ? v : `+${v}`) },
    '@/lib/messaging/whatsapp': {
      sendWhatsappMessage: async (to, text) => calls.sent.push(text),
      sendWhatsappQuickReplies: async () => {},
    },
    '@/lib/whatsapp-screening/service': { handleWhatsAppScreeningInbound: async () => ({ handled: false }) },
    '@/lib/jobs/lifecycle': { resolveJobLifecycleStatus: () => 'on_hold' },
    '@/lib/whatsapp-agent/leads': {
      getOrCreateWaLead: async () => ({ ...lead }),
      syncLeadUserLink: async (l) => l,
      resolveWebsiteUserByPhone: async () => null,
      updateLeadState: async (...args) => calls.stateUpdates.push(args),
      setLeadLanguage: async () => {},
      saveLastSearch: async () => {},
      setLastSearchOffset: async () => {},
      incrementViewCounter: async () => {},
      incrementApplyCounter: async () => {},
      storePendingApply: async () => {},
      clearPendingApply: async () => {},
      getProfileRole: async () => null,
    },
    '@/lib/whatsapp-agent/ai-intent': {
      resolveInboundIntent: async () => ({ intent: 'unknown', language: 'en', detectedLanguage: null, source: 'deterministic' }),
    },
    '@/lib/whatsapp-agent/job-forward': {
      looksLikeForwardedJobPosting: () => false,
      storeForwardedJobPosting: async () => ({ stored: false }),
    },
    '@/lib/whatsapp-agent/job-search': {},
    '@/lib/whatsapp-agent/ai-screening-policy': {},
    '@/lib/whatsapp-agent/limits': {
      FREE_MONTHLY_APPLY_LIMIT: 4,
      FREE_MONTHLY_VIEW_LIMIT: 10,
      getWaLimitContext: async () => ({ subscribed: false }),
    },
    '@/lib/subscriptions': {},
    '@/lib/ai/client': { isAiConfigured: () => false, callAiText: async () => ({ text: '' }) },
    '@/lib/ai/policies': { buildRecruiterDescriptionSystemPrompt: () => '' },
    '@/lib/whatsapp-agent/agent/lock': {
      acquireLeadLock: async () => {
        calls.locks += 1;
        return { acquired: true, release: async () => { calls.released += 1; } };
      },
    },
    '@/lib/whatsapp-agent/agent/orchestrator': {
      DAILY_AGENT_TURN_CAP: 40,
      countRecentAgentTurns: async () => 0,
      isAgentEligible: () => true,
      runAgentForLead: async (params) => {
        calls.agentRuns.push(params.route);
        return agentOutcome;
      },
    },
  });

  return { router, calls };
}

function inbound(text) {
  return {
    message: { id: 'wamid.1', from: '237670000001', timestamp: '1760000000', type: 'text', text: { body: text } },
    textBody: text,
    conversationId: 'conv-1',
    conversationUserId: null,
    waPhone: '+237670000001',
  };
}

async function withMode(env, fn) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    await fn();
  } finally {
    for (const key of ['WA_AGENT_MODE', 'WA_AGENT_ALLOWLIST', 'WA_AGENT_ROLLOUT_PERCENT']) {
      if (key in saved) process.env[key] = saved[key];
      else delete process.env[key];
    }
  }
}

async function main() {
  await withMode({ WA_AGENT_MODE: 'off' }, async () => {
    const { router, calls } = loadRouter();
    await router.handleWhatsAppJobAgentInbound(inbound('hi'));
    assert.deepEqual(calls.agentRuns, []);
    assert.equal(calls.locks, 0);
    assert.equal(calls.sent.length, 1);
    assert.match(calls.sent[0], /^Welcome to JobLinca WhatsApp AI Agent\./, 'menu flow answered');
    console.log('ok - off: menu flow only, agent never runs');
  });

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237670000001' }, async () => {
    const { router, calls } = loadRouter();
    const result = await router.handleWhatsAppJobAgentInbound(inbound('any driver jobs?'));
    assert.equal(result.handled, true);
    assert.deepEqual(calls.agentRuns, ['live']);
    assert.deepEqual(calls.sent, ['AGENT REPLY'], 'only the agent replied');
    assert.equal(calls.locks, 1);
    assert.equal(calls.released, 1);
    console.log('ok - live: agent answers under the lead lock');
  });

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237670000001' }, async () => {
    const { router, calls } = loadRouter({ agentOutcome: { ok: false, reason: 'model_error: 429' } });
    const result = await router.handleWhatsAppJobAgentInbound(inbound('hi'));
    assert.equal(result.handled, true);
    assert.deepEqual(calls.agentRuns, ['live']);
    assert.equal(calls.sent.length >= 1, true, 'menu flow answered instead');
    assert.ok(!calls.sent.includes('AGENT REPLY'));
    assert.equal(calls.released, 1, 'lock released on fallback too');
    console.log('ok - live failure: menu flow answers, lock still released');
  });

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237699999999' }, async () => {
    const { router, calls } = loadRouter();
    await router.handleWhatsAppJobAgentInbound(inbound('hi'));
    assert.deepEqual(calls.agentRuns, [], 'not allowlisted, 0% rollout');
    console.log('ok - on: leads outside the cohort keep the menu flow');
  });

  await withMode({ WA_AGENT_MODE: 'shadow' }, async () => {
    const { router, calls } = loadRouter();
    await router.handleWhatsAppJobAgentInbound(inbound('hi'));
    assert.deepEqual(calls.agentRuns, ['shadow']);
    assert.ok(!calls.sent.includes('AGENT REPLY'), 'shadow reply is never sent');
    assert.equal(calls.locks, 0);
    console.log('ok - shadow: menu flow answers, agent runs afterwards unsent');
  });
}

main()
  .then(() => console.log('All wa-agent routing tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.stack : error);
    process.exit(1);
  });
