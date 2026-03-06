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
  const parser = loadModule(path.join('lib', 'whatsapp-agent', 'parser.ts'));

  assert.equal(parser.isGreeting('Hi'), true);
  assert.equal(parser.isGreeting('++'), true);
  assert.equal(parser.isGreeting('what'), false);
  console.log('ok - greeting parsing');

  assert.equal(parser.isHelpMenu('help'), true);
  assert.equal(parser.isHelpMenu('4'), false);
  console.log('ok - help/menu parsing');

  assert.equal(parser.parseMenuChoice('1'), 1);
  assert.equal(parser.parseMenuChoice('4'), 4);
  assert.equal(parser.parseMenuChoice('0'), null);
  console.log('ok - menu parsing');

  const apply1 = parser.parseApplyCommand('APPLY jl-1000');
  assert.equal(apply1.isApply, true);
  assert.equal(apply1.publicId, 'JL-1000');

  const apply2 = parser.parseApplyCommand('jl1001');
  assert.equal(apply2.isApply, true);
  assert.equal(apply2.publicId, 'JL-1001');

  const apply3 = parser.parseApplyCommand('APPLY jl 1002');
  assert.equal(apply3.isApply, true);
  assert.equal(apply3.publicId, 'JL-1002');

  const apply4 = parser.parseApplyCommand('apply now');
  assert.equal(apply4.isApply, true);
  assert.equal(apply4.publicId, null);
  console.log('ok - apply parsing');

  const details = parser.parseDetailsCommand('DETAILS jl-123');
  assert.equal(details.isDetails, true);
  assert.equal(details.publicId, 'JL-123');

  const details2 = parser.parseDetailsCommand('info jl 456');
  assert.equal(details2.isDetails, true);
  assert.equal(details2.publicId, 'JL-456');
  console.log('ok - details parsing');

  assert.equal(parser.parseTimeFilter('1'), '24h');
  assert.equal(parser.parseTimeFilter('last 1 week'), '7d');
  assert.equal(parser.parseTimeFilter('3'), '30d');
  assert.equal(parser.parseTimeFilter('any'), null);
  console.log('ok - time filter parsing');

  assert.equal(parser.parseLocationScope('1'), 'nationwide');
  assert.equal(parser.parseLocationScope('town'), 'town');
  assert.equal(parser.parseLocationScope('unknown'), null);
  console.log('ok - location scope parsing');

  assert.equal(parser.parseRoleMode('1'), 'all');
  assert.equal(parser.parseRoleMode('specific role'), 'specific');
  assert.equal(parser.parseRoleMode('none'), null);
  console.log('ok - role mode parsing');

  assert.equal(parser.looksLikeJobIntent('I need work in Douala'), true);
  assert.equal(parser.looksLikeInternshipIntent('I need an internship in Buea'), true);
  assert.equal(parser.isCreateAccountIntent('create account'), true);
  assert.equal(parser.looksLikeJobIntent('hello there'), false);
  console.log('ok - intent detection');
}

try {
  run();
  console.log('All wa-job-agent parser tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
