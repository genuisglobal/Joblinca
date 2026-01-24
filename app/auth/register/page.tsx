'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Mail, Lock, Phone, ArrowRight, AlertCircle, Briefcase, GraduationCap, Building2, CheckCircle } from 'lucide-react';

type UserRole = 'job_seeker' | 'talent' | 'recruiter';

const roleConfig = {
  job_seeker: {
    label: 'Job Seeker',
    description: 'Ready for the job market',
    icon: Briefcase,
    color: 'primary',
    benefits: [
      'Apply to unlimited jobs for free',
      'Build your professional CV',
      'Get job alerts via WhatsApp',
      'AI-powered job matching',
    ],
  },
  talent: {
    label: 'Talent',
    description: 'Student / Seeking internships',
    icon: GraduationCap,
    color: 'green',
    benefits: [
      'Find internship opportunities',
      'Upload and showcase projects',
      'Build your portfolio',
      'Connect with mentors',
    ],
  },
  recruiter: {
    label: 'Recruiter',
    description: 'Hiring for your company',
    icon: Building2,
    color: 'accent',
    benefits: [
      'Post jobs and reach top talent',
      'AI-powered candidate filtering',
      'Streamlined hiring workflow',
      'Access analytics dashboard',
    ],
  },
};

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get('role') as UserRole) || 'job_seeker';

  const supabase = createClient();
  const [role, setRole] = useState<UserRole>(
    ['job_seeker', 'talent', 'recruiter'].includes(initialRole) ? initialRole : 'job_seeker'
  );
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const currentRole = roleConfig[role];

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
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

      // Create the profile in the database
      if (data.user) {
        const profileResponse = await fetch('/api/profile/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: data.user.id,
            role,
            phone,
          }),
        });

        const profileResult = await profileResponse.json();

        if (!profileResponse.ok) {
          setError(profileResult.error || 'Failed to create profile');
          return;
        }
      }

      // Redirect based on role
      if (role === 'recruiter') {
        router.push('/dashboard/recruiter');
      } else if (role === 'talent') {
        router.push('/dashboard/talent');
      } else {
        router.push('/dashboard');
      }
    } catch {
      setError('An unexpected error occurred. Please try again.');
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
          <h1 className="text-3xl font-bold mb-2">Create your account</h1>
          <p className="text-neutral-400">
            Join Joblinca and start your journey
          </p>
        </div>

        {/* Form Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-8">
          {/* Role Selector - 3 options */}
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
                Email address
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>

            {/* Phone Field */}
            <div>
              <label htmlFor="phone" className="block text-sm font-medium text-neutral-300 mb-2">
                Phone number (for WhatsApp alerts)
              </label>
              <div className="relative">
                <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="+237 6XX XXX XXX"
                  required
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-neutral-300 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-500" />
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-100 placeholder-neutral-500 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500 transition-colors"
                  placeholder="Create a strong password"
                  required
                  minLength={8}
                />
              </div>
              <p className="text-xs text-neutral-500 mt-2">
                Must be at least 8 characters
              </p>
            </div>

            {/* Benefits based on role */}
            <div className="p-4 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
              <p className="text-sm font-medium text-neutral-300 mb-3">
                {currentRole.label} benefits:
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
                  Create {currentRole.label} Account
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
              <span className="px-4 bg-neutral-900 text-neutral-500">or</span>
            </div>
          </div>

          {/* Sign In Link */}
          <p className="text-center text-neutral-400">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="text-primary-400 hover:text-primary-300 font-medium transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        {/* Footer */}
        <p className="text-center text-sm text-neutral-500 mt-8">
          By creating an account, you agree to our{' '}
          <Link href="/terms" className="text-neutral-400 hover:text-white transition-colors">
            Terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-neutral-400 hover:text-white transition-colors">
            Privacy Policy
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
