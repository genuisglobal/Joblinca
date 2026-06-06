'use client';

import { useEffect, useState } from 'react';
import { Gift, Copy, Check, Share2 } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/context';
import { addLocalePrefix } from '@/lib/i18n/locale';

export default function ReferralCard() {
  const { t, locale } = useTranslation();
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
  const referralUrl = `${baseUrl}${addLocalePrefix('/auth/register', locale)}?ref=${code}`;

  function handleCopy() {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleWhatsAppShare() {
    const text = t('referral.whatsappShareText', { url: referralUrl });
    window.open(
      `https://wa.me/?text=${encodeURIComponent(text)}`,
      '_blank'
    );
  }

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-600/10">
          <Gift className="h-5 w-5 text-primary-400" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white">{t('referral.title')}</h3>
          <p className="text-xs text-neutral-400">
            {count > 0
              ? t('referral.joinedViaLink', {
                  count,
                  label:
                    count === 1 ? t('referral.person') : t('referral.people'),
                })
              : t('referral.empty')}
          </p>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={handleCopy}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-neutral-300 transition-colors hover:bg-neutral-700"
        >
          {copied ? (
            <>
              <Check className="h-3.5 w-3.5 text-green-400" />
              {t('common.copied')}
            </>
          ) : (
            <>
              <Copy className="h-3.5 w-3.5" />
              {t('referral.copyLink')}
            </>
          )}
        </button>
        <button
          onClick={handleWhatsAppShare}
          className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs text-white transition-colors hover:bg-green-500"
        >
          <Share2 className="h-3.5 w-3.5" />
          {t('referral.whatsapp')}
        </button>
      </div>
    </div>
  );
}
