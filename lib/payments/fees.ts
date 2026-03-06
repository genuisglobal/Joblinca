const DEFAULT_PROCESSING_FEE_PERCENT = 3;

function parseFeePercent(raw: string | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_PROCESSING_FEE_PERCENT;
  }
  if (parsed > 100) {
    return 100;
  }
  return parsed;
}

export function getProcessingFeePercentServer(): number {
  const raw =
    process.env.NEXT_PUBLIC_PAYMENT_PROCESSING_FEE_PERCENT ||
    process.env.PAYMENT_PROCESSING_FEE_PERCENT;
  return parseFeePercent(raw);
}

export function getProcessingFeePercentClient(): number {
  return parseFeePercent(process.env.NEXT_PUBLIC_PAYMENT_PROCESSING_FEE_PERCENT);
}

export interface ChargeBreakdown {
  subtotalAmount: number;
  processingFeePercent: number;
  processingFeeAmount: number;
  totalAmount: number;
}

export function calculateChargeBreakdown(
  subtotalAmount: number,
  processingFeePercent: number
): ChargeBreakdown {
  const safeSubtotal = Math.max(0, Math.round(subtotalAmount));
  const feeAmount = Math.round((safeSubtotal * processingFeePercent) / 100);
  const totalAmount = safeSubtotal + feeAmount;

  return {
    subtotalAmount: safeSubtotal,
    processingFeePercent,
    processingFeeAmount: feeAmount,
    totalAmount,
  };
}
