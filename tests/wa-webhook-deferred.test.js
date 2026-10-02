const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativeParts, localRequire) {
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

/**
 * Load the webhook route with every collaborator stubbed. `routeGate` holds
 * routing open until the test releases it, which is how we prove the 200 is
 * returned before routing finishes rather than after.
 */
function loadWebhook(options = {}) {
  const calls = { saved: [], routed: [], statuses: [], deferred: [] };
  let releaseRouting;
  const routeGate = new Promise((resolve) => {
    releaseRouting = resolve;
  });

  class NextResponse {
    constructor(body, init) {
      this.body = body;
      this.status = init?.status ?? 200;
    }
  }

  const stubs = {
    'next/server': { NextResponse },
    '@vercel/functions': {
      waitUntil: (promise) => calls.deferred.push(promise),
    },
    '@/lib/whatsapp': {
      verifySignature: () => options.signatureValid !== false,
      markRead: async () => {},
      extractTextBody: (msg) => msg.text?.body ?? null,
      toE164: (value) => `+${value}`,
    },
    '@/lib/whatsapp-db': {
      upsertConversation: async (from) => ({ id: `conv-${from}`, user_id: null }),
      setOptIn: async () => {},
      saveInboundMessage: async (msg) => {
        calls.saved.push(msg.id);
        return (options.duplicateIds || []).includes(msg.id) ? null : { id: `log-${msg.id}` };
      },
      saveStatusUpdate: async (status) => {
        calls.statuses.push(status.id);
      },
    },
    '@/lib/messaging/whatsapp': { sendWhatsappMessage: async () => {} },
    '@/lib/whatsapp-screening/service': {
      handleWhatsAppScreeningInbound: async () => ({ handled: false }),
    },
    '@/lib/whatsapp-agent/router': {
      handleWhatsAppJobAgentInbound: async (input) => {
        await routeGate;
        calls.routed.push(input.message.id);
        return { handled: true };
      },
    },
    '@/lib/whatsapp-agent/parser': { isOptOutCommand: () => false },
    '@/lib/skillup/drill-inbound': { handleDailyDrillReply: async () => ({ handled: false }) },
    '@/lib/pii-mask': { maskPII: (value) => value },
  };

  const route = loadModule(['app', 'api', 'whatsapp', 'webhook', 'route.ts'], (id) => {
    if (id in stubs) return stubs[id];
    return require(id);
  });

  return { route, calls, releaseRouting };
}

function makeRequest(payload) {
  const body = Buffer.from(JSON.stringify(payload));
  return {
    arrayBuffer: async () => body,
    headers: { get: () => 'sha256=stub' },
  };
}

function payloadWith(messages, statuses = []) {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        changes: [
          {
            field: 'messages',
            value: { contacts: [], messages, statuses },
          },
        ],
      },
    ],
  };
}

function textMessage(id, timestamp) {
  return { id, from: '237600000001', timestamp: String(timestamp), type: 'text', text: { body: 'hi' } };
}

async function run() {
  process.env.WHATSAPP_APP_SECRET = 'test-secret';

  {
    const { route, calls, releaseRouting } = loadWebhook();
    // If POST awaited routing, it would wait on routeGate forever; fail instead.
    // The timer must stay ref'd: an unref'd one lets node exit 0 mid-test.
    let timer;
    const response = await Promise.race([
      route.POST(
        makeRequest(payloadWith([textMessage('m1', 100)], [{ id: 's1', timestamp: '101' }]))
      ),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('POST waited for routing before returning 200')),
          2000
        );
      }),
    ]);
    clearTimeout(timer);

    assert.equal(response.status, 200);
    assert.deepEqual(calls.saved, ['m1'], 'message is persisted before the 200');
    assert.deepEqual(calls.routed, [], 'routing has not finished when the 200 goes out');
    assert.equal(calls.deferred.length, 1, 'routing is handed to waitUntil');

    releaseRouting();
    await Promise.all(calls.deferred);
    assert.deepEqual(calls.routed, ['m1']);
    assert.deepEqual(calls.statuses, ['s1']);
    console.log('ok - 200 returned before routing; routing completes in waitUntil');
  }

  {
    const { route, calls, releaseRouting } = loadWebhook({ duplicateIds: ['dup'] });
    releaseRouting();
    await route.POST(makeRequest(payloadWith([textMessage('dup', 100), textMessage('new', 101)])));
    await Promise.all(calls.deferred);
    assert.deepEqual(calls.saved, ['dup', 'new']);
    assert.deepEqual(calls.routed, ['new'], 'a redelivered message is never routed twice');
    console.log('ok - duplicate deliveries are dropped before routing');
  }

  {
    const { route, calls, releaseRouting } = loadWebhook();
    releaseRouting();
    await route.POST(
      makeRequest(payloadWith([textMessage('late', 300), textMessage('early', 100), textMessage('mid', 200)]))
    );
    await Promise.all(calls.deferred);
    assert.deepEqual(calls.routed, ['early', 'mid', 'late']);
    console.log('ok - messages are routed in delivery order');
  }

  {
    const { route, calls } = loadWebhook({ signatureValid: false });
    const response = await route.POST(makeRequest(payloadWith([textMessage('m1', 100)])));
    assert.equal(response.status, 401);
    assert.deepEqual(calls.saved, []);
    assert.equal(calls.deferred.length, 0);
    console.log('ok - bad signature is rejected before anything is persisted');
  }
}

run()
  .then(() => console.log('All wa-webhook deferred tests passed.'))
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
