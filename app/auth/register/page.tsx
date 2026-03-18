'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useTranslation } from '@/lib/i18n';
import { Mail, Lock, Phone, ArrowRight, AlertCircle, Briefcase, GraduationCap, Building2, CheckCircle } from 'lucide-react';

type UserRole = 'job_seeker' | 'talent' | 'recruiter';

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get('role') as UserRole) || 'job_seeker';
  const initialPhone = searchParams.get('phone') || '';
  const referralCode = searchParams.get('ref') || '';
  const registrationOfficerCode = searchParams.get('officer') || '';
  const whatsappSource = (searchParams.get('source') || '').toLowerCase() === 'whatsapp';
  const isWhatsappPhoneLocked = whatsappSource && initialPhone.trim().length > 0;
  const { t } = useTranslation();

  const supabase = createClient();
  // Map legacy "candidate" alias to "job_seeker"
  const normalizedInitialRole: UserRole =
    initialRole === ('candidate' as string) ? 'job_seeker' :
    ['job_seeker', 'talent', 'recruiter'].includes(initialRole) ? initialRole : 'job_seeker';
  const [role, setRole] = useState<UserRole>(normalizedInitialRole);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [phone, setPhone] = useState(initialPhone);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const roleConfig = {
    job_seeker: {
      label: t("auth.register.roleJobSeeker"),
      description: t("auth.register.roleJobSeekerDesc"),
      icon: Briefcase,
      color: 'primary' as const,
      benefits: [
        t("auth.register.benefit.job_seeker.1"),
        t("auth.register.benefit.job_seeker.2"),
        t("auth.register.benefit.job_seeker.3"),
        t("auth.register.benefit.job_seeker.4"),
      ],
    },
    talent: {
      label: t("auth.register.roleTalent"),
      description: t("auth.register.roleTalentDesc"),
      icon: GraduationCap,
      color: 'green' as const,
      benefits: [
        t("auth.register.benefit.talent.1"),
        t("auth.register.benefit.talent.2"),
        t("auth.register.benefit.talent.3"),
        t("auth.register.benefit.talent.4"),
      ],
    },
    recruiter: {
      label: t("auth.register.roleRecruiter"),
      description: t("auth.register.roleRecruiterDesc"),
      icon: Building2,
      color: 'accent' as const,
      benefits: [
        t("auth.register.benefit.recruiter.1"),
        t("auth.register.benefit.recruiter.2"),
        t("auth.register.benefit.recruiter.3"),
        t("auth.register.benefit.recruiter.4"),
      ],
    },
  };

  const currentRole = roleConfig[role];

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (isWhatsappPhoneLocked && phone.trim() !== initialPhone.trim()) {
        setError('Use the same WhatsApp number to create your account.');
        return;
      }

      if (password !== confirmPassword) {
        setError(t("auth.register.passwordMismatch"));
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        phone,
        options: {
          data: { role },
        },
      });

      if (error) {
        setError(error.message);
        return;
      }

      if (data.user) {
        const profileResponse = await fetch('/api/profile/create', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            role,
            phone,
            referralCode: referralCode || undefined,
            registrationOfficerCode: registrationOfficerCode || undefined,
          }),
        });

        const profileResult = await profileResponse.json();

        if (!profileResponse.ok) {
          setError(profileResult.error || t("auth.register.profileFailed"));
          return;
        }
      }

      if (role === 'recruiter') {
        router.push('/dashboard/recruiter');
      } else if (role === 'talent') {
        router.push('/dashboard/talent');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError(t("auth.register.unexpectedError"));
    } finally {
      setIsLoading(false);
    }
  }

  const getColorClasses = (r: UserRole, isSelected: boolean) => {
    if (!isSelected) return 'border-neutral-700 hover:border-neutral-600';

    switch (r) {
      case 'job_seeker':
        return 'border-primary-500 bg-primary-500/10';
      case 'talent':
        return 'border-green-500 bg-green-500/10';
      case 'recruiter':
        return 'border-accent-500 bg-accent-500/10';
    }
  };

  const getIconColor = (r: UserRole, isSelected: boolean) => {
    if (!isSelected) return 'text-neutral-400';

    switch (r) {
      case 'job_seeker':
        return 'text-primary-400';
      case 'talent':
        return 'text-green-400';
      case 'recruiter':
        return 'text-accent-400';
    }
  };

  const getButtonClasses = () => {
    switch (role) {
      case 'job_seeker':
        return 'bg-primary-600 hover:bg-primary-700 disabled:bg-primary-600/50 hover:shadow-primary-600/20';
      case 'talent':
        return 'bg-green-600 hover:bg-green-700 disabled:bg-green-600/50 hover:shadow-green-600/20';
      case 'recruiter':
        return 'bg-accent-500 hover:bg-accent-600 disabled:bg-accent-500/50 text-neutral-900 hover:shadow-accent-500/20';
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12 bg-neutral-950">
      {/* Background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary-600/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">{t("auth.register.title")}</h1>
          <p className="text-neutral-400">
            {t("auth.register.subtitle")}
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          {/* Role Selector */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            {(Object.keys(roleConfig) as UserRole[]).map((r) => {
              const config = roleConfig[r];
              const Icon = config.icon;
              const isSelected = role === r;

              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${getColorClasses(r, isSelected)}`}
                >
                  <Icon className={`w-6 h-6 ${getIconColor(r, isSelected)}`} />
                  <span className={`text-sm font-medium text-center ${isSelected ? 'text-white' : 'text-neutral-400'}`}>
                    {config.label}
                  </span>
                  <span className="text-xs text-neutral-500 text-center hidden sm:block">
                    {config.description}
                  </span>
                </button>
              );
            })}
          </div>

          <form onSubmit={handleRegister} className="space-y-5">
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
                {t("auth.register.email")}
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder={t("auth.register.emailPlaceholder")}
                  required
                />
              </div>
            </div>

            {/* Phone Field */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-neutral-300 mb-2">
                {t("auth.register.phone")}
              </label>
              {isWhatsappPhoneLocked && (
                <p className="text-xs text-primary-300 mb-2">
                  This number is locked to match your WhatsApp account.
                </p>
              )}
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={`w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors ${isWhatsappPhoneLocked ? 'opacity-80 cursor-not-allowed' : ''}`}
                  placeholder={t("auth.register.phonePlaceholder")}
                  readOnly={isWhatsappPhoneLocked}
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                {t("auth.register.password")}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder={t("auth.register.passwordPlaceholder")}
                  required
                  minLength={8}
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                {t("auth.register.passwordHint")}
              </p>
            </div>

            {/* Confirm Password Field */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-neutral-300 mb-2">
                {t("auth.register.confirmPassword")}
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`w-full pl-12 pr-4 py-3 bg-neutral-800 border rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors ${
                    confirmPassword && password !== confirmPassword
                      ? 'border-red-500'
                      : 'border-neutral-700'
                  }`}
                  placeholder={t("auth.register.confirmPasswordPlaceholder")}
                  required
                  minLength={8}
                />
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1">{t("auth.register.passwordMismatch")}</p>
              )}
            </div>

            {/* Benefits based on role */}
            <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
              <p className="text-sm font-medium text-neutral-300 mb-3">
                {t("auth.register.benefits", { role: currentRole.label })}
              </p>
              <ul className="space-y-2">
                {currentRole.benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-2 text-sm text-neutral-400">
                    <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-lg font-semibold transition-all disabled:cursor-not-allowed text-white hover:shadow-lg ${getButtonClasses()}`}
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  {t("auth.register.createAccount", { role: currentRole.label })}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-800" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-neutral-900 text-neutral-500">{t("auth.register.or")}</span>
            </div>
          </div>

          {/* Google Sign-Up */}
          <button
            type="button"
            onClick={async () => {
              await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                  redirectTo: `${window.location.origin}/auth/callback?role=${role}`,
                },
              });
            }}
            className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-200 font-medium hover:border-neutral-500 hover:bg-neutral-700 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            {t("auth.register.continueWithGoogle")}
          </button>

          <div className="mt-6" />

          {/* Sign In Link */}
          <p className="text-center text-neutral-400">
            {t("auth.register.haveAccount")}{' '}
            <Link
              href="/auth/login"
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              {t("auth.register.signIn")}
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-neutral-500 mt-8">
          {t("auth.register.agreeTerms")}{' '}
          <Link href="/terms" className="text-neutral-400 hover:text-white transition-colors">
            {t("auth.register.terms")}
          </Link>{' '}
          {t("auth.register.and")}{' '}
          <Link href="/privacy" className="text-neutral-400 hover:text-white transition-colors">
            {t("auth.register.privacy")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center bg-neutral-950">
        <div className="w-8 h-8 border-2 border-primary-600/30 border-t-primary-600 rounded-full animate-spin" />
      </main>
    }>
      <RegisterForm />
    </Suspense>
  );
}
