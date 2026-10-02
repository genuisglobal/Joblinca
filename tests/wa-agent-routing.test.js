const assert = require('node:assert/strict');
const { loadTs } = require('./helpers/load-ts');

/**
 * Drive the real router entry point with the agent and the menu flow's
 * collaborators stubbed, and check who answers under each WA_AGENT_MODE.
 */
function loadRouter({
  agentOutcome = { ok: true, reply: 'AGENT REPLY' },
  state = 'idle',
  pausedUntil = null,
  admins = [],
  transcript = 'any driver jobs in Douala?',
  eligible = (l, text) => !/^stop$/i.test(text.trim()),
  linkedUserId = null,
  role = null,
} = {}) {
  const calls = { sent: [], agentRuns: [], agentTexts: [], locks: 0, released: 0, stateUpdates: [], alerts: [], pauses: [], downloads: 0 };
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
    agent_paused_until: pausedUntil,
    handoff_reason: null,
  };

  const router = loadTs('lib/whatsapp-agent/router.ts', {
    // Only profile-name lookups reach the database in these paths; answer "none".
    '@/lib/supabase/service': {
      createServiceSupabaseClient: () => {
        const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: null, error: null }) };
        return { from: () => chain };
      },
    },
    '@/lib/whatsapp': { toE164: (v) => (v.startsWith('+') ? v : `+${v}`) },
    '@/lib/messaging/whatsapp': {
      sendWhatsappMessage: async (to, text) => calls.sent.push(text),
      sentTo: null,
      sendWhatsappQuickReplies: async () => {},
    },
    '@/lib/whatsapp-screening/service': { handleWhatsAppScreeningInbound: async () => ({ handled: false }) },
    '@/lib/jobs/lifecycle': { resolveJobLifecycleStatus: () => 'on_hold' },
    '@/lib/whatsapp-agent/leads': {
      getOrCreateWaLead: async () => ({ ...lead }),
      syncLeadUserLink: async (l, id) => ({ ...l, linked_user_id: id, has_website_account: Boolean(id) }),
      resolveWebsiteUserByPhone: async () => linkedUserId,
      updateLeadState: async (...args) => calls.stateUpdates.push(args),
      setLeadLanguage: async () => {},
      saveLastSearch: async () => {},
      setLastSearchOffset: async () => {},
      incrementViewCounter: async () => {},
      incrementApplyCounter: async () => {},
      storePendingApply: async () => {},
      clearPendingApply: async () => {},
      getProfileRole: async () => role,
      isLeadPaused: (l) => Boolean(l.agent_paused_until) && new Date(l.agent_paused_until).getTime() > Date.now(),
      setLeadPause: async (...args) => calls.pauses.push(args),
      findWaLeadByPhone: async (phone) => (phone === lead.phone_e164 ? { ...lead } : null),
    },
    '@/lib/admin-alerts': {
      isAdminAlertRecipient: (phone) => admins.includes(phone),
      sendAdminWhatsAppAlert: async (message) => {
        calls.alerts.push(message);
        return { configured: true, sent: 1, failed: 0 };
      },
    },
    '@/lib/whatsapp-agent/ai-intent': {
      resolveInboundIntent: async () => ({ intent: 'unknown', language: 'en', detectedLanguage: null, source: 'deterministic' }),
    },
    '@/lib/whatsapp-agent/job-forward': {
      looksLikeForwardedJobPosting: () => false,
      storeForwardedJobPosting: async () => ({ stored: false }),
    },
    '@/lib/whatsapp-agent/job-search': { getJobByPublicId: async () => null },
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
      // Mirrors the real rule that matters here: STOP is never the agent's.
      isAgentEligible: eligible,
      defaultMediaDeps: {
        download: async () => {
          calls.downloads += 1;
          return { buffer: new ArrayBuffer(4), mimeType: 'audio/ogg', size: 4 };
        },
        transcribe: async () => transcript,
        storeResume: async () => ({ status: 'stored', resumeUrl: 'https://x/cv.pdf' }),
        recordTranscript: async () => {},
        registerUrl: () => 'https://joblinca.com/auth/register',
        profileUrl: 'https://joblinca.com/dashboard/job-seeker/profile',
      },
      runAgentForLead: async (params) => {
        calls.agentRuns.push(params.route);
        calls.agentTexts.push(params.inboundText);
        return agentOutcome;
      },
    },
  });

  return { router, calls };
}

