import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold mb-4 text-center">
        Welcome to JobLinca
      </h1>
      <p className="text-center mb-8 max-w-2xl">
        JobLinca connects recruiters and candidates across Cameroon through a
        mobile‑first, bilingual hiring platform. Create a profile, post jobs,
        and access curated talent — anywhere, anytime.
      </p>
      <div className="flex gap-4 flex-wrap justify-center">
        <Link
          href="/auth/register?role=candidate"
          className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700"
        >
          Sign up as Candidate
        </Link>
        <Link
          href="/auth/register?role=recruiter"
          className="bg-green-600 text-white px-6 py-3 rounded hover:bg-green-700"
        >
          Sign up as Recruiter
        </Link>

        <Link
          href="/remote-jobs"
          className="bg-indigo-600 text-white px-6 py-3 rounded hover:bg-indigo-700"
        >
          Explore Remote Jobs
        </Link>
      </div>
    </main>
  );
}