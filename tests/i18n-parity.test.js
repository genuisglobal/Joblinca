/**
 * English and French dictionaries must have exactly the same keys, and
 * every {placeholder} used in an English string must also appear in French.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadDictionary(relativePath) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const out = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', out)(require, module, module.exports);
  const dict = Object.values(module.exports).find((value) => value && typeof value === 'object');
  assert.ok(dict, `no dictionary export in ${relativePath}`);
  return dict;
}

const en = loadDictionary('lib/i18n/translations/en.ts');
const fr = loadDictionary('lib/i18n/translations/fr.ts');

const missingInFr = Object.keys(en).filter((key) => !(key in fr));
const missingInEn = Object.keys(fr).filter((key) => !(key in en));
assert.deepEqual(missingInFr, [], `keys missing in fr.ts: ${missingInFr.join(', ')}`);
assert.deepEqual(missingInEn, [], `keys missing in en.ts: ${missingInEn.join(', ')}`);
console.log(`ok - ${Object.keys(en).length} keys present in both languages`);

const placeholders = (text) => new Set((String(text).match(/\{[a-zA-Z0-9_]+\}/g) || []));
const mismatched = Object.keys(en).filter((key) => {
  const enVars = placeholders(en[key]);
  const frVars = placeholders(fr[key]);
  return [...enVars].some((v) => !frVars.has(v));
});
assert.deepEqual(mismatched, [], `French strings missing a {placeholder}: ${mismatched.join(', ')}`);
console.log('ok - every English {placeholder} also appears in French');
