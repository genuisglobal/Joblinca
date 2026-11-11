'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import Dialog from '@/components/ui/Dialog';
import { useTranslation } from '@/lib/i18n';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
}

type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

function timeAgo(dateStr: string, t: TranslateFn): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return t('notifications.justNow');
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return t('notifications.minutesAgo', { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.hoursAgo', { count: hours });
  return t('notifications.daysAgo', { count: Math.floor(hours / 24) });
}

/**
 * Bell + notification list. Desktop (lg+): dropdown under the bell.
 * Phones: a bottom sheet (shared Dialog), since a 320px dropdown pinned to
 * the bell does not fit next to the menu button. Render one instance only:
 * each instance polls /api/notifications every 60s.
 */
export default function NotificationBell() {
  const { t } = useTranslation();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [asSheet, setAsSheet] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(data.notifications || []);
      setUnreadCount((data.notifications || []).filter((n: Notification) => !n.read).length);
    } catch {
      // Silent fail
    }
  }, []);

  // Fetch on mount and every 60 seconds
  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60_000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  // Close the desktop dropdown on outside click or Escape.
  useEffect(() => {
    if (!open || asSheet) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open, asSheet]);

  async function markAllRead() {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markAllRead: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }

  function toggle() {
    if (!open) setAsSheet(!window.matchMedia('(min-width: 1024px)').matches);
    setOpen(!open);
  }

  const markAllButton = unreadCount > 0 && (
    <button
      type="button"
      onClick={markAllRead}
      className="min-h-9 rounded-lg px-2 text-xs font-medium text-blue-400 hover:bg-gray-700 hover:text-blue-300"
    >
      {t('notifications.markAllRead')}
    </button>
  );

  const list =
    notifications.length === 0 ? (
      <div className="px-4 py-8 text-center text-sm text-gray-400">{t('notifications.empty')}</div>
    ) : (
      <ul>
        {notifications.map((n) => (
          <li
            key={n.id}
            className={`border-b border-gray-700/50 px-4 py-3 last:border-0 ${n.read ? '' : 'bg-blue-900/10'}`}
          >
            <div className="flex items-start gap-2">
              {!n.read && <span className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-500" aria-hidden="true" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-white">{n.title}</p>
                {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-gray-400">{n.body}</p>}
                <p className="mt-1 text-xs text-gray-400">{timeAgo(n.created_at, t)}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggle}
        className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-800 hover:text-white"
        aria-label={
          unreadCount > 0 ? t('notifications.titleWithCount', { count: unreadCount }) : t('notifications.title')
        }
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {unreadCount > 0 && (
          <span
            className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white"
            aria-hidden="true"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && !asSheet && (
        <div
          role="dialog"
          aria-label={t('notifications.title')}
          className="absolute right-0 top-full z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-gray-700 bg-gray-800 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-gray-700 px-4 py-3">
            <span className="text-sm font-semibold text-white">{t('notifications.title')}</span>
            {markAllButton}
          </div>
          {list}
        </div>
      )}

      <Dialog
        open={open && asSheet}
        onClose={() => setOpen(false)}
        title={t('notifications.title')}
        variant="sheet"
        returnFocusRef={buttonRef}
        footer={markAllButton || undefined}
      >
        <div className="-mx-5 sm:-mx-6">{list}</div>
      </Dialog>
    </div>
  );
}
