'use client';

import { useEffect, useState } from 'react';

interface MobileApplyBarProps {
  targetId: string;
  title: string;
  company: string | null;
  label: string;
}

/**
 * Phone-only bar pinned to the bottom of a job page. On small screens the
 * apply options sit below the full description (often thousands of pixels
 * down), so this keeps "Apply" one tap away. It hides itself while the
 * apply section is already on screen.
 */
export default function MobileApplyBar({ targetId, title, company, label }: MobileApplyBarProps) {
  const [targetVisible, setTargetVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setTargetVisible(entry.isIntersecting),
      { threshold: 0.15 }
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  const scrollToApply = () => {
    document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div
      className={`lg:hidden fixed inset-x-0 bottom-0 z-mobile-bar border-t border-gray-700 bg-gray-900/95 backdrop-blur px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-transform duration-200 ${
        targetVisible ? 'translate-y-full' : 'translate-y-0'
      }`}
      aria-hidden={targetVisible}
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{title}</p>
          {company && <p className="truncate text-xs text-gray-400">{company}</p>}
        </div>
        <button
          type="button"
          onClick={scrollToApply}
          tabIndex={targetVisible ? -1 : 0}
          className="shrink-0 rounded-lg bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {label}
        </button>
      </div>
    </div>
  );
}
