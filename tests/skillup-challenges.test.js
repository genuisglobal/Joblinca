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
  const mod = loadModule(path.join('lib', 'skillup', 'challenges.ts'));

  const week = mod.getCurrentDoualaWeekWindow(new Date('2026-03-03T10:00:00.000Z'));
  assert.equal(week.weekKey, '2026-W10');
  assert.equal(week.weekStartDate, '2026-03-02');
  assert.equal(week.weekEndDate, '2026-03-08');
  console.log('ok - current week window (GMT+1, Mon-Sun)');

  const parsed = mod.getDoualaWeekWindowFromKey('2026-W10');
  assert.ok(parsed);
  assert.equal(parsed.weekStartDate, '2026-03-02');
  assert.equal(parsed.weekEndDate, '2026-03-08');
  console.log('ok - week key parsing');

  const quiz = mod.gradeChallengeQuiz(
    [
      { correct_index: 1 },
      { correct_index: 0 },
      { correct_index: 3 },
    ],
    [1, 2, 3]
  );
  assert.equal(quiz.correct, 2);
  assert.equal(quiz.total, 3);
  assert.equal(quiz.score, 66.67);
  console.log('ok - quiz grading');

  const submission = mod.normalizeProjectSubmission({
    summary_text: 'A strong summary',
    github_url: 'https://github.com/example/repo',
    file_url: 'https://drive.google.com/file/d/abc',
  });
  assert.equal(mod.hasRequiredProjectDeliverables(submission), true);
  assert.ok(mod.computeProjectAutoScore(submission) >= 90);
  console.log('ok - project submission requirements + auto score');

  const finalScore = mod.computeBlendedProjectScore(80, 90, {
    project_scoring: { auto_weight: 0.4, manual_weight: 0.6 },
  });
  assert.equal(finalScore, 86);
  console.log('ok - manual + AI blended score');
}

try {
  run();
  console.log('All skillup challenge tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
