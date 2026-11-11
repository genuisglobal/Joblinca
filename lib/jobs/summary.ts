/**
 * Short plain-text summary of a job description for list views.
 *
 * List cards only show two lines, but the full description (often 2,000+
 * characters of scraped text) used to be rendered and then serialized again
 * in the React payload. Cutting it on the server keeps /jobs small.
 * Detail pages and JSON-LD keep the full description.
 */
export const DEFAULT_SUMMARY_LENGTH = 200;

export function summarizeDescription(
  description: string | null | undefined,
  maxLength: number = DEFAULT_SUMMARY_LENGTH
): string | null {
  if (!description) return null;
  const text = description.replace(/\s+/g, ' ').trim();
  if (!text) return null;

  // Work in code points so emoji / surrogate pairs are never split.
  const chars = Array.from(text);
  if (chars.length <= maxLength) return text;

  let cut = chars.slice(0, maxLength).join('');

  // Do not end inside an HTML entity such as "&#xe9;" or "&amp;".
  const ampersand = cut.lastIndexOf('&');
  if (ampersand !== -1 && !cut.slice(ampersand).includes(';') && cut.length - ampersand <= 10) {
    cut = cut.slice(0, ampersand);
  }

  // Prefer a word boundary if one is reasonably close to the limit.
  const lastSpace = cut.lastIndexOf(' ');
  if (lastSpace >= cut.length * 0.6) {
    cut = cut.slice(0, lastSpace);
  }

  // ";" is not stripped: it may close an entity such as "&#xe9;".
  return `${cut.replace(/[\s,:.\-–—]+$/, '')}…`;
}
