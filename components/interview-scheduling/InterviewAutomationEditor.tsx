'use client';

import { useEffect, useState } from 'react';
import type { JobInterviewAutomationSettings } from '@/lib/interview-scheduling/automation';
import { useTranslation } from '@/lib/i18n/context';

interface InterviewAutomationEditorProps {
  settings: JobInterviewAutomationSettings;
  saving?: boolean;
  onSave: (settings: JobInterviewAutomationSettings) => Promise<void>;
}

export default function InterviewAutomationEditor({
  settings,
  saving = false,
  onSave,
}: InterviewAutomationEditorProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<JobInterviewAutomationSettings>(settings);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  async function handleSave() {
    setMessage(null);
    try {
      await onSave(draft);
      setMessage({ type: 'success', text: t('interviewAutomation.saved') });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : t('interviewAutomation.saveFailed'),
      });
    }
  }

  return (
    <div className="rounded-xl bg-gray-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">
            {t('interviewAutomation.title')}
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            {t('interviewAutomation.subtitle')}
          </p>
        </div>
      </div>

      {message && (
        <div
          className={`mt-5 rounded-xl border px-4 py-3 text-sm ${
            message.type === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'
              : 'border-red-500/30 bg-red-500/10 text-red-100'
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={draft.autoSendRescheduleNotice}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                autoSendRescheduleNotice: event.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span>
            <span className="block font-medium text-white">
              {t('interviewAutomation.rescheduleTitle')}
            </span>
            {t('interviewAutomation.rescheduleDescription')}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={draft.autoSendCancellationNotice}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                autoSendCancellationNotice: event.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span>
            <span className="block font-medium text-white">
              {t('interviewAutomation.cancellationTitle')}
            </span>
            {t('interviewAutomation.cancellationDescription')}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={draft.autoSendCompletionFollowup}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                autoSendCompletionFollowup: event.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span>
            <span className="block font-medium text-white">
              {t('interviewAutomation.completionTitle')}
            </span>
            {t('interviewAutomation.completionDescription')}
          </span>
        </label>

        <label className="flex items-start gap-3 rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={draft.autoSendNoShowFollowup}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                autoSendNoShowFollowup: event.target.checked,
              }))
            }
            className="mt-1 h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
          />
          <span>
            <span className="block font-medium text-white">
              {t('interviewAutomation.noShowTitle')}
            </span>
            {t('interviewAutomation.noShowDescription')}
          </span>
        </label>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-400">
            {t('interviewAutomation.completionMessage')}
          </label>
          <textarea
            value={draft.completionFollowupMessage || ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                completionFollowupMessage: event.target.value,
              }))
            }
            rows={4}
            placeholder={t('interviewAutomation.completionPlaceholder')}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-400">
            {t('interviewAutomation.noShowMessage')}
          </label>
          <textarea
            value={draft.noShowFollowupMessage || ''}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                noShowFollowupMessage: event.target.value,
              }))
            }
            rows={4}
            placeholder={t('interviewAutomation.noShowPlaceholder')}
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? t('interviewAutomation.saving') : t('interviewAutomation.save')}
        </button>
      </div>
    </div>
  );
}
