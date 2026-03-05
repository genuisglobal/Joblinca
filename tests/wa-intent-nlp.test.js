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

function loadParserModule() {
  const module = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpile(path.join('lib', 'whatsapp-agent', 'parser.ts')));
  fn(require, module, module.exports);
  return module.exports;
}

function loadIntentModule(parserModule) {
  const module = { exports: {} };
  const localRequire = (id) => {
    if (id === '@/lib/whatsapp-agent/parser') {
      return parserModule;
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', transpile(path.join('lib', 'whatsapp-agent', 'intent-nlp.ts')));
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const parser = loadParserModule();
  const nlp = loadIntentModule(parser);

  const jobIntent = nlp.parseIntentFromFreeText('I need work in Douala as cashier this week');
  assert.equal(jobIntent.intent, 'jobseeker');
  assert.equal(jobIntent.timeFilterHint, '7d');
  assert.ok(jobIntent.locationHint);
  console.log('ok - jobseeker intent parse');

  const recruiterIntent = nlp.parseIntentFromFreeText('I want to post a job for my company');
  assert.equal(recruiterIntent.intent, 'recruiter');
  console.log('ok - recruiter intent parse');

  const talentIntent = nlp.parseIntentFromFreeText('I am a student, help me create profile');
  assert.equal(talentIntent.intent, 'talent');
  console.log('ok - talent intent parse');

  const menuIntent = nlp.parseIntentFromFreeText('help menu');
  assert.equal(menuIntent.intent, 'menu');
  console.log('ok - menu intent parse');
}

try {
  run();
  console.log('All wa-intent-nlp tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}

