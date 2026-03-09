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
  const mod = loadModule(path.join('lib', 'interview-scheduling', 'self-schedule.ts'));

  const defaults = mod.normalizeInterviewSelfScheduleSettings({});
  assert.equal(defaults.minimumNoticeHours, 24);
  assert.equal(defaults.slotIntervalMinutes, 60);
  assert.equal(defaults.weeklyAvailability.monday.enabled, true);
  assert.equal(defaults.weeklyAvailability.sunday.enabled, false);
  console.log('ok - self-schedule defaults are stable');

  const normalized = mod.normalizeInterviewSelfScheduleSettings({
    timezone: 'Africa/Douala',
    minimumNoticeHours: '12',
    slotIntervalMinutes: '45',
    blackoutDates: ['2026-03-15', 'bad-date', '2026-03-15', '2026-03-18'],
    weeklyAvailability: {
      saturday: { enabled: true, startTime: '10:00', endTime: '13:30' },
    },
    slotTemplates: [
      { id: 'video-screen', name: 'Video Screen', mode: 'video', notes: 'Join early.' },
      { id: 'bad-template', mode: 'phone' },
    ],
  });
  assert.equal(normalized.timezone, 'Africa/Douala');
  assert.equal(normalized.minimumNoticeHours, 12);
  assert.equal(normalized.slotIntervalMinutes, 45);
  assert.deepEqual(normalized.blackoutDates, ['2026-03-15', '2026-03-18']);
  assert.equal(normalized.weeklyAvailability.saturday.endTime, '13:30');
  assert.equal(normalized.slotTemplates.length, 1);
  console.log('ok - self-schedule settings normalize inputs and discard invalid templates');

  const allowed = mod.checkSelfScheduleAvailability({
    scheduledAt: '2026-03-09T10:00:00.000Z',
    timezone: 'UTC',
    settings: mod.normalizeInterviewSelfScheduleSettings({
      timezone: 'UTC',
      minimumNoticeHours: 2,
      weeklyAvailability: {
        monday: { enabled: true, startTime: '09:00', endTime: '17:00' },
      },
    }),
    now: new Date('2026-03-09T06:00:00.000Z'),
  });
  assert.equal(allowed.allowed, true);
  console.log('ok - availability check allows slots inside weekly window and notice period');

  const blocked = mod.checkSelfScheduleAvailability({
    scheduledAt: '2026-03-09T07:00:00.000Z',
    timezone: 'UTC',
    settings: mod.normalizeInterviewSelfScheduleSettings({
      timezone: 'UTC',
      minimumNoticeHours: 4,
      weeklyAvailability: {
        monday: { enabled: true, startTime: '09:00', endTime: '17:00' },
      },
    }),
    now: new Date('2026-03-09T05:00:00.000Z'),
  });
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason, /minimum notice/i);
  console.log('ok - availability check blocks slots that violate minimum notice');

  const weekendBlocked = mod.checkSelfScheduleAvailability({
    scheduledAt: '2026-03-08T11:00:00.000Z',
    timezone: 'UTC',
    settings: mod.normalizeInterviewSelfScheduleSettings({
      timezone: 'UTC',
      minimumNoticeHours: 1,
      weeklyAvailability: {
        sunday: { enabled: false, startTime: '09:00', endTime: '17:00' },
      },
    }),
    now: new Date('2026-03-08T06:00:00.000Z'),
  });
  assert.equal(weekendBlocked.allowed, false);
  assert.match(weekendBlocked.reason, /closed on sunday/i);
  console.log('ok - availability check blocks closed weekdays');

  const blackoutBlocked = mod.checkSelfScheduleAvailability({
    scheduledAt: '2026-03-10T10:00:00.000Z',
    timezone: 'UTC',
    settings: mod.normalizeInterviewSelfScheduleSettings({
      timezone: 'UTC',
      minimumNoticeHours: 1,
      blackoutDates: ['2026-03-10'],
      weeklyAvailability: {
        tuesday: { enabled: true, startTime: '09:00', endTime: '17:00' },
      },
    }),
    now: new Date('2026-03-10T06:00:00.000Z'),
  });
  assert.equal(blackoutBlocked.allowed, false);
  assert.match(blackoutBlocked.reason, /2026-03-10/);
  console.log('ok - availability check blocks blackout dates');

  const drafts = mod.buildSelfScheduleSlotDrafts({
    startDate: '2026-03-09',
    endDate: '2026-03-11',
    settings: mod.normalizeInterviewSelfScheduleSettings({
      timezone: 'UTC',
      slotIntervalMinutes: 60,
      blackoutDates: ['2026-03-10'],
      weeklyAvailability: {
        monday: { enabled: true, startTime: '09:00', endTime: '17:00' },
        tuesday: { enabled: true, startTime: '09:00', endTime: '17:00' },
        wednesday: { enabled: true, startTime: '13:30', endTime: '17:00' },
      },
    }),
  });
  assert.deepEqual(
    drafts.map((item) => item.scheduledAt),
    [
      '2026-03-09T09:00:00.000Z',
      '2026-03-09T10:00:00.000Z',
      '2026-03-09T11:00:00.000Z',
      '2026-03-09T12:00:00.000Z',
      '2026-03-09T13:00:00.000Z',
      '2026-03-09T14:00:00.000Z',
      '2026-03-09T15:00:00.000Z',
      '2026-03-09T16:00:00.000Z',
      '2026-03-11T13:30:00.000Z',
      '2026-03-11T14:30:00.000Z',
      '2026-03-11T15:30:00.000Z',
      '2026-03-11T16:30:00.000Z',
    ]
  );
  console.log('ok - slot draft generation expands enabled weekdays by slot interval and skips blackout dates');
}

run();
