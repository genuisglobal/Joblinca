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

function loadModule(relativePath, localRequire) {
  const module = { exports: {} };
  const fn = new Function('require', 'module', 'exports', transpile(relativePath));
  fn(localRequire || require, module, module.exports);
  return module.exports;
}

/**
 * Loads state-machine.ts against the REAL en/fr dictionaries, so this asserts
 * the actual strings a WhatsApp user receives rather than a stub.
 */
function loadStateMachine() {
  const en = loadModule(path.join('lib', 'i18n', 'translations', 'en.ts'));
  const fr = loadModule(path.join('lib', 'i18n', 'translations', 'fr.ts'));
  const locale = loadModule(path.join('lib', 'i18n', 'locale.ts'));

  const serverT = loadModule(path.join('lib', 'i18n', 'server-t.ts'), (id) => {
    if (id === './translations/en') return en;
    if (id === './translations/fr') return fr;
    if (id === './locale') return locale;
    return require(id);
  });

  return loadModule(path.join('lib', 'whatsapp-agent', 'state-machine.ts'), (id) => {
    if (id === '@/lib/i18n/server-t') return serverT;
    if (id === '@/lib/i18n/locale') return locale;
    return require(id);
  });
}

function run() {
  const state = loadStateMachine();

  const enMenu = state.menuMessage('en');
  const frMenu = state.menuMessage('fr');

  // The whole point: a French speaker gets a French menu.
  assert.notEqual(enMenu, frMenu, 'the two locales must produce different menus');
  assert.match(enMenu, /Find a job/);
  assert.match(frMenu, /Trouver un emploi/);
  assert.match(frMenu, /Publier une offre/);
  assert.match(frMenu, /Trouver un stage/);

  // No key should leak through untranslated -- getServerT returns the key
  // itself when a lookup misses, which would ship "wa.menu.findJob" to a user.
  assert.ok(!enMenu.includes('wa.'), 'English menu has an unresolved key');
  assert.ok(!frMenu.includes('wa.'), 'French menu has an unresolved key');

  // Menu numbering must survive translation: the router parses the reply digit.
  for (const menu of [enMenu, frMenu]) {
    for (const digit of ['1)', '2)', '3)', '4)']) {
      assert.ok(menu.includes(digit), `menu is missing option ${digit}`);
    }
  }

  const enTime = state.timeFilterPrompt('en');
  const frTime = state.timeFilterPrompt('fr');
  assert.notEqual(enTime, frTime);
  assert.match(enTime, /Last 24 hours/);
  assert.match(frTime, /24 heures/);
  assert.ok(!frTime.includes('wa.'), 'French time filter has an unresolved key');
  for (const prompt of [enTime, frTime]) {
    for (const digit of ['1)', '2)', '3)']) {
      assert.ok(prompt.includes(digit), `time prompt is missing option ${digit}`);
    }
  }

  // Defaulting to English keeps every existing caller behaving as before.
  assert.equal(state.menuMessage(), enMenu);
  assert.equal(state.timeFilterPrompt(), enTime);

  console.log('wa-prompts-locale: all assertions passed');
}

run();
