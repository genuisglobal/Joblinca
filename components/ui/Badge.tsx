import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger';

const TONES: Record<BadgeTone, string> = {
  neutral: 'border-line-strong bg-surface-raised text-fg-muted',
  primary: 'border-primary-500/40 bg-primary-500/10 text-primary-300',
  success: 'border-success/40 bg-success/10 text-success-fg',
  warning: 'border-warning/40 bg-warning/10 text-warning-fg',
  danger: 'border-danger/40 bg-danger/10 text-danger-fg',
};

/**
 * Small status label. Always carries text (and optionally an icon), so the
 * meaning never depends on colour alone.
 */
export default function Badge({
  tone = 'neutral',
  icon,
  children,
  className = '',
}: {
  tone?: BadgeTone;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${TONES[tone]} ${className}`}
    >
      {icon}
      {children}
    </span>
  );
}
