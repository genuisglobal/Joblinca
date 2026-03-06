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
  const localRequire = (id) => {
    if (id === '@/lib/whatsapp') {
      return {
        toE164: (value) => (String(value || '').startsWith('+') ? String(value) : `+${value}`),
      };
    }
    return require(id);
  };
  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function createFakeDb(rows) {
  return {
    from: () => ({
      select: () => ({
        eq: (_column, value) => ({
          limit: async (count) => ({
            data: rows.filter((row) => row.phone === value).slice(0, count),
          }),
        }),
        ilike: (_column, pattern) => ({
          limit: async (count) => {
            const needle = String(pattern || '')
              .replace(/%/g, '')
              .toLowerCase();
            return {
              data: rows
                .filter((row) => String(row.phone || '').toLowerCase().includes(needle))
                .slice(0, count),
            };
          },
        }),
      }),
    }),
  };
}

async function run() {
  const phoneMatch = loadModule(path.join('lib', 'phone-match.ts'));

  assert.equal(phoneMatch.normalizePhoneDigits('+237 677-12-34-56'), '237677123456');
  console.log('ok - normalize phone digits');

  const candidates = phoneMatch.buildPhoneLookupCandidates('+237677123456');
  assert.equal(candidates.includes('+237677123456'), true);
  assert.equal(candidates.includes('237677123456'), true);
  assert.equal(candidates.includes('677123456'), true);
  assert.equal(candidates.includes('0677123456'), true);
  console.log('ok - lookup candidates');

  const exactScore = phoneMatch.scorePhoneDigitMatch('+237677123456', '+237677123456');
  const localScore = phoneMatch.scorePhoneDigitMatch('+237677123456', '677123456');
  const mismatchScore = phoneMatch.scorePhoneDigitMatch('+237677123456', '123456789');

  assert.equal(exactScore > localScore, true);
  assert.equal(localScore > mismatchScore, true);
  console.log('ok - score ranking');

  const exactDb = createFakeDb([
    { id: 'user-1', phone: '+237677123456' },
    { id: 'user-2', phone: '+237699000000' },
  ]);
  const exactResolved = await phoneMatch.resolveProfileIdByPhone(exactDb, '+237677123456');
  assert.equal(exactResolved, 'user-1');
  console.log('ok - exact profile resolution');

  const ambiguousFuzzyDb = createFakeDb([
    { id: 'user-a', phone: '677123456' },
    { id: 'user-b', phone: '0677123456' },
  ]);
  const ambiguousResolved = await phoneMatch.resolveProfileIdByPhone(ambiguousFuzzyDb, '+237677123456');
  assert.equal(ambiguousResolved, null);
  console.log('ok - ambiguous fuzzy resolution returns null');
}

try {
  run()
    .then(() => {
      console.log('All wa-phone-match tests passed.');
    })
    .catch((error) => {
      console.error('Test failure:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
