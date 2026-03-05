const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule() {
  const filePath = path.join(
    process.cwd(),
    'lib',
    'whatsapp-agent',
    'ai-screening-policy.ts'
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
  const localRequire = (id) => {
    if (id === '@/lib/supabase/service') {
      return {
        createServiceSupabaseClient: () => ({}),
      };
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const policy = loadModule();

  const jobOverrideOn = policy.deriveAiScreeningDecision({
    jobOverride: true,
    recruiterDefault: null,
    recruiterPlanSlug: 'recruiter_basic',
    hiringTier: 'tier1_diy',
    globalDefaultEnabled: false,
  });
  assert.equal(jobOverrideOn.enabled, true);
  assert.equal(jobOverrideOn.source, 'job_override');
  console.log('ok - job override on');

  const recruiterDefaultOff = policy.deriveAiScreeningDecision({
    jobOverride: null,
    recruiterDefault: false,
    recruiterPlanSlug: 'recruiter_premium',
    hiringTier: 'tier4_partner',
    globalDefaultEnabled: true,
  });
  assert.equal(recruiterDefaultOff.enabled, false);
  assert.equal(recruiterDefaultOff.source, 'recruiter_default');
  console.log('ok - recruiter default precedence');

  const planBased = policy.deriveAiScreeningDecision({
    jobOverride: null,
    recruiterDefault: null,
    recruiterPlanSlug: 'recruiter_trusted',
    hiringTier: 'tier1_diy',
    globalDefaultEnabled: false,
  });
  assert.equal(planBased.enabled, true);
  assert.equal(planBased.source, 'recruiter_plan');
  console.log('ok - plan based enable');

  const tierBased = policy.deriveAiScreeningDecision({
    jobOverride: null,
    recruiterDefault: null,
    recruiterPlanSlug: null,
    hiringTier: 'tier2_shortlist',
    globalDefaultEnabled: false,
  });
  assert.equal(tierBased.enabled, true);
  assert.equal(tierBased.source, 'hiring_tier');
  console.log('ok - tier fallback enable');

  const globalDefault = policy.deriveAiScreeningDecision({
    jobOverride: null,
    recruiterDefault: null,
    recruiterPlanSlug: null,
    hiringTier: 'tier1_diy',
    globalDefaultEnabled: false,
  });
  assert.equal(globalDefault.enabled, false);
  assert.equal(globalDefault.source, 'global_default');
  console.log('ok - global default fallback');
}

try {
  run();
  console.log('All wa-ai-screening-policy tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}

