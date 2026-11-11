'use client';

import { useId, type ReactNode } from 'react';

export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
}

/** Shared input styling: 16px text on phones (no iOS zoom), visible focus. */
export const fieldInputClasses =
  'w-full rounded-lg border border-line-strong bg-surface px-3 py-2.5 text-base text-fg placeholder:text-fg-subtle ' +
  'focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-focus/40 sm:text-sm ' +
  'aria-[invalid=true]:border-danger-fg';

/**
 * Label + control + hint + error, wired together for screen readers.
 * The control is passed as a render function receiving the id/aria props:
 *
 *   <Field label="Email" error={err}>{(p) => <input {...p} className={fieldInputClasses} />}</Field>
 */
export default function Field({
  label,
  hint,
  error,
  required = false,
  className = '',
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: (props: FieldControlProps) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-fg">
        {label}
        {required && (
          <span className="ml-0.5 text-danger-fg" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
        'aria-required': required ? true : undefined,
      })}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-fg-subtle">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs text-danger-fg">
          {error}
        </p>
      )}
    </div>
  );
}
