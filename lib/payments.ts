/**
 * @deprecated Use `lib/payments/index.ts` and `lib/payments/payunit.ts` instead.
 *
 * This file is kept for backward compatibility. All new payment logic should
 * import from `@/lib/payments/` (Payunit integration) or
 * `@/lib/payments/payunit` (low-level Payunit API).
 */

export {
  initiateSubscriptionPayment,
  initiateJobTierPayment,
  calculateDiscount,
  validatePromoCode,
} from './payments/index';

export {
  initializePayment,
  makePayment,
  getPaymentStatus,
  buildPayunitTransactionId,
  detectCarrier,
  normalizePhone,
  resolveGateway,
} from './payments/payunit';
