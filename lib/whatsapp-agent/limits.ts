import { getUserSubscription } from '@/lib/subscriptions';

export const FREE_MONTHLY_VIEW_LIMIT = 10;
export const FREE_MONTHLY_APPLY_LIMIT = 4;

export interface WaLimitContext {
  subscribed: boolean;
  viewsMonthlyLimit: number;
  appliesMonthlyLimit: number;
}

export interface ViewBatchDecision {
  visibleCount: number;
  lockedCount: number;
  incrementBy: number;
  limitReached: boolean;
}

export async function getWaLimitContext(userId: string | null): Promise<WaLimitContext> {
  if (!userId) {
    return {
      subscribed: false,
      viewsMonthlyLimit: FREE_MONTHLY_VIEW_LIMIT,
      appliesMonthlyLimit: FREE_MONTHLY_APPLY_LIMIT,
    };
  }

  try {
    const sub = await getUserSubscription(userId);
    if (sub.isActive) {
      return {
        subscribed: true,
        viewsMonthlyLimit: Number.MAX_SAFE_INTEGER,
        appliesMonthlyLimit: Number.MAX_SAFE_INTEGER,
      };
    }
  } catch {
    // Fall through to free limits if subscription lookup fails.
  }

  return {
    subscribed: false,
    viewsMonthlyLimit: FREE_MONTHLY_VIEW_LIMIT,
    appliesMonthlyLimit: FREE_MONTHLY_APPLY_LIMIT,
  };
}

export function evaluateViewBatch(params: {
  subscribed: boolean;
  currentViews: number;
  batchSize: number;
}): ViewBatchDecision {
  const { subscribed, currentViews, batchSize } = params;

  if (batchSize <= 0) {
    return {
      visibleCount: 0,
      lockedCount: 0,
      incrementBy: 0,
      limitReached: false,
    };
  }

  if (subscribed) {
    return {
      visibleCount: batchSize,
      lockedCount: 0,
      incrementBy: batchSize,
      limitReached: false,
    };
  }

  if (currentViews >= FREE_MONTHLY_VIEW_LIMIT) {
    return {
      visibleCount: Math.min(1, batchSize),
      lockedCount: Math.max(0, batchSize - 1),
      incrementBy: 0,
      limitReached: true,
    };
  }

  const remaining = Math.max(0, FREE_MONTHLY_VIEW_LIMIT - currentViews);
  const visibleCount = Math.min(batchSize, remaining);

  return {
    visibleCount,
    lockedCount: Math.max(0, batchSize - visibleCount),
    incrementBy: visibleCount,
    limitReached: visibleCount < batchSize,
  };
}

export function canApplyNow(params: {
  subscribed: boolean;
  currentApplies: number;
}): boolean {
  if (params.subscribed) return true;
  return params.currentApplies < FREE_MONTHLY_APPLY_LIMIT;
}

