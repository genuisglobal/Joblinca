const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadStateMachineModule() {
  const filePath = path.join(
    process.cwd(),
    'lib',
    'whatsapp-screening',
    'state-machine.ts'
  );

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
  const sm = loadStateMachineModule();

  // parseLanguageSelection accepts English/French selectors
  assert.equal(sm.parseLanguageSelection('1'), 'en');
  assert.equal(sm.parseLanguageSelection('english'), 'en');
  assert.equal(sm.parseLanguageSelection('2'), 'fr');
  assert.equal(sm.parseLanguageSelection('fr'), 'fr');
  assert.equal(sm.parseLanguageSelection('spanish'), null);
  console.log('ok - parseLanguageSelection');

  // parseApplyIntent extracts UUID job reference
  const intent = sm.parseApplyIntent(
    'APPLY 123e4567-e89b-12d3-a456-426614174000',
    null,
    false
  );
  assert.equal(intent.isApplyIntent, true);
  assert.equal(intent.jobId, '123e4567-e89b-12d3-a456-426614174000');
  assert.equal(intent.entrySource, 'apply_command');
  console.log('ok - parseApplyIntent');

  // evaluateAnswer handles must-have yes/no
  const question = {
    id: 'work_authorization',
    type: 'yesno',
    required: true,
    mustHave: true,
    weight: 0,
    promptEn: 'Q',
    promptFr: 'Q',
  };

  const accepted = sm.evaluateAnswer(question, 'yes');
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.mustHavePassed, true);

  const rejected = sm.evaluateAnswer(question, 'no');
  assert.equal(rejected.accepted, true);
  assert.equal(rejected.mustHavePassed, false);
  console.log('ok - evaluateAnswer yes/no');

  // computeFinalScoring rejects when a must-have fails
  const questionsReject = sm.buildHybridQuestionCatalog('Software Engineer');
  const evaluationsReject = questionsReject.map((q) => ({
    questionId: q.id,
    evaluation: {
      accepted: true,
      normalizedAnswer: null,
      scoreDelta: q.mustHave ? 0 : q.weight,
      mustHavePassed: q.mustHave ? false : null,
    },
  }));

  const resultReject = sm.computeFinalScoring(questionsReject, evaluationsReject);
  assert.equal(resultReject.mustHavePassed, false);
  assert.equal(resultReject.resultLabel, 'reject');
  console.log('ok - computeFinalScoring reject');

  // computeFinalScoring qualifies when must-have passes and score is high
  const questionsQualified = sm.buildHybridQuestionCatalog('Sales Manager');
  const evaluationsQualified = questionsQualified.map((q) => ({
    questionId: q.id,
    evaluation: {
      accepted: true,
      normalizedAnswer: null,
      scoreDelta: q.mustHave ? 0 : q.weight,
      mustHavePassed: q.mustHave ? true : null,
    },
  }));

  const resultQualified = sm.computeFinalScoring(questionsQualified, evaluationsQualified);
  assert.equal(resultQualified.mustHavePassed, true);
  assert.ok(resultQualified.weightedScore >= 70);
  assert.equal(resultQualified.resultLabel, 'qualified');
  console.log('ok - computeFinalScoring qualify');

  // zero-weight optional questions should not affect weighted score
  const baseQuestions = sm.buildHybridQuestionCatalog('Engineer');
  const questionsWithOptional = [
    ...baseQuestions,
    {
      id: 'ai_followup',
      type: 'text',
      required: false,
      mustHave: false,
      weight: 0,
      promptEn: 'Optional follow-up',
      promptFr: 'Suivi optionnel',
    },
  ];
  const baseEvaluations = baseQuestions.map((q) => ({
    questionId: q.id,
    evaluation: {
      accepted: true,
      normalizedAnswer: null,
      scoreDelta: q.mustHave ? 0 : q.weight,
      mustHavePassed: q.mustHave ? true : null,
    },
  }));
  const withOptionalEvaluations = [
    ...baseEvaluations,
    {
      questionId: 'ai_followup',
      evaluation: {
        accepted: true,
        normalizedAnswer: 'extra details',
        scoreDelta: 20,
        mustHavePassed: null,
      },
    },
  ];

  const baseResult = sm.computeFinalScoring(baseQuestions, baseEvaluations);
  const withOptionalResult = sm.computeFinalScoring(
    questionsWithOptional,
    withOptionalEvaluations
  );
  assert.equal(withOptionalResult.weightedScore, baseResult.weightedScore);
  assert.equal(withOptionalResult.resultLabel, baseResult.resultLabel);
  console.log('ok - zero-weight optional question ignored');
}

try {
  run();
  console.log('All wa-screening state-machine tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
