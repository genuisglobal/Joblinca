/**
 * lib/jobs/format-description.ts against real aggregated descriptions
 * (tests/fixtures/job-descriptions.json, public listings sampled from
 * joblinca.com on 2026-11-08) plus targeted cases.
 */
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

const { formatJobDescription, decodeEntities } = loadModule('lib/jobs/format-description.ts');
const samples = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'tests/fixtures/job-descriptions.json'), 'utf8'));

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

const words = (text) => (text.match(/[\p{L}\p{N}]+/gu) || []).map((w) => w.toLowerCase());
const blockWords = (blocks) =>
  blocks.flatMap((b) => (b.type === 'list' ? b.items.flatMap(words) : words(b.text)));
const find = (title) => samples.find((s) => s.title.startsWith(title));

test('every sample: words kept in order; only a leading title/preamble may be dropped', () => {
  for (const sample of samples) {
    const input = words(decodeEntities(sample.description));
    const output = blockWords(formatJobDescription(sample.description, sample.title));
    assert.ok(output.length > 0, `${sample.title}: empty output`);
    const dropped = input.length - output.length;
    assert.ok(dropped >= 0, `${sample.title}: output has extra words`);
    assert.deepEqual(input.slice(dropped), output, `${sample.title}: words changed or reordered`);
    assert.ok(dropped <= 80, `${sample.title}: dropped ${dropped} leading words`);
  }
});

test('repeated title at the start is removed', () => {
  const s = find('Orange recrute');
  const blocks = formatJobDescription(s.description, s.title);
  const first = blocks[0].type === 'list' ? blocks[0].items[0] : blocks[0].text;
  assert.ok(!first.startsWith(s.title), first.slice(0, 60));
});

test('inline section headings become headings; semicolon lists become lists', () => {
  const s = find('Orange recrute');
  const blocks = formatJobDescription(s.description, s.title);
  const headings = blocks.filter((b) => b.type === 'heading').map((b) => b.text);
  assert.ok(headings.includes('Missions principales'), headings.join(' | '));
  const longest = Math.max(0, ...blocks.filter((b) => b.type === 'list').map((b) => b.items.length));
  assert.ok(longest >= 5, `longest list has ${longest} items`);
});

test('run-together verb lists are split into items', () => {
  const s = find('Coordinateur Administration');
  const lists = formatJobDescription(s.description, s.title).filter((b) => b.type === 'list');
  assert.ok(lists.some((l) => l.items.some((i) => i.startsWith('Contribuer à la politique'))), JSON.stringify(lists).slice(0, 300));
});

test('"Trusted listing ... Job description" scraper preamble is removed', () => {
  const s = find('Comptable (H/F)');
  const blocks = formatJobDescription(s.description, s.title);
  const all = JSON.stringify(blocks);
  assert.ok(!all.includes('Trusted listing'));
  assert.ok(!all.includes('This job was published in'));
  assert.ok(blocks.some((b) => b.type === 'heading' && b.text === 'Profil recherché'));
});

test('lowercase mid-sentence words are not treated as headings', () => {
  const blocks = formatJobDescription('Nous cherchons un candidat dont le profil correspond. Les missions sont variées.');
  assert.equal(blocks.filter((b) => b.type === 'heading').length, 0);
});

test('text with its own line breaks keeps its structure', () => {
  const blocks = formatJobDescription('Missions:\n- Vendre\n- Conseiller les clients\n\nProfil:\nBac+2 minimum.');
  assert.deepEqual(blocks, [
    { type: 'heading', text: 'Missions' },
    { type: 'list', items: ['Vendre', 'Conseiller les clients'] },
    { type: 'heading', text: 'Profil' },
    { type: 'paragraph', text: 'Bac+2 minimum.' },
  ]);
});

test('HTML entities are decoded, markup is never produced', () => {
  const blocks = formatJobDescription('Publi&#xe9; le 06-11-2026 &amp; <script>alert(1)</script>');
  assert.equal(blocks[0].type, 'paragraph');
  assert.match(blocks[0].text, /Publié le 06-11-2026 & <script>/);
});

test('empty input gives no blocks', () => {
  assert.deepEqual(formatJobDescription(''), []);
  assert.deepEqual(formatJobDescription(null), []);
});

console.log('All description formatting tests passed.');
