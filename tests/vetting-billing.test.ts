import assert from 'node:assert/strict';

import {
  billingModelForPlan,
  buildFeeDueMessage,
  computeHireFee,
  introductionWindowEnd,
  isWithinIntroductionWindow,
  parseXaf,
  PAY_PER_RESULT_BALANCE_XAF,
} from '../lib/vetting/billing';

// --- Plans → billing model ---------------------------------------------------
assert.equal(billingModelForPlan('job_tier2_pay_per_result'), 'pay_per_result');
assert.equal(billingModelForPlan('job_tier2_shortlist'), 'prepaid');
assert.equal(billingModelForPlan(''), 'prepaid');
console.log('ok - plan billing models');

// --- Fees --------------------------------------------------------------------
assert.deepEqual(computeHireFee({ billingModel: 'pay_per_result' }), {
  feeType: 'pay_per_result_balance',
  amountXaf: 70_000,
  status: 'due',
  basis: 'Pay-per-result balance (Hire 72 Standard minus the 15,000 deposit)',
});
assert.equal(PAY_PER_RESULT_BALANCE_XAF, 85_000 - 15_000, 'Standard price minus deposit');

const success = computeHireFee({ billingModel: 'success_fee', monthlySalaryXaf: 250_000 });
assert.equal(success.amountXaf, 125_000, 'default 50% of first month');
assert.equal(success.status, 'due');

assert.equal(
  computeHireFee({ billingModel: 'success_fee', monthlySalaryXaf: 400_000, successFeePercent: 15 }).amountXaf,
  60_000
);
assert.equal(
  computeHireFee({ billingModel: 'success_fee', monthlySalaryXaf: 123_457, successFeePercent: 33 }).amountXaf,
  40_741,
  'rounded to whole FCFA'
);

const noSalary = computeHireFee({ billingModel: 'success_fee' });
assert.equal(noSalary.status, 'needs_review', 'success fee without salary waits for review');
assert.equal(noSalary.amountXaf, null);
assert.equal(computeHireFee({ billingModel: 'success_fee', monthlySalaryXaf: 0 }).status, 'needs_review');

for (const model of ['prepaid', 'free'] as const) {
  const fee = computeHireFee({ billingModel: model, monthlySalaryXaf: 300_000 });
  assert.equal(fee.status, 'no_fee');
  assert.equal(fee.amountXaf, null);
}
console.log('ok - hire fees');

// --- Introduction window (6 months) --------------------------------------------
assert.equal(introductionWindowEnd('2026-10-12T10:00:00Z').toISOString(), '2027-04-12T10:00:00.000Z');
assert.ok(isWithinIntroductionWindow('2026-10-12T10:00:00Z', '2026-10-20T00:00:00Z'));
assert.ok(isWithinIntroductionWindow('2026-10-12T10:00:00Z', '2027-04-12T09:00:00Z'));
assert.ok(!isWithinIntroductionWindow('2026-10-12T10:00:00Z', '2027-04-13T00:00:00Z'), 'after 6 months');
assert.ok(!isWithinIntroductionWindow('2026-10-12T10:00:00Z', '2026-10-01T00:00:00Z'), 'before delivery');
assert.ok(!isWithinIntroductionWindow(null));
assert.ok(!isWithinIntroductionWindow('not a date'));
console.log('ok - introduction window');

// --- Amount parsing ------------------------------------------------------------
assert.equal(parseXaf('150 000'), 150_000);
assert.equal(parseXaf('150,000'), 150_000);
assert.equal(parseXaf('150.000'), 150_000);
assert.equal(parseXaf(85000), 85_000);
assert.equal(parseXaf('0'), null);
assert.equal(parseXaf('-5'), null);
assert.equal(parseXaf('12abc'), null);
assert.equal(parseXaf(12.5), null);
assert.equal(parseXaf('999999999999'), null, 'absurd amounts rejected');
console.log('ok - amount parsing');

// --- Message ---------------------------------------------------------------------
const msg = buildFeeDueMessage({ candidateName: 'Awa', jobTitle: 'Cashier', amountXaf: 70_000, link: 'https://joblinca.com/x' });
assert.match(msg, /hiring Awa for "Cashier"/);
assert.match(msg, /70,000 FCFA is now due/);
assert.match(msg, /recrutement de Awa/);
assert.ok(msg.endsWith('https://joblinca.com/x'));
console.log('ok - fee due message');

console.log('All vetting-billing tests passed.');
