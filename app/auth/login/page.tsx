"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setError(error.message);
      } else {
        router.push('/dashboard');
      }
    } catch (err) {
      setError('Unexpected error. Please try again.');
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleSubmit}
        /*
         * Use a slightly lighter card background and brighter text colors to
         * improve contrast on dark pages. Inputs also use a lighter
         * background and border for better readability.  This helps
         * users see the form fields clearly when the overall theme is dark.
         */
        className="bg-gray-700 shadow-md rounded-lg px-8 pt-6 pb-8 mb-4 max-w-sm w-full text-gray-100"
      >
        <h2 className="text-2xl font-semibold mb-4">Sign in to JobLinca</h2>
        {error && <p className="text-red-500 mb-4">{error}</p>}
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
        <label className="block text-sm font-medium mb-4 text-gray-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 block w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded focus:outline-none focus:ring focus:border-blue-500 placeholder-gray-500"
            placeholder="••••••••"
            required
          />
        </label>
        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 px-4 rounded hover:bg-blue-700 transition-colors"
        >
          Log in
        </button>
      </form>
    </main>
  );
}