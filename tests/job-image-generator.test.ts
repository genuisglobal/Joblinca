import assert from 'node:assert/strict';

import {
  JobImageRequestValidationError,
  parseJobImageRequest,
} from '../lib/job-image-generator/schema';
import {
  JOB_MARKETING_TEMPLATE,
  buildJobImageHtml,
  buildJobImageVariations,
} from '../lib/job-image-generator/template';

async function main() {
  const parsed = parseJobImageRequest({
    jobs: [
      {
        id: 'job_123',
        title: 'Accountant',
        location: 'Douala',
        salary: '150,000 XAF',
        company: 'Confidential',
        type: 'full-time',
      },
    ],
    options: {
      variations: 3,
      concurrency: 2,
      delivery: 'inline',
    },
  });

  assert.equal(parsed.jobs.length, 1);
  assert.equal(parsed.options.variationCount, 3);
  assert.equal(parsed.options.concurrency, 2);
  assert.equal(parsed.jobs[0].type, 'Full Time');

  const variations = buildJobImageVariations(parsed.jobs[0], parsed.options.variationCount);
  assert.deepEqual(
    variations.map((variation) => variation.key),
    ['urgent-location', 'needed-now', 'apply-today']
  );

  const html = await buildJobImageHtml(
    {
      ...parsed.jobs[0],
      title: '<Accountant>',
    },
    variations[0]
  );
  assert.match(JOB_MARKETING_TEMPLATE, /{{title}}/);
  assert.match(html, /Apply on Joblinca\.com/);
  assert.ok(html.includes('&lt;Accountant&gt;'));
  assert.ok(!html.includes('<Accountant>'));

  let threw = false;
  try {
    parseJobImageRequest([]);
  } catch (error) {
    threw = error instanceof JobImageRequestValidationError;
  }
  assert.equal(threw, true);

  console.log('job-image-generator test passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
