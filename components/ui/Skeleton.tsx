/** Loading placeholder. Hidden from screen readers; pair it with a status message. */
export default function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded-md bg-surface-raised ${className}`} />;
}