function inbound(text, from = '237670000001') {
  return {
    message: { id: 'wamid.1', from, timestamp: '1760000000', type: 'text', text: { body: text } },
    textBody: text,
    conversationId: 'conv-1',
    conversationUserId: null,
    waPhone: `+${from}`,
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

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237670000001' }, async () => {
    const { router, calls } = loadRouter({
      agentOutcome: { ok: true, reply: 'Applying now...', followUp: { type: 'apply', publicId: 'JL-001002' } },
    });
    await router.handleWhatsAppJobAgentInbound(inbound('apply to the 2nd one'));
    assert.equal(calls.sent[0], 'Applying now...');
    assert.match(calls.sent[1], /^Job not found/, 'the existing APPLY handler ran after the reply');
    console.log('ok - apply follow-up runs the existing APPLY handler after the agent reply');
  });

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237670000001' }, async () => {
    const future = new Date(Date.now() + 3600000).toISOString();
    const { router, calls } = loadRouter({ pausedUntil: future });
    const result = await router.handleWhatsAppJobAgentInbound(inbound('hello? anyone there?'));
    assert.equal(result.handled, true);
    assert.deepEqual(calls.sent, [], 'bot is silent while a human has the chat');
    assert.deepEqual(calls.agentRuns, []);
    assert.match(calls.alerts[0], /^💬 \+237670000001: hello\? anyone there\?/);
    assert.match(calls.alerts[0], /REPLY \+237670000001/);

    const stop = loadRouter({ pausedUntil: future });
    const stopResult = await stop.router.handleWhatsAppJobAgentInbound(inbound('STOP'));
    assert.equal(stopResult.reason, 'delegated', 'STOP still reaches the opt-out handler');
    console.log('ok - paused lead: silent, forwarded to admins, STOP still works');
  });

  await withMode({ WA_AGENT_MODE: 'off' }, async () => {
    const admin = '237699000000';
    const { router, calls } = loadRouter({ admins: ['+237699000000'] });
    await router.handleWhatsAppJobAgentInbound(inbound('REPLY +237670000001 Hi Ada, I can help with that.', admin));
    assert.equal(calls.sent[0], '👤 JobLinca team: Hi Ada, I can help with that.');
    assert.match(calls.sent[1], /^✓ Sent to \+237670000001/);
    assert.equal(calls.pauses.length, 1, 'reply extends the pause');

    const resume = loadRouter({ admins: ['+237699000000'] });
    await resume.router.handleWhatsAppJobAgentInbound(inbound('RESUME +237670000001', admin));
    assert.deepEqual(resume.calls.pauses[0].slice(1), [null, null]);
    assert.match(resume.calls.sent[0], /back with the JobLinca assistant/);
    assert.match(resume.calls.sent[1], /is back with the bot/);

    const notAdmin = loadRouter({ admins: ['+237699000000'] });
    await notAdmin.router.handleWhatsAppJobAgentInbound(inbound('REPLY +237670000001 you have won', '237655555555'));
    assert.ok(!notAdmin.calls.sent.some((m) => m.includes('JobLinca team')), 'non-admins cannot relay');
    console.log('ok - admin REPLY relays and extends pause, RESUME hands back, non-admins ignored');
  });

  // ── media ───────────────────────────────────────────────────────────────
  const voice = (from = '237670000001') => ({
    message: { id: 'wamid.v', from, timestamp: '1760000000', type: 'audio', audio: { id: 'media-1', mime_type: 'audio/ogg' } },
    textBody: null,
    conversationId: 'conv-1',
    conversationUserId: null,
    waPhone: `+${from}`,
  });
  const cv = {
    ...voice(),
    message: { id: 'wamid.d', from: '237670000001', timestamp: '1760000000', type: 'document', document: { id: 'media-2', mime_type: 'application/pdf', filename: 'cv.pdf' } },
  };

  await withMode({ WA_AGENT_MODE: 'off' }, async () => {
    const { router, calls } = loadRouter();
    const result = await router.handleWhatsAppJobAgentInbound(voice());
    assert.equal(result.reason, 'not_text');
    assert.equal(calls.downloads, 0);
    assert.deepEqual(calls.sent, []);
  });
  await withMode({ WA_AGENT_MODE: 'shadow' }, async () => {
    const { router, calls } = loadRouter();
    assert.equal((await router.handleWhatsAppJobAgentInbound(voice())).reason, 'not_text', 'shadow never pays for transcription');
    assert.equal(calls.downloads, 0);
  });
  console.log('ok - media untouched when the agent is off or in shadow');

  await withMode({ WA_AGENT_MODE: 'on', WA_AGENT_ALLOWLIST: '+237670000001' }, async () => {
    const { router, calls } = loadRouter();
    await router.handleWhatsAppJobAgentInbound(voice());
    assert.deepEqual(calls.agentTexts, ['any driver jobs in Douala?'], 'agent answers the transcript');
    assert.deepEqual(calls.sent, ['AGENT REPLY']);

    const doc = loadRouter({ linkedUserId: 'u1', role: 'job_seeker' });
    await doc.router.handleWhatsAppJobAgentInbound(cv);
    assert.deepEqual(doc.calls.agentRuns, [], 'CVs are handled without the model');
    assert.match(doc.calls.sent[0], /^✅ CV saved/);

    // A spoken exact command still goes to its deterministic handler.
    const spoken = loadRouter({ transcript: 'APPLY JL-001002', eligible: () => false });
    await spoken.router.handleWhatsAppJobAgentInbound(voice());
    assert.deepEqual(spoken.calls.agentRuns, []);
    assert.match(spoken.calls.sent[0], /^Job not found/, 'menu flow saw the transcript as text');
  });
  console.log('ok - live: voice notes become text, CVs saved, spoken commands stay deterministic');

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
