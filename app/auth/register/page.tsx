"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = searchParams.get("role") || "candidate";

  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    // 1) Create the auth user in Supabase
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Store extra info as user metadata (optional)
        data: {
          role,
          phone,
        },
      },
    });

    if (signUpError || !data.user) {
      setError(signUpError?.message || "Unable to create user account.");
      return;
    }

    const user = data.user;

    // 2) Create a matching profile row.
    // NOTE: profiles.id MUST be UUID and match auth user id (auth.uid()).
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,   // satisfies RLS policies like: with check (auth.uid() = id)
      email,         // make sure 'email' column exists in profiles
      phone,         // and 'phone' column too
      role,          // 'candidate' | 'recruiter'
    });

    if (profileError) {
      console.error("Profile insert error:", profileError);
      setError("Account created, but failed to save your profile.");
      return;
    }

    // 3) Redirect after successful signup + profile creation
    router.push("/dashboard"); // or "/auth/login" if you prefer
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <form
        onSubmit={handleRegister}
        className="bg-white dark:bg-gray-800 shadow-md rounded px-8 pt-6 pb-8 mb-4 max-w-sm w-full"
      >
        <h2 className="text-2xl font-semibold mb-4">Create your account</h2>
        {error && <p className="text-red-600 mb-4">{error}</p>}

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

        <button
          type="submit"
          className="w-full bg-green-600 text-white py-2 px-4 rounded hover:bg-green-700"
        >
          Sign up
        </button>
      </form>
    </main>
  );
}
