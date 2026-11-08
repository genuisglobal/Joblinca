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

const { nextTrapIndex, FOCUSABLE_SELECTOR } = loadModule('lib/ui/focus-trap.ts');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('Tab on the last element wraps to the first', () => {
  assert.equal(nextTrapIndex(4, 5, false), 0);
});

test('Shift+Tab on the first element wraps to the last', () => {
  assert.equal(nextTrapIndex(0, 5, true), 4);
});

test('Tab in the middle is left to the browser', () => {
  assert.equal(nextTrapIndex(2, 5, false), null);
  assert.equal(nextTrapIndex(2, 5, true), null);
});

test('focus outside the container is pulled back in', () => {
  assert.equal(nextTrapIndex(-1, 5, false), 0);
  assert.equal(nextTrapIndex(-1, 5, true), 4);
});

test('a single element keeps focus', () => {
  assert.equal(nextTrapIndex(0, 1, false), 0);
  assert.equal(nextTrapIndex(0, 1, true), 0);
});

test('no focusable elements: nothing to do', () => {
  assert.equal(nextTrapIndex(-1, 0, false), null);
});

test('selector skips disabled and tabindex=-1 elements', () => {
  assert.match(FOCUSABLE_SELECTOR, /button:not\(\[disabled\]\)/);
  assert.match(FOCUSABLE_SELECTOR, /\[tabindex\]:not\(\[tabindex="-1"\]\)/);
});

console.log('All focus-trap tests passed.');
