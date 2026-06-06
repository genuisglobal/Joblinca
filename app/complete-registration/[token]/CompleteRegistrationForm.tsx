'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { addLocalePrefix } from '@/lib/i18n/locale';

type ClaimRole = 'job_seeker' | 'talent' | 'recruiter';

function getRedirectPath(role: ClaimRole): string {
  switch (role) {
    case 'recruiter':
      return '/dashboard/recruiter';
    case 'talent':
      return '/dashboard/talent';
    case 'job_seeker':
    default:
      return '/dashboard';
  }
}

export default function CompleteRegistrationForm({
  token,
  fullName: initialFullName,
  phone,
  intendedRole,
  email: initialEmail,
}: {
  token: string;
  fullName: string;
  phone: string;
  intendedRole: ClaimRole;
  email: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const { locale } = useTranslation();
  const [fullName, setFullName] = useState(initialFullName);
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    setIsLoading(true);
    setError(null);
    setWarning(null);

    try {
      if (!fullName.trim()) {
        setError('Full name is required.');
        return;
      }

      if (password !== confirmPassword) {
        setError('Passwords do not match.');
        return;
      }

      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        phone,
        options: {
          data: {
            role: intendedRole,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (!data.user?.id) {
        setError('Account creation did not return a user record.');
        return;
      }

      const profileResponse = await fetch('/api/profile/create', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: data.user.id,
          role: intendedRole,
          fullName: fullName.trim(),
          phone,
          registrationInviteToken: token,
        }),
      });

      const profilePayload = await profileResponse.json().catch(() => null);
      if (!profileResponse.ok) {
        throw new Error(profilePayload?.error || 'Failed to complete your profile.');
      }

      if (profilePayload?.warning) {
        setWarning(String(profilePayload.warning));
      }

      router.push(addLocalePrefix(getRedirectPath(intendedRole), locale));
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : 'Failed to complete your registration.'
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8">
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="rounded-lg border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {warning && (
          <div className="rounded-lg border border-yellow-800 bg-yellow-950/30 px-4 py-3 text-sm text-yellow-200">
            {warning}
          </div>
        )}

        <label className="block">
          <span className="mb-2 block text-sm text-neutral-300">Full name</span>
          <input
            type="text"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-neutral-300">Email</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm text-neutral-300">WhatsApp number</span>
          <input
            type="tel"
            value={phone}
            readOnly
            className="w-full cursor-not-allowed rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3 text-neutral-300"
          />
          <p className="mt-2 text-xs text-neutral-500">
            This registration stays linked to the number captured by your officer.
          </p>
        </label>

        <div className="grid gap-5 md:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm text-neutral-300">Password</span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-neutral-300">Confirm password</span>
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              minLength={8}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3 text-white placeholder:text-neutral-500 focus:border-blue-500 focus:outline-none"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-lg bg-blue-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isLoading ? 'Creating account...' : 'Create my JobLinca account'}
        </button>
      </form>
    </div>
  );
}
