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
  const mod = loadModule(path.join('lib', 'interview-scheduling', 'calendar.ts'));

  const event = mod.buildInterviewCalendarEvent({
    interviewId: 'int-123',
    scheduledAt: '2026-03-10T14:00:00.000Z',
    jobTitle: 'Frontend Internship',
    companyName: 'Acme Labs',
    modeLabel: 'Video call',
    location: 'HQ Room 2',
    meetingUrl: 'https://meet.example.com/room',
    notes: 'Bring your portfolio.',
    manageUrl: 'https://joblinca.com/dashboard',
  });

  assert.equal(event.filename, 'frontend-internship-2026-03-10.ics');
  assert.match(event.googleCalendarUrl, /calendar\.google\.com/);
  assert.match(event.googleCalendarUrl, /Frontend\+Internship/);
  assert.match(event.outlookCalendarUrl, /outlook\.live\.com/);
  assert.match(event.icsContent, /BEGIN:VCALENDAR/);
  assert.match(event.icsContent, /SUMMARY:Interview: Frontend Internship - Acme Labs/);
  assert.match(event.icsContent, /DTSTART:20260310T140000Z/);
  assert.match(event.icsContent, /DTEND:20260310T150000Z/);
  assert.match(event.icsContent, /Meeting link: https:\/\/meet\.example\.com\/room/);
  console.log('ok - calendar event exports include provider links and ICS payload');

  const fallback = mod.buildInterviewCalendarEvent({
    interviewId: 'int-456',
    scheduledAt: '2026-03-11T09:30:00.000Z',
  });

  assert.equal(fallback.title, 'Interview: Interview');
  assert.equal(fallback.filename, 'interview-2026-03-11.ics');
  console.log('ok - calendar event exports fall back cleanly when optional metadata is missing');
}

run();
