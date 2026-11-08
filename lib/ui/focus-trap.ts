/**
 * Pure helpers behind useFocusTrap (no React, no DOM globals), so the Tab
 * wrapping rules can be unit-tested in tests/ui-focus-trap.test.js.
 */

export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Where Tab (or Shift+Tab) should move focus, given the index of the
 * currently focused element among `count` focusable elements (-1 when focus
 * is outside the container). Returns null to let the browser handle it.
 */
export function nextTrapIndex(currentIndex: number, count: number, shiftKey: boolean): number | null {
  if (count <= 0) return null;
  if (currentIndex < 0) return shiftKey ? count - 1 : 0;
  if (shiftKey && currentIndex === 0) return count - 1;
  if (!shiftKey && currentIndex === count - 1) return 0;
  return null;
}
