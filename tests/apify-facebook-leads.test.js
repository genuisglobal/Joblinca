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

const {
  canonicalFacebookPageUrl,
  extractSearchPageUrls,
  cameroonPhone,
  mapPageItemToLead,
} = loadModule('lib/apify/facebook-leads.ts');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

test('canonical Page URL strips query, trailing path and normalises host', () => {
  assert.equal(
    canonicalFacebookPageUrl('https://m.facebook.com/CabinetRHDouala/?ref=page_internal'),
    'https://www.facebook.com/CabinetRHDouala',
  );
  assert.equal(
    canonicalFacebookPageUrl('https://www.facebook.com/pages/Agence-X/12345'),
    'https://www.facebook.com/pages/Agence-X/12345',
  );
});

test('profiles, groups, posts and other hosts are not Pages', () => {
  for (const url of [
    'https://www.facebook.com/profile.php?id=1000123',
    'https://www.facebook.com/groups/305613197515850/',
    'https://www.facebook.com/SomePage/posts/123',
    'https://www.facebook.com/people/Jane-Doe/100',
    'https://www.facebook.com/',
    'https://example.com/CabinetRH',
    'not a url',
    null,
  ]) {
    assert.equal(canonicalFacebookPageUrl(url), null, String(url));
  }
});

test('search results: dedupe Pages, skip people', () => {
  const urls = extractSearchPageUrls([
    { url: 'https://www.facebook.com/AgenceA' },
    { facebookUrl: 'https://facebook.com/AgenceA/' },
    { type: 'profile', url: 'https://www.facebook.com/jane.doe' },
    { url: 'https://www.facebook.com/groups/123' },
    { pageUrl: 'https://www.facebook.com/AgenceB' },
  ]);
  assert.deepEqual(urls, ['https://www.facebook.com/AgenceA', 'https://www.facebook.com/AgenceB']);
});

test('cameroonPhone normalises local and international forms', () => {
  assert.equal(cameroonPhone('+237 6 77 12 34 56'), '+237677123456');
  assert.equal(cameroonPhone('00237677123456'), '+237677123456');
  assert.equal(cameroonPhone('677 12 34 56'), '+237677123456');
  assert.equal(cameroonPhone('233 42 11 00'), '+237233421100');
  assert.equal(cameroonPhone('+33 6 12 34 56 78'), null);
  assert.equal(cameroonPhone(null), null);
});

test('a Cameroon recruitment Page becomes a lead with contacts', () => {
  const lead = mapPageItemToLead({
    title: 'Cabinet RH Excellence',
    pageUrl: 'https://www.facebook.com/CabinetRHExcellence',
    pageId: '998877',
    categories: ['Employment Agency', 'Consulting'],
    intro: 'Recrutement et placement. WhatsApp: wa.me/237699112233',
    phone: '+237 6 99 11 22 33',
    websites: ['https://www.facebook.com/x', 'https://cabinet-rh.cm/'],
    address: 'Bonapriso, Douala, Cameroon',
    followers: 12500,
  });
  assert.equal(lead.page_url, 'https://www.facebook.com/CabinetRHExcellence');
  assert.equal(lead.phone, '+237699112233');
  assert.equal(lead.whatsapp, '+237699112233');
  assert.equal(lead.website, 'https://cabinet-rh.cm/');
  assert.equal(lead.recruiter_signal, true);
  assert.equal(lead.followers, 12500);
});

test('email found in the intro is used when the field is empty', () => {
  const lead = mapPageItemToLead({
    title: 'Boulangerie du Centre',
    pageUrl: 'https://www.facebook.com/BoulangerieCentre',
    intro: 'Yaoundé. Envoyez vos CV à Jobs@Boulangerie.CM',
  });
  assert.equal(lead.email, 'jobs@boulangerie.cm');
  assert.equal(lead.recruiter_signal, true);
});

test('Pages outside Cameroon or with no contact route are dropped', () => {
  assert.equal(
    mapPageItemToLead({
      title: 'Paris Recrutement',
      pageUrl: 'https://www.facebook.com/ParisRecrutement',
      phone: '+33 1 23 45 67 89',
      address: 'Paris, France',
    }),
    null,
  );
  assert.equal(
    mapPageItemToLead({
      title: 'Douala Jobs',
      pageUrl: 'https://www.facebook.com/DoualaJobs',
    }),
    null,
  );
  assert.equal(mapPageItemToLead({ title: 'No URL', phone: '+237677123456' }), null);
});
