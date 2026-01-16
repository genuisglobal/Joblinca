"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

/**
 * Registration page supporting multiple user roles.  New users can sign up
 * either as a job seeker, recruiter or talent.  Each role shows a tailored
 * form collecting the necessary information.  Internal staff accounts are
 * provisioned separately via the admin dashboard and are not exposed here.
 */
export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  // Track the selected role.  When null, show the role selection interface.
  const [selectedRole, setSelectedRole] = useState<'job_seeker' | 'recruiter' | 'talent' | null>(null);
  // Common form fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  // Recruiter specific
  const [companyName, setCompanyName] = useState('');
  // Talent specific
  const [institution, setInstitution] = useState('');
  const [graduationYear, setGraduationYear] = useState('');
  // Error message
  const [error, setError] = useState<string | null>(null);
  // Loading state
  const [isLoading, setIsLoading] = useState(false);
  // Success state (for email confirmation required)
  const [showEmailConfirmation, setShowEmailConfirmation] = useState(false);

  /**
   * Reset all form fields and return to the role selection screen.
   */
  function resetForm() {
    setSelectedRole(null);
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setCompanyName('');
    setInstitution('');
    setGraduationYear('');
    setError(null);
  }

  /**
   * Handles the registration form submission.  It calls Supabase Auth signUp
   * with the provided credentials and role metadata.  On success, users
   * are redirected to the dashboard.  Errors are displayed to the user.
   */
  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!selectedRole) return;
    setIsLoading(true);
    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        phone,
        options: {
          data: {
            role: selectedRole,
            name,
            companyName: selectedRole === 'recruiter' ? companyName : undefined,
            institution: selectedRole === 'talent' ? institution : undefined,
            graduationYear: selectedRole === 'talent' ? graduationYear : undefined,
          },
          emailRedirectTo: `${window.location.origin}/onboarding`,
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        setIsLoading(false);
        return;
      }
      const user = signUpData?.user;
      const session = signUpData?.session;

      if (user && selectedRole) {
        // Call API to create profile and role‑specific row
        try {
          await fetch('/api/profile/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: user.id,
              role: selectedRole,
              fullName: name,
              phone,
              companyName,
              institution,
              graduationYear,
            }),
          });
        } catch {
          // silently ignore; backend will log error
        }
      }

      // Check if we have a session (email confirmation not required)
      if (session) {
        // User is logged in, redirect to onboarding
        window.location.href = '/onboarding';
      } else if (user) {
        // Email confirmation is required - show success message
        setIsLoading(false);
        setShowEmailConfirmation(true);
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
      setIsLoading(false);
    }
  }

  /**
   * Renders the role selection cards.  Users pick the type of account they
   * wish to create.  Once a role is selected, the registration form appears.
   */
  function renderRoleSelection() {
    return (
      <div className="max-w-xl w-full bg-gray-700 shadow rounded-lg p-8 text-center space-y-6 text-gray-100">
        <h2 className="text-2xl font-semibold mb-4">Create Your Account</h2>
        <p className="mb-6 text-gray-300">Select the type of account you want to create:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setSelectedRole('job_seeker')}
            className="p-4 border border-gray-600 rounded hover:bg-gray-600 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Job Seeker</h3>
            <p className="text-sm text-gray-400 mt-2">Find jobs, apply for free and get matched faster.</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('recruiter')}
            className="p-4 border border-gray-600 rounded hover:bg-gray-600 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Recruiter</h3>
            <p className="text-sm text-gray-400 mt-2">Post jobs, receive AI‑filtered candidates and hire faster.</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('talent')}
            className="p-4 border border-gray-600 rounded hover:bg-gray-600 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Talent</h3>
            <p className="text-sm text-gray-400 mt-2">Showcase your projects while you study and prepare for the job market.</p>
          </button>
        </div>
        <p className="text-sm text-gray-400 mt-6">
          Are you a JobLinca staff member? Please contact an administrator to set up your account.
        </p>
      </div>
    );
  }

  /**
   * Renders the registration form based on the selected role.
   */
  function renderRegistrationForm() {
    if (!selectedRole) return null;
    return (
      <form
        onSubmit={handleRegister}
        /*
         * Use a slightly lighter card background and more legible text and
         * input colours for better contrast on dark pages.  Inputs use
         * a mid‑tone background and border to distinguish them from the
         * card.
         */
        className="bg-gray-700 shadow-md rounded-lg px-8 pt-6 pb-8 mb-4 max-w-md w-full text-gray-100"
      >
        <h2 className="text-2xl font-semibold mb-4">
          {selectedRole === 'job_seeker' && 'Join as a Job Seeker'}
          {selectedRole === 'recruiter' && 'Create a Recruiter Account'}
          {selectedRole === 'talent' && 'Register as a Talent'}
        </h2>
        {error && <p className="text-red-500 mb-4">{error}</p>}
        <label className="block text-sm font-medium mb-2 text-gray-300">
          Full Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="Your full name"
            required
          />
        </label>
        {/* Recruiter specific field */}
        {selectedRole === 'recruiter' && (
          <label className="block text-sm font-medium mb-2 text-gray-300">
            Company Name
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
              placeholder="Company name"
              required
            />
          </label>
        )}
        {/* Talent specific fields */}
        {selectedRole === 'talent' && (
          <>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Institution / University
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="Institution / University"
                required
              />
            </label>
            <label className="block text-sm font-medium mb-2 text-gray-300">
              Expected Graduation Year
              <input
                type="number"
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
                placeholder="2026"
                required
              />
            </label>
          </>
        )}
        <label className="block text-sm font-medium mb-2 text-gray-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="block text-sm font-medium mb-2 text-gray-300">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="(+237) 6xx xxx xxx"
            required
          />
        </label>
        <label className="block text-sm font-medium mb-4 text-gray-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="Create a strong password"
            required
          />
        </label>
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={resetForm}
            disabled={isLoading}
            className="text-sm text-gray-400 hover:underline disabled:opacity-50"
          >
            Change role
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isLoading ? (
              <>
                <svg
                  className="animate-spin w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating account...
              </>
            ) : (
              'Sign up'
            )}
          </button>
        </div>
      </form>
    );
  }

  // Show email confirmation success message
  if (showEmailConfirmation) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-gray-700 shadow rounded-lg p-8 text-center space-y-6 text-gray-100">
          <div className="w-16 h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center">
            <svg
              className="w-8 h-8 text-green-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold">Check Your Email</h2>
          <p className="text-gray-300">
            We have sent a confirmation link to <strong>{email}</strong>. Please check your email and click the link to activate your account.
          </p>
          <p className="text-sm text-gray-400">
            Did not receive the email? Check your spam folder or try registering again.
          </p>
          <button
            onClick={() => router.push('/auth/login')}
            className="w-full py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Go to Login
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      {selectedRole ? renderRegistrationForm() : renderRoleSelection()}
    </main>
  );
}