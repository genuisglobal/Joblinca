const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadModule(relativePath) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpiled)(require, module, module.exports);
  return module.exports;
}

const { decodeEntities, splitMetaLine, locationFromMetaParts, locationFromDetailText } = loadModule(
  'lib/scrapers/providers/jobincamer-parse.ts'
);

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

// Real meta-line HTML shape from jobincamer.com (2026-11): no location segment.
const currentCard = ' <a href="/company/orange">Orange</a> | Publi&#xe9; le 06-11-2026 | Postuler avant le 10-11-2026 ';

test('entities are decoded', () => {
  assert.equal(decodeEntities('Publi&#xe9; le'), 'Publié le');
  assert.equal(decodeEntities('Soci&eacute;t&eacute; G&#233;n&#233;rale &amp; Co'), 'Société Générale & Co');
});

test('meta line splits into decoded segments', () => {
  assert.deepEqual(splitMetaLine(currentCard), [
    'Orange',
    'Publié le 06-11-2026',
    'Postuler avant le 10-11-2026',
  ]);
});

test('a publish-date segment is never taken as the location', () => {
  assert.equal(locationFromMetaParts(splitMetaLine(currentCard)), null);
  assert.equal(locationFromMetaParts(['Orange', 'Publi&#xe9; le 06-11-2026']), null);
  assert.equal(locationFromMetaParts(['Orange']), null);
});

test('an old-style card with a location still yields it', () => {
  assert.equal(locationFromMetaParts(splitMetaLine('ACME | Yaound&eacute; | Publi&#xe9; le 01-01-2026')), 'Yaoundé');
});

test('location is read from the job page text', () => {
  const page = 'Postuler Resumé Ce job a été vu 3 fois Localisation: Douala, Cameroun Secteur: Agriculture, Autre Niveau d\'éducation: Licence';
  assert.equal(locationFromDetailText(page), 'Douala');
  assert.equal(locationFromDetailText('Localisation: Bafoussam, Cameroun Niveau d\'éducation: BAC'), 'Bafoussam');
  assert.equal(locationFromDetailText('Localisation: Cameroun Secteur: Autre'), null);
  assert.equal(locationFromDetailText('No location field here'), null);
});

console.log('All jobincamer-parse tests passed.');
