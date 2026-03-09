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
  const automation = loadModule(path.join('lib', 'interview-scheduling', 'automation.ts'));

  const defaults = automation.normalizeInterviewAutomationSettings({});
  assert.equal(defaults.autoSendRescheduleNotice, true);
  assert.equal(defaults.autoSendCompletionFollowup, false);
  console.log('ok - interview automation defaults are stable');

  const normalized = automation.normalizeInterviewAutomationSettings({
    autoSendNoShowFollowup: false,
    completionFollowupMessage: '  Thanks for meeting with us.  ',
  });
  assert.equal(normalized.autoSendNoShowFollowup, false);
  assert.equal(normalized.completionFollowupMessage, 'Thanks for meeting with us.');
  console.log('ok - interview automation settings normalize booleans and messages');

  const completionMessage = automation.buildInterviewOutcomeMessage({
    type: 'completion',
    jobTitle: 'Frontend Internship',
    companyName: 'Acme Labs',
    interviewTime: 'Mar 8, 2026, 3:00 PM',
    customMessage: null,
  });
  assert.match(completionMessage.subject, /Interview follow-up/);
  assert.match(completionMessage.detail, /reviewing the conversation/i);
  console.log('ok - completion follow-up uses the default outcome wording');

  const noShowMessage = automation.buildInterviewOutcomeMessage({
    type: 'no_show',
    jobTitle: 'Campus Internship',
    companyName: 'Joblinca',
    interviewTime: 'Mar 8, 2026, 10:00 AM',
    customMessage: 'Please reply if you want another slot.',
  });
  assert.equal(noShowMessage.detail, 'Please reply if you want another slot.');
  assert.match(noShowMessage.whatsappText, /another slot/i);
  console.log('ok - no-show follow-up respects recruiter custom messaging');
}

run();
