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
  const scoring = loadModule(path.join('lib', 'matching-agent', 'scoring.ts'));

  const rolesForJob = scoring.targetRolesForJob('job');
  assert.deepEqual(rolesForJob, ['job_seeker']);
  console.log('ok - normal job targets job seekers only');

  const rolesForInternship = scoring.targetRolesForJob('internship');
  assert.deepEqual(rolesForInternship, ['job_seeker', 'talent']);
  console.log('ok - internship targets job seekers and talent');

  const strongMatch = scoring.scoreCandidateForJob(
    {
      title: 'Frontend React Internship',
      description: 'Build React UI components and TypeScript features',
      location: 'Douala',
      companyName: 'Acme Labs',
      jobType: 'internship',
    },
    {
      userId: 'candidate-1',
      role: 'talent',
      summary: 'Computer science student focused on React and TypeScript',
      skills: ['React', 'TypeScript', 'CSS'],
      locationPreferences: ['Douala', 'Remote'],
      internshipEligible: true,
    }
  );
  assert.ok(strongMatch.score >= 55, `expected strong score, got ${strongMatch.score}`);
  assert.equal(strongMatch.locationMatched, true);
  console.log('ok - strong internship candidate scores high');

  const weakMatch = scoring.scoreCandidateForJob(
    {
      title: 'Senior Accountant',
      description: 'Financial reporting and accounting compliance',
      location: 'Yaounde',
      companyName: 'Finance Corp',
      jobType: 'job',
    },
    {
      userId: 'candidate-2',
      role: 'job_seeker',
      summary: 'Junior mobile developer with Android focus',
      skills: ['Kotlin', 'Android'],
      locationPreferences: ['Buea'],
      internshipEligible: true,
    }
  );
  assert.ok(weakMatch.score <= 30, `expected weak score, got ${weakMatch.score}`);
  console.log('ok - unrelated candidate scores low');

  const remoteMatch = scoring.scoreCandidateForJob(
    {
      title: 'Remote Backend Engineer',
      description: 'Build Node.js APIs and maintain PostgreSQL services',
      location: 'Remote - Worldwide',
      companyName: 'Cloud Systems',
      jobType: 'job',
      workType: 'remote',
    },
    {
      userId: 'candidate-3',
      role: 'job_seeker',
      summary: 'Backend developer focused on Node.js and PostgreSQL',
      skills: ['Node.js', 'PostgreSQL', 'APIs'],
      locationPreferences: ['Douala'],
      internshipEligible: true,
    }
  );
  assert.ok(remoteMatch.score >= 40, `expected remote match to ignore location mismatch, got ${remoteMatch.score}`);
  console.log('ok - remote jobs ignore location mismatch');

  const internshipEligibleScore = scoring.scoreCandidateForJob(
    {
      title: 'Data Science Internship',
      description: 'Python, machine learning and analytics support',
      location: 'Yaounde',
      companyName: 'AI Hub',
      jobType: 'internship',
    },
    {
      userId: 'candidate-4',
      role: 'talent',
      summary: 'Student interested in Python machine learning',
      skills: ['Python', 'Machine Learning'],
      locationPreferences: ['Yaounde'],
      internshipEligible: true,
    }
  );
  const internshipFlexibleScore = scoring.scoreCandidateForJob(
    {
      title: 'Data Science Internship',
      description: 'Python, machine learning and analytics support',
      location: 'Yaounde',
      companyName: 'AI Hub',
      jobType: 'internship',
    },
    {
      userId: 'candidate-5',
      role: 'talent',
      summary: 'Student interested in Python machine learning',
      skills: ['Python', 'Machine Learning'],
      locationPreferences: ['Yaounde'],
      internshipEligible: false,
    }
  );
  assert.equal(
    internshipEligibleScore.score,
    internshipFlexibleScore.score,
    'expected internship eligibility to be flexible'
  );
  console.log('ok - internship eligibility remains flexible');

  const neutralHistoryMatch = scoring.scoreCandidateForJob(
    {
      title: 'Backend Node.js Engineer',
      description: 'Build APIs with Node.js and PostgreSQL',
      location: 'Douala',
      companyName: 'Scale Labs',
      jobType: 'job',
    },
    {
      userId: 'candidate-6',
      role: 'job_seeker',
      summary: 'Backend engineer focused on Node.js and PostgreSQL',
      skills: ['Node.js', 'PostgreSQL'],
      locationPreferences: ['Douala'],
      internshipEligible: true,
      atsSignals: {
        totalApplications: 0,
        hiredCount: 0,
        rejectedCount: 0,
        eligibleCount: 0,
        needsReviewCount: 0,
        ineligibleCount: 0,
        averageStageScore: 0,
        averageRecruiterRating: 0,
      },
    }
  );

  const positiveHistoryMatch = scoring.scoreCandidateForJob(
    {
      title: 'Backend Node.js Engineer',
      description: 'Build APIs with Node.js and PostgreSQL',
      location: 'Douala',
      companyName: 'Scale Labs',
      jobType: 'job',
    },
    {
      userId: 'candidate-7',
      role: 'job_seeker',
      summary: 'Backend engineer focused on Node.js and PostgreSQL',
      skills: ['Node.js', 'PostgreSQL'],
      locationPreferences: ['Douala'],
      internshipEligible: true,
      atsSignals: {
        totalApplications: 5,
        hiredCount: 1,
        rejectedCount: 0,
        eligibleCount: 5,
        needsReviewCount: 0,
        ineligibleCount: 0,
        averageStageScore: 82,
        averageRecruiterRating: 4.5,
      },
    }
  );

  assert.ok(
    positiveHistoryMatch.score > neutralHistoryMatch.score,
    `expected positive ATS history to improve score (${positiveHistoryMatch.score} <= ${neutralHistoryMatch.score})`
  );
  assert.match(
    positiveHistoryMatch.reasons.join(' '),
    /recruiter outcomes|recruiter ratings|eligibility history/i
  );
  console.log('ok - positive ATS outcomes boost future matching scores');

  const negativeHistoryMatch = scoring.scoreCandidateForJob(
    {
      title: 'Backend Node.js Engineer',
      description: 'Build APIs with Node.js and PostgreSQL',
      location: 'Douala',
      companyName: 'Scale Labs',
      jobType: 'job',
    },
    {
      userId: 'candidate-8',
      role: 'job_seeker',
      summary: 'Backend engineer focused on Node.js and PostgreSQL',
      skills: ['Node.js', 'PostgreSQL'],
      locationPreferences: ['Douala'],
      internshipEligible: true,
      atsSignals: {
        totalApplications: 4,
        hiredCount: 0,
        rejectedCount: 3,
        eligibleCount: 1,
        needsReviewCount: 2,
        ineligibleCount: 2,
        averageStageScore: 20,
        averageRecruiterRating: 1.5,
      },
    }
  );

  assert.ok(
    negativeHistoryMatch.score < neutralHistoryMatch.score,
    `expected weak ATS history to reduce score (${negativeHistoryMatch.score} >= ${neutralHistoryMatch.score})`
  );
  console.log('ok - weak ATS outcomes reduce future matching scores');
}

try {
  run();
  console.log('All job-matching-agent tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
