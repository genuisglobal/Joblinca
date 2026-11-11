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
const { signCvUrl } = load('lib/storage/sign-cv.ts', { '@/lib/storage/resume-links': links });

const OWNER = '6a278f40-6b4e-45ac-8ccb-7600867eb490';
const OTHER = '11111111-2222-3333-4444-555555555555';
const BASE = 'https://abc.supabase.co/storage/v1/object';
const profilePublic = `${BASE}/public/resumes/resumes/${OWNER}/resume-1700000000000.pdf`;

function fakeService() {
  const signed = [];
  return {
    signed,
    storage: {
      from: (bucket) => ({
        createSignedUrl: async (p, ttl) => {
          signed.push([bucket, p, ttl]);
          return { data: { signedUrl: `${BASE}/sign/${bucket}/${p}?token=t` }, error: null };
        },
      }),
    },
  };
}

async function main() {
  // getProfileCvPath: every stored form, owner-only.
  const expected = `resumes/${OWNER}/resume-1700000000000.pdf`;
  assert.equal(links.getProfileCvPath(profilePublic, OWNER), expected);
  assert.equal(links.getProfileCvPath(`${BASE}/sign/resumes/${expected}?token=x`, OWNER), expected);
  assert.equal(links.getProfileCvPath(`storage://resumes/${expected}`, OWNER), expected);
  assert.equal(links.getProfileCvPath(expected, OWNER), expected);
  assert.equal(links.getProfileCvPath(profilePublic, OTHER), null, "someone else's folder");
  assert.equal(links.getProfileCvPath(`${BASE}/public/resumes/resumes/${OWNER}/../${OTHER}/cv.pdf`, OWNER), null, 'no traversal');
  assert.equal(links.getProfileCvPath(`${BASE}/public/avatars/resumes/${OWNER}/x.pdf`, OWNER), null, 'wrong bucket');
  assert.equal(links.isPrivateCvReference(profilePublic), true);
  assert.equal(links.isPrivateCvReference(`${BASE}/public/application-cvs/${OWNER}/cv.pdf`), true);
  assert.equal(links.isPrivateCvReference('https://drive.google.com/file/d/abc'), false);
  console.log('ok - profile CV paths parse from every stored form, owner folder only');

  // signCvUrl
  {
    const service = fakeService();
    const url = await signCvUrl(service, profilePublic, OWNER);
    assert.equal(url, `${BASE}/sign/resumes/${expected}?token=t`);
    assert.deepEqual(service.signed[0], ['resumes', expected, links.CV_SIGNED_URL_TTL_SECONDS]);

    await signCvUrl(service, `${BASE}/public/application-cvs/${OWNER}/1-cv.pdf`, OWNER, 60);
    assert.deepEqual(service.signed[1], ['application-cvs', `${OWNER}/1-cv.pdf`, 60]);

    assert.equal(await signCvUrl(service, profilePublic, OTHER), null, 'never sign or leak a CV outside the owner folder');
    assert.equal(service.signed.length, 2);

    assert.equal(await signCvUrl(service, 'https://drive.google.com/file/d/abc', OWNER), 'https://drive.google.com/file/d/abc', 'external links pass through');
    assert.equal(await signCvUrl(service, 'javascript:alert(1)', OWNER), null);

    const failing = { storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: { message: 'not found' } }) }) } };
    const originalError = console.error;
    console.error = () => {};
    assert.equal(await signCvUrl(failing, profilePublic, OWNER), null);
    console.error = originalError;
  }
  console.log('ok - signCvUrl signs our buckets, passes external links, refuses foreign folders');
}

main().catch((error) => {
  console.error('Test failure:', error instanceof Error ? error.stack : error);
  process.exit(1);
});
