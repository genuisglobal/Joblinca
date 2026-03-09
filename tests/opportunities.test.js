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
  const opportunities = loadModule(path.join('lib', 'opportunities.ts'));

  const educationInternship = opportunities.validateOpportunityConfiguration({
    jobType: 'internship',
    visibility: 'public',
    internshipTrack: 'education',
    internshipRequirements: {
      allowedSchoolYears: ['3rd year', 'final year'],
      creditBearing: true,
    },
  });

  assert.equal(educationInternship.valid, true);
  assert.deepEqual(educationInternship.normalized.eligibleRoles, ['talent']);
  assert.equal(educationInternship.normalized.internshipTrack, 'education');
  assert.equal(
    educationInternship.normalized.internshipRequirements.creditBearing,
    true
  );
  console.log('ok - educational internships normalize to talent-only eligibility');

  const invalidEducationInternship = opportunities.validateOpportunityConfiguration({
    jobType: 'internship',
    visibility: 'public',
    internshipTrack: 'education',
    eligibleRoles: ['job_seeker'],
  });

  assert.equal(invalidEducationInternship.valid, false);
  assert.match(
    invalidEducationInternship.errors.join(' '),
    /Educational internships/
  );
  console.log('ok - educational internships reject non-talent applicant roles');

  const professionalInternship = opportunities.validateOpportunityConfiguration({
    jobType: 'internship',
    visibility: 'public',
    internshipTrack: 'professional',
    applyMethod: 'multiple',
  });

  assert.equal(professionalInternship.valid, true);
  assert.deepEqual(
    professionalInternship.normalized.eligibleRoles,
    ['job_seeker', 'talent']
  );
  assert.equal(professionalInternship.normalized.applyIntakeMode, 'hybrid');
  console.log('ok - professional internships default to dual-role eligibility');

  const talentOnlyJob = opportunities.validateOpportunityConfiguration({
    jobType: 'job',
    visibility: 'talent_only',
  });

  assert.equal(talentOnlyJob.valid, true);
  assert.deepEqual(talentOnlyJob.normalized.eligibleRoles, ['talent']);
  console.log('ok - talent-only jobs normalize to talent eligibility');

  assert.equal(
    opportunities.canRoleApplyToOpportunity(
      'talent',
      ['talent'],
      'internship',
      'education',
      'public'
    ),
    true
  );
  assert.equal(
    opportunities.canRoleApplyToOpportunity(
      'job_seeker',
      ['talent'],
      'internship',
      'education',
      'public'
    ),
    false
  );
  console.log('ok - role eligibility helper enforces opportunity targeting');

  assert.equal(
    opportunities.getOpportunityTypeLabel('internship', 'education'),
    'Educational Internship'
  );
  assert.equal(
    opportunities.matchesOpportunityBrowseFilter(
      'internship_professional',
      'internship',
      'professional'
    ),
    true
  );
  assert.equal(
    opportunities.matchesOpportunityBrowseFilter(
      'internship_education',
      'internship',
      'professional'
    ),
    false
  );
  console.log('ok - browse helpers distinguish educational and professional internships');
}

try {
  run();
  console.log('All opportunity tests passed.');
} catch (error) {
  console.error('Test failure:', error instanceof Error ? error.message : error);
  process.exit(1);
}
