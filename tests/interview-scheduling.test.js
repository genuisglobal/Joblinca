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
  const utils = loadModule(path.join('lib', 'interview-scheduling', 'utils.ts'));

  assert.equal(utils.normalizeInterviewMode('phone'), 'phone');
  assert.equal(utils.normalizeInterviewMode('invalid'), 'video');
  console.log('ok - interview mode normalization falls back safely');

  assert.equal(utils.normalizeInterviewResponseStatus('confirmed'), 'confirmed');
  assert.equal(utils.normalizeInterviewResponseStatus('unexpected'), 'pending');
  console.log('ok - interview response normalization falls back safely');

  assert.equal(utils.pickInterviewStageId([], null), null);
  assert.equal(
    utils.pickInterviewStageId(
      [
        { id: 'a', stageType: 'review', orderIndex: 1 },
        { id: 'b', stageType: 'interview', orderIndex: 3 },
        { id: 'c', stageType: 'interview', orderIndex: 2 },
      ],
      null
    ),
    'c'
  );
  console.log('ok - interview stage selection picks earliest interview stage');

  assert.equal(
    utils.pickInterviewStageId(
      [
        { id: 'b', stageType: 'interview', orderIndex: 3 },
        { id: 'c', stageType: 'interview', orderIndex: 2 },
      ],
      'b'
    ),
    'b'
  );
  console.log('ok - interview stage selection preserves current interview stage');

  assert.equal(utils.normalizeE164('+237 6 12 34 56 78'), '+237612345678');
  assert.equal(utils.normalizeE164('612-34-56-78'), '+612345678');
  console.log('ok - interview phone normalization keeps WhatsApp lookup stable');
}

run();
