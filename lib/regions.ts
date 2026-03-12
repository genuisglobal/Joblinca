/**
 * Platform region configuration.
 * Cameroon is the default/launch region.
 */

export interface Region {
  id: string;
  name: string;
  currencyCode: string;
  currencySymbol: string;
  locale: string;
  timezone: string;
}

export const DEFAULT_REGION: Region = {
  id: 'cm',
  name: 'Cameroon',
  currencyCode: 'XAF',
  currencySymbol: 'FCFA',
  locale: 'fr',
  timezone: 'Africa/Douala',
};

/**
 * Format a salary amount using the region's currency.
 */
export function formatSalary(
  amount: number,
  region: Region = DEFAULT_REGION
): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M ${region.currencySymbol}`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}K ${region.currencySymbol}`;
  }
  return `${amount.toLocaleString()} ${region.currencySymbol}`;
}

/**
 * Format a salary for compact display (e.g. in job cards).
 */
export function formatSalaryCompact(
  amount: number,
  region: Region = DEFAULT_REGION
): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `${Math.round(amount / 1_000)}K`;
  }
  return amount.toLocaleString();
}

/**
 * Get the display label for a region.
 */
export function getRegionFlag(regionId: string): string {
  const flags: Record<string, string> = {
    cm: '\u{1F1E8}\u{1F1F2}',
    ng: '\u{1F1F3}\u{1F1EC}',
    ke: '\u{1F1F0}\u{1F1EA}',
    gh: '\u{1F1EC}\u{1F1ED}',
    sn: '\u{1F1F8}\u{1F1F3}',
    rw: '\u{1F1F7}\u{1F1FC}',
  };
  return flags[regionId] || '';
}
