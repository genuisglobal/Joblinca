"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * SearchJobsBar
 *
 * A simple search bar component for the homepage.  Users can
 * enter a keyword (e.g. job title, skill, company) and press the
 * search button or hit Enter to navigate to the job board with the
 * query encoded in the URL.  This allows immediate engagement on
 * the homepage, reducing the friction of clicking through to the
 * jobs page first.  If the input is empty the search is ignored.
 */
export default function SearchJobsBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) {
      const encoded = encodeURIComponent(trimmed);
      router.push(`/jobs?search=${encoded}`);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl mx-auto mt-6">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search jobs by title or keyword..."
        className="flex-grow px-4 py-3 rounded-l-md border border-gray-600 bg-gray-800 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
      />
      <button
        type="submit"
        className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-r-md"
      >
        Search
      </button>
    </form>
  );
}