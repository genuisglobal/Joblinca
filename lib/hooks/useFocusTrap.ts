'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { FOCUSABLE_SELECTOR, nextTrapIndex } from '@/lib/ui/focus-trap';

interface FocusTrapOptions {
  /** Element to focus when the trap activates (default: first focusable). */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * Element to focus when the trap deactivates. Defaults to whatever had
   * focus when it activated. Pass the trigger button explicitly: Safari does
   * not focus buttons on click, so "whatever had focus" can be <body>.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Called on Escape. Omit to make Escape do nothing (blocking prompts). */
  onEscape?: () => void;
}

/**
 * While `active`: move focus into `containerRef`, keep Tab / Shift+Tab inside
 * it, and call `onEscape` on Escape. On deactivation, return focus.
 */
export function useFocusTrap(
  containerRef: RefObject<HTMLElement | null>,
  active: boolean,
  { initialFocusRef, returnFocusRef, onEscape }: FocusTrapOptions = {}
): void {
  // Keep the latest callback without re-running the effect (which would
  // steal focus back to the initial element on every render).
  const onEscapeRef = useRef(onEscape);
  onEscapeRef.current = onEscape;

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.getClientRects().length > 0
      );

    const initial = initialFocusRef?.current ?? focusables()[0] ?? container;
    if (initial === container && !container.hasAttribute('tabindex')) {
      container.setAttribute('tabindex', '-1');
    }
    initial.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (onEscapeRef.current) {
          event.preventDefault();
          event.stopPropagation();
          onEscapeRef.current();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const index = items.indexOf(document.activeElement as HTMLElement);
      const target = nextTrapIndex(index, items.length, event.shiftKey);
      if (target !== null) {
        event.preventDefault();
        items[target].focus();
      } else if (items.length === 0) {
        event.preventDefault();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      const back = returnFocusRef?.current ?? previouslyFocused;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
    // Refs are stable; re-run only when the trap turns on or off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
