'use client';

import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { useFocusTrap } from '@/lib/hooks/useFocusTrap';
import { useScrollLock } from '@/lib/hooks/useScrollLock';

export interface DialogProps {
  open: boolean;
  /** Called on Escape, backdrop click and the close button (when dismissible). */
  onClose: () => void;
  /** Accessible name. Rendered as the dialog heading unless `labelledBy` is set. */
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Sticky action row at the bottom (buttons). */
  footer?: ReactNode;
  /**
   * "center": centred card on every screen size.
   * "sheet": slides up from the bottom on phones, centred card from `sm` up.
   */
  variant?: 'center' | 'sheet';
  /** max-width of the panel from `sm` up. */
  size?: 'sm' | 'md' | 'lg';
  /**
   * false for blocking prompts the user must answer: no close button, and
   * Escape / backdrop do nothing.
   */
  dismissible?: boolean;
  /** Use an element inside `children` as the heading instead of `title`. */
  labelledBy?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** Where focus goes on close (defaults to the element focused on open). */
  returnFocusRef?: RefObject<HTMLElement | null>;
  /** Extra classes for the panel. */
  className?: string;
}

const SIZES = { sm: 'sm:max-w-sm', md: 'sm:max-w-md', lg: 'sm:max-w-xl' } as const;

/**
 * Accessible modal: portalled to <body> (escapes any parent stacking
 * context, see components/NavBar.tsx for why that matters), role="dialog"
 * + aria-modal, focus trapped and restored, Escape and backdrop to close,
 * page scroll locked, and always fits the screen (`.modal-panel`).
 */
export default function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variant = 'center',
  size = 'md',
  dismissible = true,
  labelledBy,
  initialFocusRef,
  returnFocusRef,
  className = '',
}: DialogProps) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => setMounted(true), []);
  useScrollLock(open);
  useFocusTrap(panelRef, open && mounted, {
    initialFocusRef,
    returnFocusRef,
    onEscape: dismissible ? onClose : undefined,
  });

  if (!mounted || !open) return null;

  const isSheet = variant === 'sheet';

  return createPortal(
    <div
      className={`fixed inset-0 z-dialog flex justify-center bg-black/65 backdrop-blur-sm ${
        isSheet ? 'items-end sm:items-center sm:p-4' : 'items-center p-4'
      }`}
      onMouseDown={(event) => {
        // Only a press that starts on the backdrop itself closes it, so a
        // text selection dragged out of the panel does not.
        if (dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`modal-panel relative flex w-full flex-col border border-line bg-surface-overlay text-fg shadow-2xl ${
          isSheet
            ? 'rounded-t-2xl pb-[env(safe-area-inset-bottom,0px)] sm:rounded-2xl sm:pb-0'
            : 'rounded-2xl'
        } ${SIZES[size]} ${className}`}
      >
        {isSheet && (
          <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden="true" />
        )}

        {!labelledBy && (
          <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 sm:px-6">
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-fg">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-sm text-fg-muted">
                  {description}
                </p>
              )}
            </div>
            {dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="-mr-2 -mt-1 rounded-lg p-2 text-fg-muted transition-colors hover:bg-surface-raised hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                aria-label={t('common.close')}
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}

        <div className={`min-h-0 flex-1 ${labelledBy ? '' : 'px-5 py-4 sm:px-6'}`}>{children}</div>

        {footer && (
          <div className="sticky bottom-0 flex shrink-0 flex-col-reverse gap-2 border-t border-line bg-surface-overlay px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
