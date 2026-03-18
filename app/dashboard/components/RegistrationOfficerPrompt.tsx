'use client';

import { useEffect, useState } from 'react';

type AttributionState = {
  shouldPrompt: boolean;
};

type PromptMode = 'question' | 'claim';

export default function RegistrationOfficerPrompt() {
  const [loading, setLoading] = useState(true);
  const [shouldPrompt, setShouldPrompt] = useState(false);
  const [mode, setMode] = useState<PromptMode>('question');
  const [officerCode, setOfficerCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadPromptState() {
      try {
        const response = await fetch('/api/registration-attribution', {
          credentials: 'include',
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as AttributionState;
        if (mounted) {
          setShouldPrompt(Boolean(payload.shouldPrompt));
        }
      } catch {
        // Ignore prompt load failures.
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    loadPromptState();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleNo() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/registration-attribution/respond', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ response: 'no' }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save your response');
      }

      setShouldPrompt(false);
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to save your response'
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleClaim() {
    if (submitting) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/registration-attribution/claim', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ officerCode }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || 'Failed to save the officer code');
      }

      setShouldPrompt(false);
      setOfficerCode('');
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to save the officer code'
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading || !shouldPrompt) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl">
        <div className="mb-5">
          <h2 className="text-xl font-semibold text-white">
            Did a registration officer help you?
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            If someone from JobLinca helped you create this account, enter their code so we can
            track their registrations correctly.
          </p>
        </div>

        {mode === 'question' ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => {
                setMode('claim');
                setError(null);
              }}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Yes, enter officer code
            </button>
            <button
              type="button"
              onClick={handleNo}
              disabled={submitting}
              className="w-full rounded-lg border border-gray-600 px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'No'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label htmlFor="registration-officer-code" className="mb-2 block text-sm text-gray-300">
                Officer code
              </label>
              <input
                id="registration-officer-code"
                type="text"
                autoComplete="off"
                value={officerCode}
                onChange={(event) =>
                  setOfficerCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                }
                placeholder="Enter code"
                className="w-full rounded-lg border border-gray-600 bg-gray-950 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('question');
                  setError(null);
                }}
                className="flex-1 rounded-lg border border-gray-600 px-4 py-3 text-sm font-medium text-gray-200 transition-colors hover:border-gray-500 hover:bg-gray-800"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={submitting || officerCode.trim().length < 4}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Saving...' : 'Save code'}
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-4 rounded-lg border border-red-800 bg-red-950/40 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
