const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', out)(require, module, module.exports);
  return module.exports;
}

const { summarizeDescription } = loadModule('lib/jobs/summary.ts');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('empty input gives null', () => {
  assert.equal(summarizeDescription(null), null);
  assert.equal(summarizeDescription('   \n '), null);
});

test('short text is returned whole, whitespace collapsed', () => {
  assert.equal(summarizeDescription('  Vendeur\n\n  à Douala  '), 'Vendeur à Douala');
});

test('long text is cut at a word boundary with an ellipsis', () => {
  const text = 'Orange recrute un(e) Chef Département Orange Money et PFS. '.repeat(10);
  const out = summarizeDescription(text, 80);
  assert.ok(Array.from(out).length <= 81, `too long: ${out.length}`);
  assert.ok(out.endsWith('…'));
  assert.ok(!/\s…$/.test(out), 'no space before the ellipsis');
  assert.ok(text.startsWith(out.slice(0, -1)), 'is a prefix of the source');
});

test('never ends inside an HTML entity', () => {
  const text = `${'a'.repeat(70)} Publi&#xe9; le 06-11-2026 ${'b '.repeat(50)}`;
  for (let max = 70; max < 85; max++) {
    const out = summarizeDescription(text, max);
    assert.ok(!/&[#a-z0-9]*…$/i.test(out), `cut inside entity at ${max}: ${out}`);
  }
});

test('never splits an emoji', () => {
  const text = `${'x'.repeat(9)}🚀${'y'.repeat(30)}`;
  const out = summarizeDescription(text, 10);
  assert.ok(!out.includes('�'));
  assert.ok(!/[\uD800-\uDBFF]…$/.test(out), 'dangling high surrogate');
});

test('accents and French text survive', () => {
  assert.equal(summarizeDescription('Expérience requise : 3 ans', 200), 'Expérience requise : 3 ans');
});

console.log('All job summary tests passed.');
