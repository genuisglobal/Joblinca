'use client';

import { useEffect, useState } from 'react';
import { Gift, Copy, Check, Share2 } from 'lucide-react';

export default function ReferralCard() {
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch('/api/referral')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.code) {
          setCode(data.code);
          setCount(data.referralCount ?? 0);
        }
      })
      .catch(() => {});
  }, []);

  if (!code) return null;

  const baseUrl =
    typeof window !== 'undefined' ? window.location.origin : '';
  const referralUrl = `${baseUrl}/auth/register?ref=${code}`;

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsAppShare() {
    const text = `Join me on Joblinca — Cameroon's job marketplace! Sign up free: ${referralUrl}`;
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600/10">
          <Gift className="h-5 w-5 text-primary-400" />
        </div>
        <div>
          <h3 className="font-semibold text-white text-sm">Invite Friends</h3>
          <p className="text-xs text-neutral-400">
            {count > 0
              ? `${count} ${count === 1 ? 'person' : 'people'} joined via your link`
              : 'Share Joblinca with friends'}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 hover:bg-neutral-700 transition-colors"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              Copy Link
            </>
          )}
        </button>
        <button
          onClick={handleWhatsAppShare}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs text-white hover:bg-green-500 transition-colors"
        >
          <Share2 className="h-3.5 w-3.5" />
          WhatsApp
        </button>
      </div>
    </div>
  );
}
