'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { Mail, Lock, ArrowRight, AlertCircle } from 'lucide-react';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        setError(signInError.message);
        setIsLoading(false);
        return;
      }

      if (!data.session) {
        setError(t("auth.login.noSession"));
        setIsLoading(false);
        return;
      }

      // Session exists, now verify it's accessible
      const { data: userData, error: userError } = await supabase.auth.getUser();

      if (userError || !userData.user) {
        console.error('Session verification failed:', userError);
        const { error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
          console.error('Session refresh failed:', refreshError);
        }
      }

      // Small delay to ensure cookies are set
      await new Promise(resolve => setTimeout(resolve, 200));

      const redirectTo = searchParams.get('redirect');
      const targetUrl = redirectTo || '/dashboard';

      window.location.href = targetUrl;
    } catch (err) {
      console.error('Login error:', err);
      setError(t("auth.login.unexpectedError"));
      setIsLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-neutral-950">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t("auth.login.title")}</h1>
          <p className="text-neutral-400">
            {t("auth.login.subtitle")}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Error Message */}
            {error && (
              <div className="flex items-start gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-neutral-300 mb-2">
                {t("auth.login.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder={t("auth.login.emailPlaceholder")}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="password" className="block text-sm font-medium text-neutral-300">
                  {t("auth.login.password")}
                </label>
                <Link
                  href="/auth/forgot-password"
                  className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
                >
                  {t("auth.login.forgotPassword")}
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder={t("auth.login.passwordPlaceholder")}
                  required
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 text-white py-3 px-4 rounded-lg font-semibold transition-all hover:shadow-lg hover:shadow-primary-600/20 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t("auth.login.signIn")}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-neutral-900 text-neutral-500">{t("auth.login.or")}</span>
            </div>
          </div>

          {/* Sign Up Link */}
          <p className="text-center text-neutral-400">
            {t("auth.login.noAccount")}{' '}
            <Link
              href="/auth/register?role=candidate"
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              {t("auth.login.createOne")}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-neutral-500 mt-8">
          {t("auth.login.agreeTerms")}{' '}
          <Link href="/terms" className="text-neutral-400 hover:text-white transition-colors">
            {t("auth.login.terms")}
          </Link>{' '}
          {t("auth.login.and")}{' '}
          <Link href="/privacy" className="text-neutral-400 hover:text-white transition-colors">
            {t("auth.login.privacy")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="w-8 h-8 border-2 border-primary-600/30 border-t-primary-600 rounded-full animate-spin" />
      </main>
    }>
      <LoginForm />
    </Suspense>
  );
}
