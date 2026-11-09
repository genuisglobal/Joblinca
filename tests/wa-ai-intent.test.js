const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function transpile(relativePath) {
  const filePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;
}

function loadModule(relativeParts, localRequire) {
  const module = { exports: {} };
  const fn = new Function(
    'require',
    'module',
    'exports',
    transpile(path.join(...relativeParts))
  );
  fn(localRequire || require, module, module.exports);
  return module.exports;
}

/**
 * Build the module under test with a stubbed AI client so the suite never
 * makes a network call. `aiStub.calls` records how often the model was asked,
 * which is what proves the cost guards actually hold.
 */
function loadAiIntentModule(aiStub) {
  const parser = loadModule(['lib', 'whatsapp-agent', 'parser.ts']);
  const language = loadModule(['lib', 'whatsapp-agent', 'language.ts']);

  const intentNlp = loadModule(['lib', 'whatsapp-agent', 'intent-nlp.ts'], (id) => {
    if (id === '@/lib/whatsapp-agent/parser') return parser;
    return require(id);
  });

  return loadModule(['lib', 'whatsapp-agent', 'ai-intent.ts'], (id) => {
    if (id === '@/lib/ai/client') return aiStub;
    if (id === '@/lib/whatsapp-agent/intent-nlp') return intentNlp;
    if (id === '@/lib/whatsapp-agent/parser') return parser;
    if (id === '@/lib/whatsapp-agent/language') return language;
    return require(id);
  });
}

function makeAiStub(behaviour) {
  const stub = {
    calls: 0,
    lastMessages: null,
    isAiConfigured: () => behaviour.configured !== false,
    callAiJson: async (options) => {
      stub.calls += 1;
      stub.lastMessages = options.messages;
      if (behaviour.throws) {
        throw new Error(behaviour.throws);
      }
      return { parsed: behaviour.parsed, model: 'stub', tokensUsed: 0 };
    },
  };
  return stub;
}

async function run() {
  // --- 1. Deterministic hits never reach the model ------------------------
  {
    const ai = makeAiStub({ parsed: {} });
    const mod = loadAiIntentModule(ai);

    const result = await mod.resolveInboundIntent('I need work in Douala as cashier this week');

    assert.equal(result.intent, 'jobseeker');
    assert.equal(result.source, 'deterministic');
    assert.equal(result.language, 'en');
    assert.equal(ai.calls, 0, 'deterministic hit must not spend a model call');
  }

  // --- 2. French the keyword parser cannot read falls through to the model -
  {
    const ai = makeAiStub({
      parsed: {
        intent: 'jobseeker',
        location: 'Bafoussam',
        roleKeywords: 'chauffeur',
        timeFilter: null,
        language: 'fr',
      },
    });
    const mod = loadAiIntentModule(ai);

    // No 'travail'/'emploi' keyword, and Bafoussam is not in the hardcoded
    // town list -- the deterministic parser returns 'unknown' here.
    const text = "Bonjour, je suis a la recherche d'un poste de chauffeur a Bafoussam";
    const result = await mod.resolveInboundIntent(text);

    assert.equal(ai.calls, 1, 'unknown intent should consult the model');
    assert.equal(result.intent, 'jobseeker');
    assert.equal(result.source, 'ai');
    assert.equal(result.locationHint, 'Bafoussam');
    assert.equal(result.roleKeywordsHint, 'chauffeur');
    assert.equal(result.language, 'fr');

    // The message is passed as data in the user turn, never folded into the
    // instructions. (The system prompt does name towns as static guidance, so
    // check against a distinctive phrase from the message instead.)
    const systemMessage = ai.lastMessages.find((m) => m.role === 'system');
    const userMessage = ai.lastMessages.find((m) => m.role === 'user');
    assert.ok(systemMessage, 'a system prompt should be sent');
    assert.ok(
      !systemMessage.content.includes('poste de chauffeur'),
      'user text must not be spliced into the system prompt'
    );
    assert.ok(
      userMessage.content.includes('poste de chauffeur'),
      'the message should be sent as user-turn data'
    );
  }

  // --- 3. A model failure degrades, it does not throw ----------------------
  {
    const ai = makeAiStub({ throws: 'upstream 500' });
    const mod = loadAiIntentModule(ai);

    const result = await mod.resolveInboundIntent(
      "Bonjour, je suis a la recherche d'un poste de chauffeur a Bafoussam"
    );

    assert.equal(ai.calls, 1);
    assert.equal(result.source, 'ai_failed');
    assert.equal(result.intent, 'unknown', 'falls back to the deterministic verdict');
    // Language detection is local, so it still works when the model is down.
    assert.equal(result.language, 'fr');
  }

  // --- 4. An unconfigured model is simply skipped -------------------------
  {
    const ai = makeAiStub({ configured: false, parsed: {} });
    const mod = loadAiIntentModule(ai);

    const result = await mod.resolveInboundIntent(
      "Bonjour, je suis a la recherche d'un poste de chauffeur a Bafoussam"
    );

    assert.equal(ai.calls, 0, 'must not call an unconfigured model');
    assert.equal(result.source, 'deterministic');
    assert.equal(result.language, 'fr');
  }

  // --- 5. Cost guards: menu digits and stubs never reach the model ---------
  {
    const ai = makeAiStub({ parsed: {} });
    const mod = loadAiIntentModule(ai);

    for (const noise of ['1', '2', '  3 ', 'ok', 'hi', '', '   ', '10/10']) {
      // eslint-disable-next-line no-await-in-loop
      await mod.resolveInboundIntent(noise);
    }

    assert.equal(ai.calls, 0, `menu digits and stub replies must not spend model calls`);
  }

  // --- 6. Stored language survives a signal-free reply --------------------
  {
    const ai = makeAiStub({ parsed: {} });
    const mod = loadAiIntentModule(ai);

    const result = await mod.resolveInboundIntent('1', { storedLanguage: 'fr' });

    assert.equal(result.language, 'fr', 'a French speaker tapping "1" stays in French');
    assert.equal(result.detectedLanguage, null, 'no signal was detected in "1"');
    assert.equal(ai.calls, 0);
  }

  // --- 7. The deterministic parser owns the slots it fills ----------------
  {
    const ai = makeAiStub({
      parsed: {
        intent: 'jobseeker',
        location: 'Yaounde',
        roleKeywords: 'teacher',
        timeFilter: '30d',
        language: 'en',
      },
    });
    const mod = loadAiIntentModule(ai);

    // Deterministic parse resolves this one, so the model is never asked and
    // its (different) answer cannot override the tested behaviour.
    const result = await mod.resolveInboundIntent('I need work in Douala as cashier this week');

    assert.equal(ai.calls, 0);
    assert.equal(result.timeFilterHint, '7d', 'deterministic time filter is kept');
    assert.notEqual(result.locationHint, 'Yaounde');
  }

  console.log('wa-ai-intent: all assertions passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
