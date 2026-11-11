/**
 * Pure billing rules for shortlist hires: what a hire from a shortlist costs
 * under each billing model, and how long an introduction stays billable.
 * Prices follow the Joblinca Market & Sales Strategy (Oct 2026).
 */

export const BILLING_MODELS = ['prepaid', 'pay_per_result', 'success_fee', 'free'] as const;
export type BillingModel = (typeof BILLING_MODELS)[number];

export const PAY_PER_RESULT_PLAN_SLUG = 'job_tier2_pay_per_result';
export const SHORTLIST_PLAN_SLUG = 'job_tier2_shortlist';

/** Hire 72 Standard (85,000) minus the 15,000 deposit already paid. */
export const PAY_PER_RESULT_BALANCE_XAF = 70_000;
/** Default success fee: half of the first month's salary. */
export const DEFAULT_SUCCESS_FEE_PERCENT = 50;
/** An introduced candidate stays billable for 6 months after delivery. */
export const INTRODUCTION_WINDOW_MONTHS = 6;

export type HireFeeType = 'pay_per_result_balance' | 'success_fee';
export type HireStatus = 'no_fee' | 'needs_review' | 'due' | 'paid' | 'waived';

export interface HireFee {
  feeType: HireFeeType | null;
  amountXaf: number | null;
  status: HireStatus;
  basis: string;
}

export function isBillingModel(value: unknown): value is BillingModel {
  return typeof value === 'string' && (BILLING_MODELS as readonly string[]).includes(value);
}

/** The billing model a plan purchase gives its shortlist request. */
export function billingModelForPlan(planSlug: string): BillingModel {
  return planSlug === PAY_PER_RESULT_PLAN_SLUG ? 'pay_per_result' : 'prepaid';
}

export function computeHireFee(params: {
  billingModel: BillingModel;
  monthlySalaryXaf?: number | null;
  successFeePercent?: number | null;
}): HireFee {
  switch (params.billingModel) {
    case 'pay_per_result':
      return {
        feeType: 'pay_per_result_balance',
        amountXaf: PAY_PER_RESULT_BALANCE_XAF,
        status: 'due',
        basis: 'Pay-per-result balance (Hire 72 Standard minus the 15,000 deposit)',
      };
    case 'success_fee': {
      const percent = params.successFeePercent ?? DEFAULT_SUCCESS_FEE_PERCENT;
      const salary = params.monthlySalaryXaf;
      if (typeof salary !== 'number' || !Number.isFinite(salary) || salary <= 0) {
        return {
          feeType: 'success_fee',
          amountXaf: null,
          status: 'needs_review',
          basis: `Success fee: ${percent}% of the first month's salary (salary not yet known)`,
        };
      }
      return {
        feeType: 'success_fee',
        amountXaf: Math.round((salary * percent) / 100),
        status: 'due',
        basis: `Success fee: ${percent}% of a ${salary.toLocaleString('en-US')} FCFA monthly salary`,
      };
    }
    case 'prepaid':
      return { feeType: null, amountXaf: null, status: 'no_fee', basis: 'Shortlist paid up front' };
    case 'free':
      return { feeType: null, amountXaf: null, status: 'no_fee', basis: 'Free shortlist' };
  }
}

/** The last day a hire of a candidate delivered at `deliveredAt` is billable. */
export function introductionWindowEnd(deliveredAt: string | Date): Date {
  const end = new Date(deliveredAt);
  end.setUTCMonth(end.getUTCMonth() + INTRODUCTION_WINDOW_MONTHS);
  return end;
}

export function isWithinIntroductionWindow(
  deliveredAt: string | Date | null | undefined,
  hiredAt: string | Date = new Date()
): boolean {
  if (!deliveredAt) return false;
  const delivered = new Date(deliveredAt);
  const hired = new Date(hiredAt);
  if (Number.isNaN(delivered.getTime()) || Number.isNaN(hired.getTime())) return false;
  return hired >= delivered && hired <= introductionWindowEnd(delivered);
}

/** Positive integer FCFA amount from user input ("150 000", "150,000"), else null. */
export function parseXaf(input: unknown): number | null {
  if (typeof input === 'number') {
    return Number.isInteger(input) && input > 0 ? input : null;
  }
  if (typeof input !== 'string') return null;
  const digits = input.replace(/[\s,.]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  const value = Number(digits);
  return value > 0 && value <= 100_000_000 ? value : null;
}

export function formatXaf(amount: number): string {
  return `${amount.toLocaleString('en-US')} FCFA`;
}

export function buildFeeDueMessage(params: {
  candidateName: string;
  jobTitle: string;
  amountXaf: number;
  link: string;
}): string {
  const amount = formatXaf(params.amountXaf);
  return [
    `Congratulations on hiring ${params.candidateName} for "${params.jobTitle}" through Joblinca. The balance of ${amount} is now due.`,
    `Félicitations pour le recrutement de ${params.candidateName} pour « ${params.jobTitle} » via Joblinca. Le solde de ${amount} est maintenant dû.`,
    '',
    `Pay by MTN MoMo or Orange Money / Payez par MoMo ou Orange Money: ${params.link}`,
  ].join('\n');
}
