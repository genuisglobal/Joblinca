const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTs(relativePath) {
  const absolutePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
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

function run() {
  const links = loadTs(path.join('lib', 'storage', 'resume-links.ts'));
  const applicantId = '6a278f40-6b4e-45ac-8ccb-7600867eb49';
  const filePath = `${applicantId}/1773773603428-arj4.pdf`;
  const signedUrl =
    `https://example.supabase.co/storage/v1/object/sign/application-cvs/${filePath}?token=expired`;

  assert.deepEqual(links.parseStorageObjectReference(signedUrl), {
    bucket: 'application-cvs',
    path: filePath,
  });
  console.log('ok - signed Supabase resume URLs parse to bucket and path');

  assert.equal(links.getApplicationCvPath(filePath, applicantId), filePath);
  assert.equal(links.getApplicationCvPath(signedUrl, applicantId), filePath);
  assert.equal(links.getApplicationCvPath(filePath, 'other-user'), null);
  console.log('ok - application CV paths must belong to the applicant');

  const publicUrl = links.buildStoragePublicUrl(
    'application-cvs',
    `${applicantId}/resume final.pdf`,
    'https://example.supabase.co/'
  );
  assert.equal(
    publicUrl,
    `https://example.supabase.co/storage/v1/object/public/application-cvs/${applicantId}/resume%20final.pdf`
  );
  console.log('ok - stable Supabase storage URLs are generated without signed tokens');
}

run();
