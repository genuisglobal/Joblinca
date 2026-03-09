const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(relativePath, overrides = {}) {
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
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) {
      return overrides[specifier];
    }
    return require(specifier);
  };

  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const previousOpenAiKey = process.env.OPENAI_API_KEY;
  const previousFollowUpFlag = process.env.WA_SCREENING_AI_FOLLOWUP_ENABLED;

  try {
    const aiClientStub = {
      isAiConfigured: () => Boolean(process.env.OPENAI_API_KEY),
      callAiJson: async () => {
        throw new Error('not_used_in_this_test');
      },
    };

    const policiesStub = {
      buildFollowUpQuestionSystemPrompt: () => 'system',
      buildFollowUpQuestionUserPrompt: () => 'user',
      buildRecruiterSummarySystemPrompt: () => 'system',
      buildRecruiterSummaryUserPrompt: () => 'user',
    };

    const ai = loadTsModule(path.join('lib', 'whatsapp-screening', 'ai.ts'), {
      '@/lib/ai/client': aiClientStub,
      '@/lib/ai/policies': policiesStub,
    });

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

    const summaryText = ai.formatRecruiterSummaryText({
      summary: 'Candidate shows relevant experience.',
      confidence: 'medium',
      nextStep: 'Manual review before shortlist.',
    });
    assert.match(summaryText, /Candidate shows relevant experience\./);
    assert.match(summaryText, /Confidence: medium/);
    assert.match(summaryText, /Next step: Manual review before shortlist\./);
    console.log('ok - recruiter summary text includes confidence and next step');
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
