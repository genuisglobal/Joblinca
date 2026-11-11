import Link from 'next/link';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'border border-line-strong bg-surface-raised text-fg hover:bg-surface-overlay',
  ghost: 'text-fg-muted hover:bg-surface-raised hover:text-fg',
  danger: 'bg-danger text-white hover:bg-red-700 active:bg-red-800',
};

// md and lg meet the 44px minimum touch target; sm is for dense desktop UI.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-12 px-5 text-base gap-2',
};

const BASE =
  'inline-flex items-center justify-center rounded-lg font-semibold transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 ' +
  'focus-visible:ring-offset-surface disabled:pointer-events-none disabled:opacity-50';

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className = '',
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
} = {}): string {
  return [BASE, VARIANTS[variant], SIZES[size], fullWidth ? 'w-full' : '', className]
    .filter(Boolean)
    .join(' ');
}

interface CommonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'children'> {
  /** Shows a spinner and disables the button. */
  loading?: boolean;
}

/** Action button. For navigation use <ButtonLink>. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, leftIcon, rightIcon, loading = false, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export interface ButtonLinkProps extends CommonProps {
  href: string;
  /** Opens in a new tab with rel="noopener noreferrer". */
  external?: boolean;
  prefetch?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}

/** A link styled as a button (internal routes via next/link). */
export function ButtonLink({
  href,
  external = false,
  prefetch,
  variant,
  size,
  fullWidth,
  leftIcon,
  rightIcon,
  className,
  children,
  ...rest
}: ButtonLinkProps) {
  const classes = buttonClasses({ variant, size, fullWidth, className });
  const content = (
    <>
      {leftIcon}
      {children}
      {rightIcon}
    </>
  );
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={classes} {...rest}>
        {content}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={classes} {...rest}>
      {content}
    </Link>
  );
}
