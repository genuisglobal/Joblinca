const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function resolveModulePath(fromPath, request) {
  const cwd = process.cwd();

  if (request.startsWith('@/')) {
    const base = path.join(cwd, request.slice(2));
    return resolveWithExtensions(base);
  }

  if (request.startsWith('./') || request.startsWith('../')) {
    const base = path.join(path.dirname(fromPath), request);
    return resolveWithExtensions(base);
  }

  return null;
}

function resolveWithExtensions(basePath) {
  const candidates = [
    basePath,
    `${basePath}.ts`,
    `${basePath}.tsx`,
    `${basePath}.js`,
    `${basePath}.jsx`,
    path.join(basePath, 'index.ts'),
    path.join(basePath, 'index.js'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to resolve module: ${basePath}`);
}

function createLoader() {
  const cache = new Map();

  function loadModule(filePath) {
    const normalizedPath = path.normalize(filePath);
    if (cache.has(normalizedPath)) {
      return cache.get(normalizedPath).exports;
    }

    const source = fs.readFileSync(normalizedPath, 'utf8');
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
        esModuleInterop: true,
      },
    }).outputText;

    const module = { exports: {} };
    cache.set(normalizedPath, module);

    const localRequire = (request) => {
      const resolved = resolveModulePath(normalizedPath, request);
      if (resolved) {
        return loadModule(resolved);
      }
      return require(request);
    };

    const fn = new Function('require', 'module', 'exports', transpiled);
    fn(localRequire, module, module.exports);
    return module.exports;
  }

  return {
    load(relativePath) {
      return loadModule(path.join(process.cwd(), relativePath));
    },
  };
}

function run() {
  const loader = createLoader();
  const dashboard = loader.load(path.join('lib', 'applications', 'dashboard.ts'));

  const baseApplications = [
    dashboard.normalizeApplicationRow({
      id: 'app-1',
      status: 'submitted',
      is_draft: false,
      created_at: '2026-03-01T10:00:00.000Z',
      stage_entered_at: '2026-03-02T10:00:00.000Z',
      decision_status: 'active',
      cover_letter: null,
      current_stage: {
        id: 'stage-1',
        stage_key: 'interview',
        label: 'Interview',
        stage_type: 'interview',
        order_index: 3,
        is_terminal: false,
        allows_feedback: true,
      },
      jobs: {
        id: 'job-1',
        title: 'Frontend Internship',
        company_name: 'Acme Labs',
        location: 'Douala',
        work_type: 'hybrid',
        job_type: 'internship',
        internship_track: 'professional',
      },
    }),
    dashboard.normalizeApplicationRow({
      id: 'app-2',
      status: 'submitted',
      is_draft: false,
      created_at: '2026-03-01T12:00:00.000Z',
      stage_entered_at: '2026-03-02T12:00:00.000Z',
      decision_status: 'active',
      cover_letter: null,
      current_stage: null,
      jobs: {
        id: 'job-2',
        title: 'Campus Internship',
        company_name: 'Joblinca',
        location: 'Yaounde',
        work_type: 'onsite',
        job_type: 'internship',
        internship_track: 'education',
      },
    }),
  ];

  const interviews = [
    dashboard.normalizeInterviewRow({
      id: 'int-1',
      application_id: 'app-1',
      scheduled_at: '2026-03-10T14:00:00.000Z',
      timezone: 'Africa/Douala',
      mode: 'video',
      location: null,
      meeting_url: 'https://meet.example.com/a',
      notes: 'Bring your portfolio',
      status: 'scheduled',
      candidate_response_status: 'pending',
      candidate_responded_at: null,
      candidate_response_note: null,
      confirmation_sent_at: null,
      reminder_sent_at: null,
    }),
    dashboard.normalizeInterviewRow({
      id: 'int-2',
      application_id: 'app-1',
      scheduled_at: '2026-03-09T14:00:00.000Z',
      timezone: 'Africa/Douala',
      mode: 'phone',
      location: null,
      meeting_url: null,
      notes: null,
      status: 'cancelled',
      candidate_response_status: 'pending',
      candidate_responded_at: null,
      candidate_response_note: null,
      confirmation_sent_at: null,
      reminder_sent_at: null,
    }),
    dashboard.normalizeInterviewRow({
      id: 'int-3',
      application_id: 'app-2',
      scheduled_at: '2026-03-08T16:00:00.000Z',
      timezone: 'Africa/Douala',
      mode: 'onsite',
      location: 'Campus office',
      meeting_url: null,
      notes: 'Bring school documents',
      status: 'scheduled',
      candidate_response_status: 'confirmed',
      candidate_responded_at: '2026-03-07T08:00:00.000Z',
      candidate_response_note: 'I will be there',
      confirmation_sent_at: null,
      reminder_sent_at: null,
    }),
  ];

  const merged = dashboard.attachInterviewsToApplications(baseApplications, interviews);

  assert.equal(merged[0].interviews.length, 2);
  assert.equal(merged[0].nextInterview.id, 'int-1');
  assert.equal(merged[1].nextInterview.id, 'int-3');
  console.log('ok - applications merge interview history and next interview correctly');

  assert.equal(dashboard.countUpcomingInterviews(merged), 2);
  console.log('ok - upcoming interview count reflects applications with scheduled interviews');

  const summary = dashboard.getApplicationProgressSummary(merged[0]);
  assert.match(summary, /Upcoming interview scheduled for/);
  console.log('ok - progress summary prioritizes upcoming interviews');

  const confirmedSummary = dashboard.getApplicationProgressSummary(merged[1]);
  assert.match(confirmedSummary, /Interview confirmed for/);
  console.log('ok - progress summary reflects confirmed interview attendance');

  const entries = dashboard.getUpcomingInterviewEntries(merged, 1);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].application.id, 'app-2');
  assert.equal(entries[0].responseLabel, 'Confirmed');
  console.log('ok - upcoming interview entries sort chronologically');

  const updatedApplications = dashboard.applyInterviewUpdateToApplications(merged, {
    ...merged[0].nextInterview,
    candidateResponseStatus: 'declined',
    candidateRespondedAt: '2026-03-08T10:00:00.000Z',
    candidateResponseNote: 'I need another slot',
  });
  assert.equal(updatedApplications[0].nextInterview.candidateResponseStatus, 'declined');
  assert.equal(
    updatedApplications[0].nextInterview.candidateResponseNote,
    'I need another slot'
  );
  console.log('ok - interview response updates propagate back into application cards');
}

run();
