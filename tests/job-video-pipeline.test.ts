import assert from 'node:assert/strict';

import { createDailyVideoBatches } from '@/lib/videos/job-video-batcher';
import {
  classifyJobCategory,
  classifyVideoJob,
  detectLanguage,
  detectUrgency,
  normalizeLocation,
} from '@/lib/videos/job-video-classifier';
import type { RawVideoJob } from '@/lib/videos/types';

function makeRawJob(id: string, overrides: Partial<RawVideoJob> = {}): RawVideoJob {
  return {
    id,
    publicId: null,
    title: 'Junior Accountant',
    description: 'Apply now for an accounting role in Douala.',
    company: 'DHL',
    languageHint: 'en',
    sourceLanguage: 'en',
    rawLocation: 'Douala, Cameroon',
    cityHint: 'Douala',
    salary: null,
    salaryText: null,
    workType: 'onsite',
    jobType: 'job',
    internshipTrack: null,
    createdAt: '2026-05-08T08:00:00.000Z',
    closesAt: null,
    published: true,
    approvalStatus: 'approved',
    lifecycleStatus: 'live',
    visibility: 'public',
    recruiterId: 'recruiter-1',
    recruiterVerified: true,
    recruiterVerificationStatus: 'verified',
    approvedBy: 'admin-1',
    postedByRole: 'recruiter',
    applyMethod: 'joblinca',
    applicationUrl: 'https://joblinca.com/jobs/1',
    jobUrl: 'https://joblinca.com/jobs/1',
    applyEmail: null,
    applyPhone: null,
    applyWhatsapp: null,
    sourceName: 'joblinca',
    sourceUrl: null,
    originalJobUrl: null,
    originType: 'native',
    originDiscoveredJobId: null,
    sourceAttribution: null,
    trustScore: 90,
    scamScore: 0,
    discoveredVerificationStatus: null,
    claimStatus: null,
    ingestionStatus: null,
    platformVerificationStatus: 'verified',
    ...overrides,
  };
}

function testLanguageDetection() {
  assert.equal(
    detectLanguage(
      'Responsable Marketing',
      "Recrutement urgent pour une entreprise basee a Douala.",
      'fr'
    ),
    'fr'
  );
  assert.equal(
    detectLanguage('Customer Service Officer', 'Apply now. Hiring in Yaounde.', 'en'),
    'en'
  );
}

function testCategoryClassification() {
  assert.equal(
    classifyJobCategory({
      title: 'Digital Marketing Manager',
      description: 'Lead social media and content campaigns.',
      jobType: 'job',
    }),
    'Marketing & Digital'
  );
}

function testUrgencyDetection() {
  assert.equal(
    detectUrgency('Urgent recruitment for customer care officers', 'Apply now and join immediately.'),
    true
  );
}

function testLocationNormalization() {
  assert.equal(normalizeLocation('Douala, Cameroun'), 'Douala');
  assert.equal(normalizeLocation('Douala and Yaounde'), 'Multiple Locations');
  assert.equal(normalizeLocation(null), 'Cameroon');
}

function testBatchGeneration() {
  const jobs = [
    classifyVideoJob(makeRawJob('job-1')),
    classifyVideoJob(
      makeRawJob('job-2', {
        title: 'Marketing Officer',
        company: 'Dash Media',
        rawLocation: 'Douala',
        cityHint: 'Douala',
        description: 'Digital marketing and content role in Douala.',
      })
    ),
    classifyVideoJob(
      makeRawJob('job-3', {
        title: 'Customer Care Officer',
        company: 'Pategou Consulting',
        rawLocation: 'Douala',
        cityHint: 'Douala',
        description: 'Customer care role. Apply now for urgent recruitment in Douala.',
      })
    ),
    classifyVideoJob(
      makeRawJob('job-4', {
        title: 'Responsable Digital',
        company: 'Dash Media',
        languageHint: 'fr',
        sourceLanguage: 'fr',
        rawLocation: 'Yaounde',
        cityHint: 'Yaounde',
        description: 'Recrutement urgent pour une offre marketing a Yaounde.',
      })
    ),
  ];

  const batches = createDailyVideoBatches(jobs, { date: '2026-05-08' });

  assert.ok(batches.some((batch) => batch.batchType === 'trusted_joblinca_jobs'));
  assert.ok(batches.some((batch) => batch.batchType === 'city_jobs'));
  assert.ok(batches.some((batch) => batch.batchType === 'single_job_alert'));
}

testLanguageDetection();
testCategoryClassification();
testUrgencyDetection();
testLocationNormalization();
testBatchGeneration();

console.log('job video pipeline test passed');
