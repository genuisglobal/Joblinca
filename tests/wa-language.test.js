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

function loadLanguageModule() {
  const module = { exports: {} };
  const fn = new Function(
    'require',
    'module',
    'exports',
    transpile(path.join('lib', 'whatsapp-agent', 'language.ts'))
  );
  fn(require, module, module.exports);
  return module.exports;
}

function run() {
  const lang = loadLanguageModule();
  const { detectLanguage, resolveReplyLanguage, normalizeWaLanguage } = lang;

  // --- French is recognised, accented or not -------------------------------
  assert.equal(detectLanguage('je cherche un travail a Douala').language, 'fr');
  assert.equal(detectLanguage('je cherche un travail à Douala').language, 'fr');
  assert.equal(detectLanguage('bonjour, je voudrais un emploi').language, 'fr');
  assert.equal(detectLanguage('je cherche un stage en informatique').language, 'fr');
  assert.equal(detectLanguage('Salut, avez-vous des offres pour moi ?').language, 'fr');

  // A single accented character is enough on its own -- English phone input
  // effectively never carries one.
  assert.equal(detectLanguage('recherche opérateur').language, 'fr');

  // --- English is recognised ----------------------------------------------
  assert.equal(detectLanguage('I need work in Douala as a cashier').language, 'en');
  assert.equal(detectLanguage('hello, any jobs available now?').language, 'en');
  assert.equal(detectLanguage('looking for an internship in Buea').language, 'en');

  // --- No opinion rather than a bad guess ---------------------------------
  // Menu selections and bare numbers carry no language signal at all.
  assert.equal(detectLanguage('1').language, null);
  assert.equal(detectLanguage('2').language, null);
  assert.equal(detectLanguage('').language, null);
  assert.equal(detectLanguage('   ').language, null);

  // A town name alone says nothing about language.
  assert.equal(detectLanguage('Douala').language, null);

  // One weak marker on a very short message is noise, not evidence.
  assert.equal(detectLanguage('merci').language, null);

  // Words that read identically in both languages must not tip the scale.
  assert.equal(detectLanguage('menu').language, null);

  // --- Stored preference carries through the gaps -------------------------
  // This is the whole point of persisting language: a French speaker tapping
  // "1" must not get bounced back into English.
  assert.equal(resolveReplyLanguage(null, 'fr'), 'fr');
  assert.equal(resolveReplyLanguage(null, 'en'), 'en');
  assert.equal(resolveReplyLanguage(null, null), 'en');
  assert.equal(resolveReplyLanguage(null, undefined), 'en');

  // A confident read of the current message beats the stored preference --
  // people do switch languages mid-thread.
  assert.equal(resolveReplyLanguage('en', 'fr'), 'en');
  assert.equal(resolveReplyLanguage('fr', 'en'), 'fr');

  // --- normalizeWaLanguage ------------------------------------------------
  assert.equal(normalizeWaLanguage('fr'), 'fr');
  assert.equal(normalizeWaLanguage('en'), 'en');
  assert.equal(normalizeWaLanguage('es'), null);
  assert.equal(normalizeWaLanguage(null), null);
  assert.equal(normalizeWaLanguage(undefined), null);

  console.log('wa-language: all assertions passed');
}

run();
