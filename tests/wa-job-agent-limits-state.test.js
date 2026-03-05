const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
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
  const localRequire = (id) => {
    if (id === '@/lib/subscriptions') {
      return {
        getUserSubscription: async () => ({ isActive: false }),
      };
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const limits = loadModule(path.join('lib', 'whatsapp-agent', 'limits.ts'));
  const state = loadModule(path.join('lib', 'whatsapp-agent', 'state-machine.ts'));

  const freeWithinLimit = limits.evaluateViewBatch({
    subscribed: false,
    currentViews: 6,
    batchSize: 10,
  });
  assert.equal(freeWithinLimit.visibleCount, 4);
  assert.equal(freeWithinLimit.lockedCount, 6);
  assert.equal(freeWithinLimit.incrementBy, 4);
  console.log('ok - free view limit cutoff');

  const freeExceeded = limits.evaluateViewBatch({
    subscribed: false,
    currentViews: 10,
    batchSize: 10,
  });
  assert.equal(freeExceeded.visibleCount, 1);
  assert.equal(freeExceeded.lockedCount, 9);
  assert.equal(freeExceeded.incrementBy, 0);
  console.log('ok - free exceeded lock behavior');

  const paid = limits.evaluateViewBatch({
    subscribed: true,
    currentViews: 100,
    batchSize: 10,
  });
  assert.equal(paid.visibleCount, 10);
  assert.equal(paid.lockedCount, 0);
  console.log('ok - paid full visibility');

  assert.equal(limits.canApplyNow({ subscribed: false, currentApplies: 3 }), true);
  assert.equal(limits.canApplyNow({ subscribed: false, currentApplies: 4 }), false);
  assert.equal(limits.canApplyNow({ subscribed: true, currentApplies: 999 }), true);
  console.log('ok - apply limits');

  const merged = state.mergePayload(
    {
      jobSearch: {
        location: 'Douala',
      },
    },
    {
      jobSearch: {
        roleKeywords: 'driver',
      },
    }
  );
  assert.equal(merged.jobSearch.location, 'Douala');
  assert.equal(merged.jobSearch.roleKeywords, 'driver');
  console.log('ok - state payload merge');
}

try {
  run();
  console.log('All wa-job-agent limits/state tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
