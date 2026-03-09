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

async function run() {
  const policiesStub = {
    buildApplicationAnalysisSystemPrompt: () => 'system',
    buildApplicationAnalysisUserPrompt: () => 'user',
  };
  const originalConsoleError = console.error;

  try {
    const noAiModule = loadTsModule(path.join('lib', 'ai', 'applicationAnalysis.ts'), {
      '@/lib/ai/client': {
        isAiConfigured: () => false,
        callAiJson: async () => {
          throw new Error('should_not_be_called');
        },
      },
      '@/lib/ai/policies': policiesStub,
    });

    const noAiResult = await noAiModule.analyzeApplication({
      applicationId: 'app-1',
      jobTitle: 'Frontend Developer',
      jobDescription: 'React and TypeScript role',
      coverLetter: 'I have 3 years of experience building React applications.',
      resumeUrl: null,
      requiredSkills: ['React', 'TypeScript'],
      answers: [],
    });

    assert.equal(noAiResult.modelUsed, 'rule_based_v1');
    assert.match(noAiResult.reasoning, /AI service unavailable\. Showing rule-based screening only\./);
    assert.match(noAiResult.reasoning, /deterministic rule-based assessment/i);
    console.log('ok - application analysis uses explicit rule-based fallback when AI is not configured');

    console.error = () => {};

    const failingAiModule = loadTsModule(path.join('lib', 'ai', 'applicationAnalysis.ts'), {
      '@/lib/ai/client': {
        isAiConfigured: () => true,
        callAiJson: async () => {
          throw new Error('openai timeout');
        },
      },
      '@/lib/ai/policies': policiesStub,
    });

    const failingAiResult = await failingAiModule.analyzeApplication({
      applicationId: 'app-2',
      jobTitle: 'Backend Engineer',
      jobDescription: 'Node.js role',
      coverLetter: 'I am proficient in APIs and backend systems.',
      resumeUrl: 'https://files.example.com/resume.pdf',
      requiredSkills: ['Node.js'],
      answers: [{ question: 'API', answer: 'yes' }],
    });

    assert.equal(failingAiResult.modelUsed, 'rule_based_v1');
    assert.match(failingAiResult.reasoning, /AI review unavailable\. Showing rule-based screening only\./);
    console.log('ok - application analysis degrades cleanly when the AI call fails');
  } finally {
    console.error = originalConsoleError;
  }
}

run()
  .then(() => {
    console.log('All AI hardening tests passed.');
  })
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
