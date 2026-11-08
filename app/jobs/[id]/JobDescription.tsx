'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { blocksTextLength, type DescriptionBlock } from '@/lib/jobs/format-description';

/** Descriptions longer than this collapse below lg until "Read more". */
const COLLAPSE_AT_CHARS = 700;

/**
 * Renders formatted description blocks as plain text elements (no HTML
 * injection). Long descriptions start collapsed on phones and tablets; the
 * full text is always in the DOM (search engines, screen readers, find-in-page),
 * and desktop always shows it in full.
 */
export default function JobDescription({
  blocks,
  moreLabel,
  lessLabel,
}: {
  blocks: DescriptionBlock[];
  moreLabel: string;
  lessLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const contentId = useId();
  const collapsible = blocksTextLength(blocks) > COLLAPSE_AT_CHARS;
  const collapsed = collapsible && !expanded;

  return (
    <div>
      <div
        id={contentId}
        className={`relative space-y-3 text-[15px] leading-relaxed text-gray-300 ${
          collapsed ? 'max-h-80 overflow-hidden lg:max-h-none lg:overflow-visible' : ''
        }`}
      >
        {blocks.map((block, index) => {
          if (block.type === 'heading') {
            return (
              <h3 key={index} className="pt-2 text-base font-semibold text-white">
                {block.text}
              </h3>
            );
          }
          if (block.type === 'list') {
            return (
              <ul key={index} className="list-disc space-y-1.5 pl-5 marker:text-gray-500">
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{item}</li>
                ))}
              </ul>
            );
          }
          return <p key={index}>{block.text}</p>;
        })}
        {collapsed && (
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-gray-800 to-transparent lg:hidden"
            aria-hidden="true"
          />
        )}
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          aria-controls={contentId}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-1 text-sm font-semibold text-blue-400 hover:text-blue-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus lg:hidden"
        >
          {expanded ? lessLabel : moreLabel}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
