'use client';

import { useEffect, useState } from 'react';
import {
  WEEKDAY_KEYS,
  formatBlackoutDateSummary,
  formatWeeklyAvailabilitySummary,
  type InterviewSlotTemplate,
  type JobInterviewSelfScheduleSettings,
} from '@/lib/interview-scheduling/self-schedule';

interface InterviewSelfScheduleEditorProps {
  settings: JobInterviewSelfScheduleSettings;
  saving?: boolean;
  onSave: (settings: JobInterviewSelfScheduleSettings) => Promise<void>;
}

function createTemplateId(name: string) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${slug || 'template'}-${suffix}`;
}

function createEmptyTemplate(): InterviewSlotTemplate {
  return {
    id: createTemplateId('template'),
    name: 'New template',
    mode: 'video',
    location: null,
    meetingUrl: null,
    notes: null,
  };
}

export default function InterviewSelfScheduleEditor({
  settings,
  saving = false,
  onSave,
}: InterviewSelfScheduleEditorProps) {
  const [draft, setDraft] = useState<JobInterviewSelfScheduleSettings>(settings);
  const [blackoutDateInput, setBlackoutDateInput] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  useEffect(() => {
    setDraft(settings);
    setBlackoutDateInput('');
  }, [settings]);

  async function handleSave() {
    setMessage(null);
    try {
      await onSave(draft);
      setMessage({ type: 'success', text: 'Self-schedule settings saved.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text:
          error instanceof Error
            ? error.message
            : 'Failed to save self-schedule settings',
      });
    }
  }

  return (
    <div className="rounded-xl bg-gray-800 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Self-Schedule Defaults</h2>
          <p className="mt-1 text-sm text-gray-400">
            Define weekly availability and reusable slot templates for this job.
          </p>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
            {formatWeeklyAvailabilitySummary(draft)}
          </div>
          <div className="rounded-xl border border-gray-700 bg-gray-900/35 px-4 py-3 text-sm text-gray-300">
            {formatBlackoutDateSummary(draft)}
          </div>
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

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-400">
            Scheduling timezone
          </label>
          <input
            type="text"
            value={draft.timezone}
            onChange={(event) =>
              setDraft((current) => ({ ...current, timezone: event.target.value }))
            }
            placeholder="Africa/Douala"
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-400">
            Slot interval minutes
          </label>
          <input
            type="number"
            min="15"
            max="240"
            step="15"
            value={draft.slotIntervalMinutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                slotIntervalMinutes: Number(event.target.value || '15'),
              }))
            }
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-400">
            Minimum notice hours
          </label>
          <input
            type="number"
            min="0"
            max="168"
            value={draft.minimumNoticeHours}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minimumNoticeHours: Number(event.target.value || '0'),
              }))
            }
            className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-300">Blackout dates</h3>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={blackoutDateInput}
              onChange={(event) => setBlackoutDateInput(event.target.value)}
              className="rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => {
                if (!blackoutDateInput) return;
                setDraft((current) => ({
                  ...current,
                  blackoutDates: Array.from(
                    new Set([...current.blackoutDates, blackoutDateInput])
                  ).sort(),
                }));
                setBlackoutDateInput('');
              }}
              className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-600"
            >
              Add date
            </button>
          </div>
        </div>

        {draft.blackoutDates.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
            No blackout dates configured.
          </div>
        ) : (
          <div className="mt-3 flex flex-wrap gap-2">
            {draft.blackoutDates.map((date) => (
              <span
                key={date}
                className="inline-flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/10 px-3 py-1 text-xs font-medium text-red-100"
              >
                {date}
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      blackoutDates: current.blackoutDates.filter((item) => item !== date),
                    }))
                  }
                  className="text-red-200 hover:text-white"
                >
                  Remove
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-medium text-gray-300">Weekly availability</h3>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {WEEKDAY_KEYS.map((day) => {
            const window = draft.weeklyAvailability[day];
            return (
              <div
                key={day}
                className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
              >
                <label className="flex items-center gap-3 text-sm text-gray-200">
                  <input
                    type="checkbox"
                    checked={window.enabled}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        weeklyAvailability: {
                          ...current.weeklyAvailability,
                          [day]: {
                            ...current.weeklyAvailability[day],
                            enabled: event.target.checked,
                          },
                        },
                      }))
                    }
                    className="h-4 w-4 rounded border-gray-500 bg-gray-700 text-blue-500 focus:ring-blue-500"
                  />
                  <span className="font-medium capitalize text-white">{day}</span>
                </label>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-gray-500">
                      Start
                    </label>
                    <input
                      type="time"
                      value={window.startTime}
                      disabled={!window.enabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          weeklyAvailability: {
                            ...current.weeklyAvailability,
                            [day]: {
                              ...current.weeklyAvailability[day],
                              startTime: event.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs uppercase tracking-[0.2em] text-gray-500">
                      End
                    </label>
                    <input
                      type="time"
                      value={window.endTime}
                      disabled={!window.enabled}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          weeklyAvailability: {
                            ...current.weeklyAvailability,
                            [day]: {
                              ...current.weeklyAvailability[day],
                              endTime: event.target.value,
                            },
                          },
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-gray-300">Reusable slot templates</h3>
          <button
            type="button"
            onClick={() =>
              setDraft((current) => ({
                ...current,
                slotTemplates: [...current.slotTemplates, createEmptyTemplate()],
              }))
            }
            className="rounded-lg bg-gray-700 px-3 py-2 text-sm text-white hover:bg-gray-600"
          >
            Add template
          </button>
        </div>

        {draft.slotTemplates.length === 0 ? (
          <div className="mt-3 rounded-xl border border-dashed border-gray-700 bg-gray-900/30 p-4 text-sm text-gray-400">
            No slot templates yet. Add one for repeated video, phone, or onsite interview setups.
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            {draft.slotTemplates.map((template) => (
              <div
                key={template.id}
                className="rounded-xl border border-gray-700 bg-gray-900/35 p-4"
              >
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-400">
                      Template name
                    </label>
                    <input
                      type="text"
                      value={template.name}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          slotTemplates: current.slotTemplates.map((item) =>
                            item.id === template.id
                              ? { ...item, name: event.target.value }
                              : item
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-400">
                      Interview mode
                    </label>
                    <select
                      value={template.mode}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          slotTemplates: current.slotTemplates.map((item) =>
                            item.id === template.id
                              ? {
                                  ...item,
                                  mode: event.target.value as InterviewSlotTemplate['mode'],
                                }
                              : item
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    >
                      <option value="video">Video</option>
                      <option value="phone">Phone</option>
                      <option value="onsite">On-site</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-400">
                      Default location
                    </label>
                    <input
                      type="text"
                      value={template.location || ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          slotTemplates: current.slotTemplates.map((item) =>
                            item.id === template.id
                              ? { ...item, location: event.target.value || null }
                              : item
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-400">
                      Default meeting URL
                    </label>
                    <input
                      type="url"
                      value={template.meetingUrl || ''}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          slotTemplates: current.slotTemplates.map((item) =>
                            item.id === template.id
                              ? { ...item, meetingUrl: event.target.value || null }
                              : item
                          ),
                        }))
                      }
                      className="w-full rounded-lg border border-gray-600 bg-gray-700 px-3 py-2 text-white focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="mb-2 block text-sm font-medium text-gray-400">
                    Default candidate instructions
                  </label>
                  <textarea
                    value={template.notes || ''}
                    rows={3}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        slotTemplates: current.slotTemplates.map((item) =>
                          item.id === template.id
                            ? { ...item, notes: event.target.value || null }
                            : item
                        ),
                      }))
                    }
                    className="w-full rounded-lg border border-gray-600 bg-gray-700 px-4 py-3 text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((current) => ({
                        ...current,
                        slotTemplates: current.slotTemplates.filter(
                          (item) => item.id !== template.id
                        ),
                      }))
                    }
                    className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                  >
                    Remove template
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save self-schedule settings'}
        </button>
      </div>
    </div>
  );
}
