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

const { isCloudflareChallenge, parseEmploiCmListing } = loadModule('lib/scrapers/providers/emploicm-parse.ts');
const { portableTextToPlain, isListResponse, jobUrl } = loadModule('lib/scrapers/providers/minajobs-parse.ts');

function test(name, fn) {
  fn();
  console.log(`ok - ${name}`);
}

// Real Emploi.cm listing markup (2026-11-17), trimmed to one card + pager.
const emploiPage = `<!DOCTYPE html><html><head><title>Emplois au Cameroun | Emploi.cm</title></head><body>
<div class="card card-job" data-href="https://www.emploi.cm/offre-emploi-cameroun/conseiller-commercial-douala-1264651" >
    <picture>
        <a href="/recruteur/1264569"><img typeof="foaf:Image" src="https://www.emploi.cm/sites/emploi.cm/files/styles/thumbnail/public/logos/photo.png?itok=Lj" alt="" /></a>    </picture>
    <div class="card-job-detail">
        <h3><a href="/offre-emploi-cameroun/conseiller-commercial-douala-1264651" title="Conseiller Commercial - Douala">Conseiller Commercial - Douala</a></h3>
        <a href="/recruteur/1264569" class="card-job-company company-name">Axe Digital</a>                <div class="card-job-description">
          <p> Nous recherchons un  Conseiller Commercial  pour accompagner les entreprises. </p>
          <a href="#">+plus</a>
        </div>
                  <ul>
                              <li>Niveau d´études requis : <strong>Bac, Bac+1</strong></li>
                                            <li>Niveau d'expérience : <strong>Etudiant, jeune diplômé et plus</strong></li>
                                            <li>
                                 Contrat proposé
                             : <strong>CDI</strong>
            </li>
                                                  <li>Région de : <strong>Douala &amp; Yaoundé</strong></li>
            <!-- new tags position -->
                                          <li>Compétences clés : <strong>Vente</strong></li>
                                  </ul>
          <time datetime="2026-11-17">17.11.2026</time>
              </div>
    </div>
<ul class="pager"><li class="pager-next active pagination-next"><a title="Aller à la page suivante" href="/recherche-jobs-cameroun?page=1">›</a></li></ul>
<script>(function(){var a=document.createElement('script');a.src='/cdn-cgi/challenge-platform/scripts/jsd/main.js?ray=a5be4d95b8025671';})();</script>
</body></html>`;

test('passive challenge-platform beacon is not a Cloudflare block', () => {
  assert.equal(isCloudflareChallenge(emploiPage), false);
});

test('real interstitial is detected', () => {
  const challenge = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={cvId:"3"};</script></body></html>';
  assert.equal(isCloudflareChallenge(challenge), true);
});

test('emploi.cm card fields are parsed from the 2026-11 layout', () => {
  const { cards, hasNext } = parseEmploiCmListing(emploiPage);
  assert.equal(hasNext, true);
  assert.equal(cards.length, 1);
  const [c] = cards;
  assert.equal(c.jobId, '1264651');
  assert.equal(c.title, 'Conseiller Commercial - Douala');
  assert.equal(c.url, 'https://www.emploi.cm/offre-emploi-cameroun/conseiller-commercial-douala-1264651');
  assert.equal(c.company, 'Axe Digital');
  assert.match(c.logo, /^https:\/\/www\.emploi\.cm\/sites\//);
  assert.equal(c.description, 'Nous recherchons un Conseiller Commercial pour accompagner les entreprises.');
  assert.equal(c.postedDate, '2026-11-17');
  assert.equal(c.contract, 'CDI');
  assert.equal(c.region, 'Douala & Yaoundé');
  assert.equal(c.education, 'Bac, Bac+1');
  assert.equal(c.experience, 'Etudiant, jeune diplômé et plus');
  assert.equal(c.skills, 'Vente');
});

test('last page has no next link', () => {
  const lastPage = emploiPage.replace(/<ul class="pager">.*?<\/ul>/s, '');
  assert.equal(parseEmploiCmListing(lastPage).hasNext, false);
});

test('old Drupal layout yields zero cards (so the scraper reports it)', () => {
  const old = '<div class="view-content"><div class="views-row"><h2 class="node-title"><a href="/x-1">X</a></h2></div></div>';
  assert.equal(parseEmploiCmListing(old).cards.length, 0);
});

// MinaJobs API shapes (cm.minajobs.net, 2026-11-17)
test('minajobs list response guard', () => {
  assert.equal(isListResponse({ items: [], total: 0, page: 1, pageSize: 30 }), true);
  assert.equal(isListResponse({ error: true, statusCode: 404 }), false);
  assert.equal(isListResponse(null), false);
});

test('minajobs job url', () => {
  assert.equal(jobUrl('03-nouveaux-postes-ouverts-chez-cfc-50082'), 'https://cm.minajobs.net/emplois/03-nouveaux-postes-ouverts-chez-cfc-50082');
});

test('portable text flattens to plain text with bullets', () => {
  const blocks = [
    { _type: 'block', children: [{ _type: 'span', text: 'ATHARI recrute ' }, { _type: 'span', text: '08 postes' }] },
    { _type: 'block', listItem: 'bullet', children: [{ _type: 'span', text: 'Caissier' }] },
    { _type: 'block', children: [{ _type: 'span', text: '   ' }] },
    { _type: 'image', asset: {} },
  ];
  assert.equal(portableTextToPlain(blocks), 'ATHARI recrute 08 postes\n• Caissier');
  assert.equal(portableTextToPlain('  plain  '), 'plain');
  assert.equal(portableTextToPlain(undefined), '');
});
