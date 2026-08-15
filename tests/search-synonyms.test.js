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

const { expandSearchSynonyms, __SYNONYM_GROUPS_FOR_TESTS: GROUPS } = loadModule(
  'lib/search/synonyms.ts'
);

function normalize(value) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

let failures = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ok  ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`  FAIL ${name}\n       ${error.message}`);
  }
}

console.log('search synonyms');

// --- Invariant 1: a term may not appear in two groups -----------------------
// expandSearchSynonyms returns the FIRST matching group, so a shared term would
// make the result depend on the order of SYNONYM_GROUPS rather than on meaning.
check('no term appears in more than one group', () => {
  const owner = new Map();
  const collisions = [];
  for (const group of GROUPS) {
    for (const term of group.terms) {
      const key = normalize(term);
      if (owner.has(key) && owner.get(key) !== group.id) {
        collisions.push(`"${term}" in both ${owner.get(key)} and ${group.id}`);
      }
      owner.set(key, group.id);
    }
  }
  assert.deepEqual(collisions, [], `colliding terms: ${collisions.join('; ')}`);
});

check('no duplicate terms within a group', () => {
  const dupes = [];
  for (const group of GROUPS) {
    const seen = new Set();
    for (const term of group.terms) {
      const key = normalize(term);
      if (seen.has(key)) dupes.push(`"${term}" twice in ${group.id}`);
      seen.add(key);
    }
  }
  assert.deepEqual(dupes, [], `duplicates: ${dupes.join('; ')}`);
});

// --- Invariant 2: no bare term that is a common word on its own -------------
// Matching is whole-term, so listing these alone fires on unrelated titles
// ("chef de projet", "agent de change", "conducteur de travaux").
check('no dangerously generic bare terms', () => {
  const banned = new Set([
    'chef',
    'agent',
    'aide',
    'bonne',
    'commercial',
    'conducteur',
    'assistant',
    'technicien',
    'ouvrier',
    'server',
    'guard',
    'stylist',
  ]);
  const offenders = [];
  for (const group of GROUPS) {
    for (const term of group.terms) {
      if (banned.has(normalize(term))) offenders.push(`"${term}" in ${group.id}`);
    }
  }
  assert.deepEqual(offenders, [], `too generic: ${offenders.join('; ')}`);
});

// --- Expansion behaviour ----------------------------------------------------
check('expands English query into French equivalents', () => {
  const out = expandSearchSynonyms('housewife').map(normalize);
  assert.ok(out.includes('aide menagere'), 'expected aide menagere');
  assert.ok(out.includes('femme de menage'), 'expected femme de menage');
});

check('expands French query into English equivalents', () => {
  const out = expandSearchSynonyms('femme de menage').map(normalize);
  assert.ok(out.includes('housekeeper'), 'expected housekeeper');
});

check('expansion is symmetric across the new groups', () => {
  const pairs = [
    ['chauffeur', 'driver'],
    ['vigile', 'security guard'],
    ['couturiere', 'seamstress'],
    ['soudeur', 'welder'],
    ['magasinier', 'storekeeper'],
    ['teleconseiller', 'customer support'],
  ];
  for (const [query, expected] of pairs) {
    const out = expandSearchSynonyms(query).map(normalize);
    assert.ok(out.includes(normalize(expected)), `${query} -> ${expected}, got ${out.join(', ')}`);
  }
});

check('accents and case in the query are ignored', () => {
  const accented = expandSearchSynonyms('Aide Ménagère').map(normalize);
  const plain = expandSearchSynonyms('aide menagere').map(normalize);
  assert.deepEqual(accented, plain);
  assert.ok(accented.length > 0);
});

check('query itself is excluded from its expansion', () => {
  const out = expandSearchSynonyms('welder').map(normalize);
  assert.ok(!out.includes('welder'), 'query should not echo back');
  assert.ok(out.includes('soudeur'));
});

check('unknown query expands to nothing', () => {
  assert.deepEqual(expandSearchSynonyms('quantum astronaut'), []);
  assert.deepEqual(expandSearchSynonyms(''), []);
  assert.deepEqual(expandSearchSynonyms('   '), []);
});

check('matching is whole-term, not substring', () => {
  // "maid" is a term; "maiden" must not match it.
  assert.deepEqual(expandSearchSynonyms('maiden voyage'), []);
  // "cook" is a term; "cookie" must not match it.
  assert.deepEqual(expandSearchSynonyms('cookie packer'), []);
});

check('multi-word titles still match the embedded term', () => {
  const out = expandSearchSynonyms('experienced taxi driver wanted').map(normalize);
  assert.ok(out.includes('chauffeur'), `expected chauffeur, got ${out.join(', ')}`);
});

check('generic titles do not trigger a group', () => {
  for (const query of ['chef de projet', 'agent de change', 'conducteur de travaux']) {
    assert.deepEqual(expandSearchSynonyms(query), [], `"${query}" should not expand`);
  }
});

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nall checks passed');
