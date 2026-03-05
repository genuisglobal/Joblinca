const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadAiModule() {
  const filePath = path.join(
    process.cwd(),
    'lib',
    'whatsapp-screening',
    'ai.ts'
  );

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
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousFollowUpFlag = process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED;

  try {
    const ai = loadAiModule();

    process.env.OPENAI_API_KEY = '';
    assert.equal(ai.isAiSummaryEnabled(), false);
    console.log('ok - isAiSummaryEnabled false without key');

    process.env.OPENAI_API_KEY = 'test-key';
    assert.equal(ai.isAiSummaryEnabled(), true);
    console.log('ok - isAiSummaryEnabled true with key');

    process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED = 'false';
    assert.equal(ai.isAiFollowUpEnabled(), false);
    process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED = 'true';
    assert.equal(ai.isAiFollowUpEnabled(), true);
    console.log('ok - isAiFollowUpEnabled env gate');
  } finally {
    if (typeof previousOpenAiKey === 'undefined') {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = previousOpenAiKey;
    }

    if (typeof previousFollowUpFlag === 'undefined') {
      delete process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED;
    } else {
      process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED = previousFollowUpFlag;
    }
  }
}

try {
  run();
  console.log('All wa-screening AI tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
