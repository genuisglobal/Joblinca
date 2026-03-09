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
  const localRequire = (request) => {
    if (request.startsWith('.')) {
      const resolved = path.join(path.dirname(relativePath), request);
      const normalized = path.normalize(
        resolved.endsWith('.ts') || resolved.endsWith('.js') ? resolved : `${resolved}.ts`
      );
      return loadModule(normalized);
    }

    return require(request);
  };

  const fn = new Function('require', 'module', 'exports', transpiled);
  fn(localRequire, module, module.exports);
  return module.exports;
}

function run() {
  const eligibility = loadModule(path.join('lib', 'applications', 'eligibility.ts'));

  const educationMatch = eligibility.evaluateApplicationEligibility({
    job: {
      published: true,
      approvalStatus: 'approved',
      closesAt: null,
      jobType: 'internship',
      internshipTrack: 'education',
      visibility: 'public',
      eligibleRoles: ['talent'],
    },
    requirements: {
      schoolRequired: true,
      allowedSchools: ['University of Buea'],
      allowedFieldsOfStudy: ['Computer Science'],
      allowedSchoolYears: ['Final Year'],
      graduationYearMin: 2026,
      graduationYearMax: 2027,
      requiresSchoolConvention: true,
      academicSupervisorRequired: true,
    },
    context: {
      role: 'talent',
      schoolName: 'University of Buea',
      fieldOfStudy: 'Computer Science',
      schoolYear: 'Final Year',
      graduationYear: 2026,
      hasSchoolConvention: true,
      academicSupervisor: 'Dr. Neba',
      projectCount: 3,
      badgeCount: 2,
      resumeUrl: 'https://example.com/resume.pdf',
      phone: '+237600000000',
      email: 'student@example.com',
    },
  });

  assert.equal(educationMatch.eligibilityStatus, 'eligible');
  assert.equal(educationMatch.blockingReasons.length, 0);
  assert.match(educationMatch.matchedSignals.join(' '), /School match/);
  console.log('ok - educational internship preview accepts matching academic profiles');

  const educationBlocked = eligibility.evaluateApplicationEligibility({
    job: {
      published: true,
      approvalStatus: 'approved',
      closesAt: null,
      jobType: 'internship',
      internshipTrack: 'education',
      visibility: 'public',
      eligibleRoles: ['talent'],
    },
    requirements: {
      schoolRequired: true,
      allowedSchools: ['University of Buea'],
      requiresSchoolConvention: true,
    },
    context: {
      role: 'talent',
      schoolName: 'University of Douala',
      fieldOfStudy: 'Economics',
      schoolYear: 'Third Year',
      graduationYear: 2026,
      hasSchoolConvention: false,
      academicSupervisor: '',
      projectCount: 0,
      badgeCount: 0,
      resumeUrl: 'https://example.com/resume.pdf',
      phone: '+237600000000',
      email: 'student@example.com',
    },
  });

  assert.equal(educationBlocked.eligibilityStatus, 'ineligible');
  assert.match(educationBlocked.blockingReasons.join(' '), /school|convention/i);
  console.log('ok - educational internship preview blocks mismatched schools and missing convention');

  const professionalReview = eligibility.evaluateApplicationEligibility({
    job: {
      published: true,
      approvalStatus: 'approved',
      closesAt: null,
      jobType: 'internship',
      internshipTrack: 'professional',
      visibility: 'public',
      eligibleRoles: ['job_seeker', 'talent'],
    },
    requirements: {
      minimumProjectCount: 3,
      minimumBadgeCount: 2,
      expectedWeeklyAvailability: '20 hours/week',
    },
    context: {
      role: 'job_seeker',
      fieldOfStudy: 'Computer Engineering',
      weeklyAvailability: '10 hours/week',
      projectCount: 1,
      badgeCount: 0,
      portfolioUrl: '',
      resumeUrl: '',
      phone: '+237600000000',
      email: 'candidate@example.com',
    },
  });

  assert.equal(professionalReview.eligibilityStatus, 'needs_review');
  assert.match(
    professionalReview.recommendedProfileUpdates.join(' '),
    /project|badge|resume/i
  );
  console.log('ok - professional internship preview recommends portfolio-strengthening updates');
}

try {
  run();
  console.log('All application eligibility tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
