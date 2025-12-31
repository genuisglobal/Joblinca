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
    try {
      const { error: signUpError } = await supabase.auth.signUp({
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
        },
      });
      if (signUpError) {
        setError(signUpError.message);
        return;
      }
      // On successful sign up, redirect to dashboard (or login if email confirmation required).
      router.push('/dashboard');
    } catch (err) {
      // Unexpected errors
      setError((err as Error).message);
    }
  }

  /**
   * Renders the role selection cards.  Users pick the type of account they
   * wish to create.  Once a role is selected, the registration form appears.
   */
  function renderRoleSelection() {
    return (
      <div className="max-w-xl w-full bg-white dark:bg-gray-800 shadow rounded p-8 text-center space-y-6">
        <h2 className="text-2xl font-semibold mb-4">Create Your Account</h2>
        <p className="mb-6 text-gray-600 dark:text-gray-300">Select the type of account you want to create:</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => setSelectedRole('job_seeker')}
            className="p-4 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Job Seeker</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Find jobs, apply for free and get matched faster.</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('recruiter')}
            className="p-4 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Recruiter</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Post jobs, receive AI‑filtered candidates and hire faster.</p>
          </button>
          <button
            type="button"
            onClick={() => setSelectedRole('talent')}
            className="p-4 border rounded hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
          >
            <h3 className="font-medium text-lg">Talent</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">Showcase your projects while you study and prepare for the job market.</p>
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-6">
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
        className="bg-white dark:bg-gray-800 shadow-md rounded px-8 pt-6 pb-8 mb-4 max-w-md w-full"
      >
        <h2 className="text-2xl font-semibold mb-4">
          {selectedRole === 'job_seeker' && 'Join as a Job Seeker'}
          {selectedRole === 'recruiter' && 'Create a Recruiter Account'}
          {selectedRole === 'talent' && 'Register as a Talent'}
        </h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}
        <label className="block text-sm font-medium mb-2">
          Full Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
            required
          />
        </label>
        {/* Recruiter specific field */}
        {selectedRole === 'recruiter' && (
          <label className="block text-sm font-medium mb-2">
            Company Name
            <input
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
              required
            />
          </label>
        )}
        {/* Talent specific fields */}
        {selectedRole === 'talent' && (
          <>
            <label className="block text-sm font-medium mb-2">
              Institution / University
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
                required
              />
            </label>
            <label className="block text-sm font-medium mb-2">
              Expected Graduation Year
              <input
                type="number"
                value={graduationYear}
                onChange={(e) => setGraduationYear(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
                required
              />
            </label>
          </>
        )}
        <label className="block text-sm font-medium mb-2">
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
            required
          />
        </label>
        <label className="block text-sm font-medium mb-2">
          Phone Number
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
            required
          />
        </label>
        <label className="block text-sm font-medium mb-4">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 border rounded focus:outline-none focus:ring"
            required
          />
        </label>
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={resetForm}
            className="text-sm text-gray-600 dark:text-gray-400 hover:underline"
          >
            Change role
          </button>
          <button
            type="submit"
            className="bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
          >
            Sign up
          </button>
        </div>
      </form>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      {selectedRole ? renderRegistrationForm() : renderRoleSelection()}
    </main>
  );
}