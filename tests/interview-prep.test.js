const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadTsModule(relativePath, overrides = {}) {
  const filePath = path.join(process.cwd(), relativePath);
  const source = fs.readFileSync(filePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.CommonJS,
      esModuleInterop: true,
    },
  }).outputText;

  const loadedModule = { exports: {} };
  const localRequire = (specifier) => {
    if (Object.prototype.hasOwnProperty.call(overrides, specifier)) {
      return overrides[specifier];
    }
    return require(specifier);
  };

  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

async function run() {
  const policiesStub = {
    buildInterviewPrepSystemPrompt: () => 'system',
    buildInterviewPrepUserPrompt: () => 'user',
    buildInterviewPrepFollowUpSystemPrompt: () => 'followup-system',
  };
  const originalConsoleError = console.error;

  try {
    const feedbackModule = loadTsModule(path.join('lib', 'interview-prep', 'feedback.ts'));
    const readinessModule = loadTsModule(path.join('lib', 'interview-prep', 'readiness.ts'), {
      '@/lib/interview-prep/feedback': feedbackModule,
    });

    const noAiModule = loadTsModule(path.join('lib', 'ai', 'interviewPrep.ts'), {
      '@/lib/ai/client': {
        isAiConfigured: () => false,
        callAiJson: async () => {
          throw new Error('should_not_be_called');
        },
      },
      '@/lib/ai/policies': policiesStub,
    });

    const noAiResult = await noAiModule.generateInterviewPrepPack({
      jobTitle: 'Operations Associate',
      companyName: 'Acme Logistics',
      jobDescription: 'Coordinate operations and track delivery issues.',
      candidateSkills: ['Customer service', 'Excel'],
      coverLetter: 'I have hands-on experience handling customer issues and reporting tasks.',
      hasResume: true,
      screeningQuestions: [
        {
          question: 'What tools do you use daily?',
          required: true,
          answer: 'Excel, Google Sheets, and WhatsApp for customer follow-up.',
        },
      ],
      nextInterview: {
        scheduledAt: '2026-03-21T09:00:00.000Z',
        timezone: 'Africa/Douala',
        mode: 'video',
      },
    });

    assert.equal(noAiResult.modelUsed, 'rule_based_v1');
    assert.match(
      noAiResult.summary,
      /AI interview prep unavailable\. Showing a deterministic prep pack only\./
    );
    assert.ok(
      noAiResult.likelyQuestions.some(
        (item) => item.question === 'What tools do you use daily?'
      )
    );
    assert.ok(noAiResult.checklist.some((item) => /camera|microphone|internet/i.test(item)));
    const initialMessage = noAiModule.createInitialInterviewPrepMessage(noAiResult);
    assert.match(initialMessage.content, /Prep pack ready\./);

    const noAiFollowUp = await noAiModule.generateInterviewPrepFollowUp({
      jobTitle: 'Operations Associate',
      companyName: 'Acme Logistics',
      prepPack: noAiResult,
      messages: [initialMessage],
      userMessage: 'I used Excel to track issues and followed up with customers until they were resolved.',
    });

    assert.equal(noAiFollowUp.modelUsed, 'rule_based_v1');
    assert.ok(noAiFollowUp.feedback);
    assert.ok(noAiFollowUp.message.feedback);
    assert.equal(noAiFollowUp.message.feedback.overallScore, noAiFollowUp.feedback.overallScore);
    assert.ok(noAiFollowUp.feedback.overallScore >= 0);
    assert.match(noAiFollowUp.message.content, /Feedback:/);
    assert.match(noAiFollowUp.message.content, /Next question:/);

    const readinessAttempts = [
      readinessModule.normalizeInterviewPrepAttemptRow({
        id: 'attempt-2',
        session_id: 'session-1',
        application_id: 'application-1',
        user_id: 'user-1',
        question: 'Tell me about yourself.',
        user_message: 'I used Excel to track issues and followed up with customers until they were resolved.',
        feedback_json: noAiFollowUp.feedback,
        overall_score: noAiFollowUp.feedback.overallScore,
        model_used: noAiFollowUp.modelUsed,
        tokens_used: 0,
        created_at: '2026-03-20T10:00:00.000Z',
      }),
      readinessModule.normalizeInterviewPrepAttemptRow({
        id: 'attempt-1',
        session_id: 'session-1',
        application_id: 'application-1',
        user_id: 'user-1',
        question: 'Tell me about yourself.',
        user_message: 'I worked on customer support tasks.',
        feedback_json: {
          ...noAiFollowUp.feedback,
          overallScore: Math.max(0, noAiFollowUp.feedback.overallScore - 12),
        },
        overall_score: Math.max(0, noAiFollowUp.feedback.overallScore - 12),
        model_used: noAiFollowUp.modelUsed,
        tokens_used: 0,
        created_at: '2026-03-19T10:00:00.000Z',
      }),
    ].filter(Boolean);

    const readiness = readinessModule.buildInterviewPrepReadinessSummary(readinessAttempts);
    assert.ok(readiness);
    assert.equal(readiness.attemptCount, 2);
    assert.equal(readiness.latestScore, noAiFollowUp.feedback.overallScore);
    assert.equal(readiness.trend, 'improving');
    console.log('ok - interview prep falls back cleanly when AI is not configured');

    console.error = () => {};

    const failingAiModule = loadTsModule(path.join('lib', 'ai', 'interviewPrep.ts'), {
      '@/lib/ai/client': {
        isAiConfigured: () => true,
        callAiJson: async () => {
          throw new Error('openai timeout');
        },
      },
      '@/lib/ai/policies': policiesStub,
    });

    const failingAiResult = await failingAiModule.generateInterviewPrepPack({
      jobTitle: 'Frontend Developer',
      companyName: 'Joblinca',
      jobDescription: 'Build modern frontend flows and collaborate with product and design.',
      candidateSkills: ['React', 'TypeScript', 'CSS'],
      profileSummary: 'I build web interfaces and improve product usability.',
      hasResume: false,
      screeningQuestions: [],
    });

    assert.equal(failingAiResult.modelUsed, 'rule_based_v1');
    assert.ok(
      failingAiResult.risksToAddress.some((item) => /resume/i.test(item))
    );
    assert.ok(
      failingAiResult.questionsToAsk.some((item) => /success look like/i.test(item))
    );
    console.log('ok - interview prep still returns a usable pack when the AI call fails');
  } finally {
    console.error = originalConsoleError;
  }
}

run()
  .then(() => {
    console.log('All interview prep tests passed.');
  })
  .catch((error) => {
    console.error('Test failure:', error instanceof Error ? error.message : error);
    process.exit(1);
  });
