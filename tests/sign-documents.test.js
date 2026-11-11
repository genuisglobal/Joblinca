const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(relativePath, stubs = {}) {
  const source = fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', transpiled)(
    (id) => (id in stubs ? stubs[id] : require(id)),
    module,
    module.exports
  );
  return module.exports;
}

const links = load('lib/storage/resume-links.ts');
const docs = load('lib/storage/sign-documents.ts', { '@/lib/storage/resume-links': links });

const BASE = 'https://abc.supabase.co/storage/v1/object';
const U = '6a278f40-6b4e-45ac-8ccb-7600867eb490';
const idUrl = `${BASE}/public/documents/verifications/${U}/id-document-1.jpg`;
const selfieUrl = `${BASE}/public/documents/verifications/${U}/selfie-1.jpg`;

async function main() {
  assert.equal(docs.getVerificationDocumentPath(idUrl), `verifications/${U}/id-document-1.jpg`);
  assert.equal(docs.getVerificationDocumentPath(`${BASE}/public/avatars/verifications/x.jpg`), null, 'wrong bucket');
  assert.equal(docs.getVerificationDocumentPath(`${BASE}/public/documents/other/x.jpg`), null, 'outside verifications/');
  console.log('ok - verification document paths');

  const calls = [];
  const service = {
    storage: {
      from: (bucket) => ({
        createSignedUrls: async (paths, ttl) => {
          calls.push({ bucket, paths, ttl });
          return { data: paths.map((p) => ({ path: p, signedUrl: `${BASE}/sign/${bucket}/${p}?token=t` })), error: null };
        },
      }),
    },
  };
  const rows = [
    { id: 1, id_document_url: idUrl, selfie_url: selfieUrl, business_registration_url: null, company: 'A' },
    { id: 2, id_document_url: idUrl, selfie_url: 'https://drive.google.com/x', business_registration_url: `${BASE}/public/documents/../secrets.pdf` },
  ];
  const signed = await docs.signVerificationDocuments(service, rows);
  assert.equal(calls.length, 1, 'one batch call');
  assert.equal(calls[0].bucket, 'documents');
  assert.equal(calls[0].ttl, 3600);
  assert.deepEqual(calls[0].paths.sort(), [`verifications/${U}/id-document-1.jpg`, `verifications/${U}/selfie-1.jpg`], 'deduplicated');
  assert.equal(signed[0].id_document_url, `${BASE}/sign/documents/verifications/${U}/id-document-1.jpg?token=t`);
  assert.equal(signed[0].business_registration_url, null);
  assert.equal(signed[0].company, 'A', 'other fields untouched');
  assert.equal(signed[1].selfie_url, 'https://drive.google.com/x', 'external links pass through');
  assert.equal(signed[1].business_registration_url, null, 'a documents-bucket URL that cannot be signed is never handed out raw');
  assert.equal(rows[0].id_document_url, idUrl, 'input not mutated');

  const failing = { storage: { from: () => ({ createSignedUrls: async () => ({ data: null, error: { message: 'boom' } }) }) } };
  const err = console.error; console.error = () => {};
  const none = await docs.signVerificationDocuments(failing, [rows[0]]);
  console.error = err;
  assert.equal(none[0].id_document_url, null, 'signing failure -> no link, not the raw private URL');
  console.log('ok - signVerificationDocuments: one batch, deduped, never leaks raw private URLs');
}

main().catch((error) => {
  console.error('Test failure:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
