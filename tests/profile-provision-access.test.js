const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(process.cwd(), 'lib/profile/provision-access.ts'), 'utf8');
const out = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
const mod = { exports: {} };
new Function('require', 'module', 'exports', out)(require, mod, mod.exports);
const access = mod.exports;

const NOW = Date.parse('2026-10-03T12:00:00Z');
const minutesAgo = (m) => new Date(NOW - m * 60_000).toISOString();
const decide = (over) =>
  access.decideProvisionAccess({ userId: 'u1', role: 'job_seeker', callerId: null, authUserCreatedAt: minutesAgo(2), now: NOW, ...over });

// The attack: anonymous, someone else's id, staff role.
for (const role of ['admin', 'staff', 'field_agent', 'vetting_officer', 'verification_officer', 'superadmin', '', null]) {
  assert.deepEqual(decide({ role }), { ok: false, status: 400, error: 'Role not allowed' }, String(role));
}
assert.deepEqual(decide({ authUserCreatedAt: minutesAgo(60 * 24 * 90) }), { ok: false, status: 401, error: 'Authentication required' }, 'established account, no session');
assert.deepEqual(decide({ authUserCreatedAt: null }), { ok: false, status: 404, error: 'User not found' });
assert.deepEqual(decide({ authUserCreatedAt: minutesAgo(31) }).ok, false, 'just past the window');
assert.deepEqual(decide({ authUserCreatedAt: new Date(NOW + 60_000).toISOString() }).ok, false, 'future timestamp');
console.log('ok - anonymous callers: no staff roles, no established accounts');

assert.deepEqual(decide({}), { ok: true, via: 'fresh_signup' }, 'signup before email confirmation');
for (const role of ['job_seeker', 'talent', 'recruiter']) assert.equal(decide({ role }).ok, true, role);
assert.deepEqual(decide({ callerId: 'u1', authUserCreatedAt: minutesAgo(99999) }), { ok: true, via: 'session' });
assert.deepEqual(decide({ callerId: 'someone-else' }), { ok: false, status: 403, error: 'You can only set up your own profile' });
console.log('ok - legitimate signup and OAuth callers allowed; sessions must match the user');

// Profile writes.
assert.deepEqual(
  access.buildProfileWrite({ userId: 'u1', role: 'recruiter', fullName: 'Ada', phone: '+237670000001', avatarUrl: null, existing: null }),
  { id: 'u1', full_name: 'Ada', phone: '+237670000001', role: 'recruiter', avatar_url: null }
);
assert.equal(
  access.buildProfileWrite({ userId: 'u1', role: 'job_seeker', fullName: 'Mallory', phone: '+237699999999', avatarUrl: null, existing: { full_name: 'Ada', phone: '+237670000001' } }),
  null,
  'existing profile: role, name and phone are never overwritten'
);
assert.deepEqual(
  access.buildProfileWrite({ userId: 'u1', role: 'job_seeker', fullName: 'Ada', phone: '+237670000001', avatarUrl: null, existing: { full_name: null, phone: '' } }),
  { full_name: 'Ada', phone: '+237670000001' },
  'only empty fields are filled, and role is not in the patch'
);
console.log('ok - existing profiles keep their role; only empty name/phone filled');
console.log('All profile-provision-access tests passed.');
