'use client';

import { useState } from 'react';

interface CopyTextButtonProps {
  value: string;
  label?: string;
}

export default function CopyTextButton({
  value,
  label = 'Copy',
}: CopyTextButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-lg border border-gray-600 px-3 py-2 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800"
    >
      {copied ? 'Copied' : label}
    </button>
  );
}
