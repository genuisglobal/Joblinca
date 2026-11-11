'use client';

import { useEffect } from 'react';

// Shared across every caller, so a dialog opened from inside a drawer does
// not unlock the page when it closes while the drawer is still open.
let lockCount = 0;
let previousOverflow = '';

/** Stop the page behind an overlay from scrolling while `active` is true. */
export function useScrollLock(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    if (lockCount === 0) {
      previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;
    return () => {
      lockCount -= 1;
      if (lockCount === 0) {
        document.body.style.overflow = previousOverflow;
      }
    };
  }, [active]);
}
