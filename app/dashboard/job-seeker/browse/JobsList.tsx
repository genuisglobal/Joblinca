'use client';

import { useState } from 'react';
import Link from 'next/link';

interface Job {
  id: string;
  title: string;
  description: string;
  location: string | null;
  salary: number | null;
  company_name: string | null;
  work_type: string | null;
  job_type: string | null;
  created_at: string;
}

interface JobsListProps {
  jobs: Job[];
  appliedJobIds: Set<string>;
}

export default function JobsList({ jobs, appliedJobIds }: JobsListProps) {
  const [search, setSearch] = useState('');
  const [workTypeFilter, setWorkTypeFilter] = useState('all');
  const [appliedJobs] = useState<Set<string>>(appliedJobIds);

  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      job.title.toLowerCase().includes(search.toLowerCase()) ||
      job.description.toLowerCase().includes(search.toLowerCase()) ||
      job.company_name?.toLowerCase().includes(search.toLowerCase());

    const matchesWorkType =
      workTypeFilter === 'all' || job.work_type === workTypeFilter;

    return matchesSearch && matchesWorkType;
  });

  return (
    <>
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search jobs, companies..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={workTypeFilter}
          onChange={(e) => setWorkTypeFilter(e.target.value)}
          className="px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">All Work Types</option>
          <option value="onsite">On-site</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
        </select>
      </div>

      {/* Jobs Grid */}
      {filteredJobs.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <svg
            className="w-16 h-16 mx-auto text-gray-600 mb-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">
            No jobs found
          </h3>
          <p className="text-gray-400">
            Try adjusting your search or filters.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="bg-gray-800 rounded-xl p-6 border border-gray-700 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">
                    {job.title}
                  </h3>
                  <p className="text-gray-400">
                    {job.company_name || 'Company'}
                  </p>
                </div>
                {job.work_type && (
                  <span className="px-3 py-1 bg-blue-600/20 text-blue-400 rounded-full text-sm capitalize">
                    {job.work_type}
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-4">
                {job.location && (
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                    {job.location}
                  </span>
                )}
                {job.salary && (
                  <span className="flex items-center gap-1">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {job.salary.toLocaleString()} XAF
                  </span>
                )}
                {job.job_type && (
                  <span className="capitalize">{job.job_type}</span>
                )}
              </div>

              <p className="text-gray-300 text-sm line-clamp-3 mb-4">
                {job.description}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                <span className="text-xs text-gray-500">
                  Posted {new Date(job.created_at).toLocaleDateString()}
                </span>
                <div className="flex gap-2">
                  <Link
                    href={`/jobs/${job.id}`}
                    className="px-3 py-1.5 text-sm bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                  >
                    View Details
                  </Link>
                  {appliedJobs.has(job.id) ? (
                    <span className="px-3 py-1.5 text-sm bg-green-600/20 text-green-400 rounded-lg">
                      Applied
                    </span>
                  ) : (
                    <Link
                      href={`/jobs/${job.id}/apply`}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Apply
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
