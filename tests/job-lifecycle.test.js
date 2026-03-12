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

function run() {
  const lifecycle = loadModule(path.join('lib', 'jobs', 'lifecycle.ts'));
  const now = new Date('2026-03-12T12:00:00.000Z');

  assert.equal(
    lifecycle.getJobManagementStatus({
      published: true,
      approval_status: 'approved',
      lifecycle_status: 'closed_reviewing',
    }),
    'closed_reviewing'
  );
  console.log('ok - recruiter status surfaces closed jobs');

  assert.equal(
    lifecycle.isJobPubliclyListable({
      published: true,
      approval_status: 'approved',
      lifecycle_status: 'live',
      closes_at: '2026-03-13T12:00:00.000Z',
    }, now),
    true
  );
  assert.equal(
    lifecycle.isJobPubliclyListable({
      published: true,
      approval_status: 'approved',
      lifecycle_status: 'closed_reviewing',
      closes_at: '2026-03-11T12:00:00.000Z',
    }, now),
    false
  );
  console.log('ok - public listing helper excludes closed jobs from feeds');

  assert.equal(
    lifecycle.shouldArchiveClosedJob({
      lifecycle_status: 'closed_reviewing',
      closed_at: '2026-02-01T12:00:00.000Z',
      archived_at: null,
      filled_at: null,
      target_hire_date: '2026-02-05',
      retention_expires_at: null,
    }, now),
    true
  );
  console.log('ok - closed jobs archive after target hire retention');

  assert.equal(
    lifecycle.shouldArchiveFilledJob({
      filled_at: '2026-02-01T12:00:00.000Z',
      archived_at: null,
      retention_expires_at: '2026-03-01T12:00:00.000Z',
    }, now),
    true
  );
  console.log('ok - filled jobs archive once retention expires');
}

try {
  run();
  console.log('All job lifecycle tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
