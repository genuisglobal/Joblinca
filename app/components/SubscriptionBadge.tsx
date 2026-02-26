'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface SubscriptionData {
  isActive: boolean;
  plan: {
    name: string;
    slug: string;
    role: string;
  } | null;
  expiresAt: string | null;
  daysRemaining: number;
}

export default function SubscriptionBadge() {
  const [sub, setSub] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/subscriptions/me')
      .then((res) => res.json())
      .then((data) => {
        setSub(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 animate-pulse">
        <div className="h-4 bg-gray-700 rounded w-24 mb-2"></div>
        <div className="h-3 bg-gray-700 rounded w-16"></div>
      </div>
    );
  }

  if (!sub || !sub.isActive) {
    return (
      <div className="bg-gray-800 rounded-lg p-3 border border-gray-700">
        <p className="text-sm text-gray-400">No active plan</p>
        <Link
          href="/pricing"
          className="text-xs text-blue-400 hover:text-blue-300 mt-1 inline-block"
        >
          Upgrade now
        </Link>
      </div>
    );
  }

  const isExpiringSoon = sub.daysRemaining <= 7;

  return (
    <div
      className={`rounded-lg p-3 border ${
        isExpiringSoon
          ? 'bg-yellow-900/20 border-yellow-700/50'
          : 'bg-gray-800 border-gray-700'
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${
            isExpiringSoon ? 'bg-yellow-400' : 'bg-green-400'
          }`}
        ></span>
        <span className="text-sm font-medium text-white">
          {sub.plan?.name || 'Active Plan'}
        </span>
      </div>
      {sub.expiresAt && (
        <p
          className={`text-xs mt-1 ${
            isExpiringSoon ? 'text-yellow-400' : 'text-gray-400'
          }`}
        >
          {isExpiringSoon
            ? `Expires in ${sub.daysRemaining} day${sub.daysRemaining !== 1 ? 's' : ''}`
            : `Expires ${new Date(sub.expiresAt).toLocaleDateString()}`}
        </p>
      )}
      <div className="flex gap-2 mt-2">
        <Link
          href="/pricing"
          className="text-xs text-blue-400 hover:text-blue-300"
        >
          {isExpiringSoon ? 'Renew' : 'Upgrade'}
        </Link>
      </div>
    </div>
  );
}
