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
    if (id === '@/lib/onboarding/constants') {
      return { CAMEROON_PHONE_CODE: '+237' };
    }
    if (id === '@/lib/phone-match') {
      return {
        normalizePhoneDigits: (value) => String(value || '').replace(/[^\d]/g, ''),
        resolveProfileIdByPhone: async () => null,
      };
    }
    if (id === './types') {
      return {
        REGISTRATION_LEAD_ACTIVE_STATUSES: ['captured', 'invite_sent', 'opened'],
        REGISTRATION_LEAD_CAPTURE_MODES: ['quick_capture', 'assisted_signup'],
        REGISTRATION_LEAD_ROLES: ['job_seeker', 'talent', 'recruiter'],
        REGISTRATION_LEAD_TERMINAL_STATUSES: [
          'completed',
          'duplicate_existing_user',
          'opted_out',
          'expired',
          'cancelled',
        ],
      };
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const fieldRegistration = loadModule(path.join('lib', 'field-registration', 'service.ts'));

  assert.equal(fieldRegistration.normalizeLeadPhone('677 12 34 56'), '+237677123456');
  assert.equal(fieldRegistration.normalizeLeadPhone('+237 677 12 34 56'), '+237677123456');
  assert.equal(fieldRegistration.normalizeLeadPhone('237677123456'), '+237677123456');
  assert.equal(fieldRegistration.normalizeLeadPhone(''), null);
  console.log('ok - normalizeLeadPhone handles local and international inputs');

  const claimUrl = fieldRegistration.buildLeadClaimUrl(
    'https://joblinca.com/',
    'invite-token-123'
  );
  assert.equal(
    claimUrl,
    'https://joblinca.com/complete-registration/invite-token-123'
  );
  console.log('ok - buildLeadClaimUrl trims trailing slash');

  const hashA = fieldRegistration.hashInviteToken('token-a');
  const hashB = fieldRegistration.hashInviteToken('token-a');
  const hashC = fieldRegistration.hashInviteToken('token-b');
  assert.equal(hashA, hashB);
  assert.notEqual(hashA, hashC);
  assert.equal(typeof hashA, 'string');
  assert.equal(hashA.length, 64);
  console.log('ok - hashInviteToken is deterministic and stable length');
}

try {
  run();
  console.log('All field-registration lead helper tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
