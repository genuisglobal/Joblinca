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
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(require, module, module.exports);
  return module.exports;
}

function run() {
  const mapping = loadModule(path.join('lib', 'hiring-pipeline', 'mapping.ts'));
  const validation = loadModule(path.join('lib', 'hiring-pipeline', 'validation.ts'));

  assert.equal(mapping.mapStageTypeToLegacyStatus('applied'), 'submitted');
  assert.equal(mapping.mapStageTypeToLegacyStatus('screening'), 'submitted');
  assert.equal(mapping.mapStageTypeToLegacyStatus('review'), 'shortlisted');
  assert.equal(mapping.mapStageTypeToLegacyStatus('offer'), 'shortlisted');
  assert.equal(mapping.mapStageTypeToLegacyStatus('interview'), 'interviewed');
  assert.equal(mapping.mapStageTypeToLegacyStatus('hire'), 'hired');
  assert.equal(mapping.mapStageTypeToLegacyStatus('rejected'), 'rejected');
  assert.equal(mapping.mapStageTypeToLegacyStatus('unknown'), 'submitted');
  console.log('ok - structured stages map to legacy statuses');

  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('submitted'), ['applied', 'phone_screen']);
  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('shortlisted'), [
    'recruiter_review',
    'hiring_manager_review',
    'final_review',
    'offer',
  ]);
  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('interviewed'), ['interview']);
  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('hired'), ['hired']);
  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('rejected'), ['rejected']);
  assert.deepEqual(mapping.defaultStageKeysForLegacyStatus('invalid'), ['applied', 'phone_screen']);
  console.log('ok - legacy statuses resolve to expected default stage keys');

  assert.equal(mapping.isHiringStageType('offer'), true);
  assert.equal(mapping.isHiringStageType('screening'), true);
  assert.equal(mapping.isHiringStageType('invalid'), false);
  assert.equal(mapping.isLegacyApplicationStatus('shortlisted'), true);
  assert.equal(mapping.isLegacyApplicationStatus('pending'), false);
  console.log('ok - stage and status guards stay strict');

  const validOrder = validation.validatePipelineStageOrder([
    { id: '1', label: 'Applied', stageType: 'applied', isTerminal: false, orderIndex: 1 },
    { id: '2', label: 'Interview', stageType: 'interview', isTerminal: false, orderIndex: 2 },
    { id: '3', label: 'Hired', stageType: 'hire', isTerminal: true, orderIndex: 3 },
    { id: '4', label: 'Rejected', stageType: 'rejected', isTerminal: true, orderIndex: 4 },
  ]);
  assert.equal(validOrder.valid, true);
  assert.equal(validOrder.message, null);
  console.log('ok - terminal stages at the end are accepted');

  const invalidOrder = validation.validatePipelineStageOrder([
    { id: '1', label: 'Applied', stageType: 'applied', isTerminal: false, orderIndex: 1 },
    { id: '2', label: 'Rejected', stageType: 'rejected', isTerminal: true, orderIndex: 2 },
    { id: '3', label: 'Interview', stageType: 'interview', isTerminal: false, orderIndex: 3 },
  ]);
  assert.equal(invalidOrder.valid, false);
  assert.match(invalidOrder.message || '', /Move terminal stages to the end/);
  console.log('ok - invalid terminal-stage ordering is rejected');
}

try {
  run();
  console.log('All hiring-pipeline tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
