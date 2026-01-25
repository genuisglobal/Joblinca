'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

interface User {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: string;
  avatar_url: string | null;
  admin_type: string | null;
  created_at: string;
  onboarding_completed: boolean;
}

interface Counts {
  all: number;
  job_seeker: number;
  talent: number;
  recruiter: number;
  admin: number;
}

interface UsersClientProps {
  users: User[];
  counts: Counts;
  currentRole: string;
  currentSearch: string;
}

export default function UsersClient({ users, counts, currentRole, currentSearch }: UsersClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(currentSearch);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) {
      params.set('search', search);
    } else {
      params.delete('search');
    }
    router.push(`/admin/users?${params.toString()}`);
  };

  const handleRoleChange = (role: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (role === 'all') {
      params.delete('role');
    } else {
      params.set('role', role);
    }
    router.push(`/admin/users?${params.toString()}`);
  };

  const getName = (user: User) => {
    if (user.first_name || user.last_name) {
      return `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user.full_name || 'Unknown';
  };

  const getRoleBadge = (role: string, adminType: string | null) => {
    if (adminType) {
      return {
        bg: 'bg-purple-900/50 border-purple-700',
        text: 'text-purple-400',
        label: `Admin (${adminType})`,
      };
    }

    const config: Record<string, { bg: string; text: string; label: string }> = {
      job_seeker: {
        bg: 'bg-blue-900/50 border-blue-700',
        text: 'text-blue-400',
        label: 'Job Seeker',
      },
      talent: {
        bg: 'bg-green-900/50 border-green-700',
        text: 'text-green-400',
        label: 'Talent',
      },
      recruiter: {
        bg: 'bg-yellow-900/50 border-yellow-700',
        text: 'text-yellow-400',
        label: 'Recruiter',
      },
      admin: {
        bg: 'bg-purple-900/50 border-purple-700',
        text: 'text-purple-400',
        label: 'Admin',
      },
      vetting_officer: {
        bg: 'bg-orange-900/50 border-orange-700',
        text: 'text-orange-400',
        label: 'Vetting Officer',
      },
      verification_officer: {
        bg: 'bg-cyan-900/50 border-cyan-700',
        text: 'text-cyan-400',
        label: 'Verification Officer',
      },
    };

    return config[role] || {
      bg: 'bg-gray-700/50 border-gray-600',
      text: 'text-gray-400',
      label: role,
    };
  };

  return (
    <>
      {/* Search and Filter */}
      <div className="flex flex-col md:flex-row gap-4 mb-6">
        <form onSubmit={handleSearch} className="flex-1">
          <div className="relative">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name..."
              className="w-full px-4 py-2 pl-10 bg-gray-800 text-white border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </form>
      </div>

      {/* Role Filter Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { key: 'all', label: 'All Users', count: counts.all },
          { key: 'job_seeker', label: 'Job Seekers', count: counts.job_seeker },
          { key: 'talent', label: 'Talents', count: counts.talent },
          { key: 'recruiter', label: 'Recruiters', count: counts.recruiter },
          { key: 'admin', label: 'Admins', count: counts.admin },
        ].map(({ key, label, count }) => (
          <button
            key={key}
            onClick={() => handleRoleChange(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              currentRole === key
                ? 'bg-gray-700 text-white'
                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
            }`}
          >
            {label}
            <span className="px-2 py-0.5 text-xs rounded-full bg-gray-600 text-gray-300">
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Users Table */}
      {users.length === 0 ? (
        <div className="bg-gray-800 rounded-xl p-12 text-center">
          <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <h3 className="text-xl font-semibold text-white mb-2">No users found</h3>
          <p className="text-gray-400">No users match the selected filters.</p>
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="text-left p-4 text-gray-400 font-medium">User</th>
                <th className="text-left p-4 text-gray-400 font-medium hidden md:table-cell">Phone</th>
                <th className="text-left p-4 text-gray-400 font-medium hidden lg:table-cell">Joined</th>
                <th className="text-center p-4 text-gray-400 font-medium">Role</th>
                <th className="text-center p-4 text-gray-400 font-medium hidden md:table-cell">Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const badge = getRoleBadge(user.role, user.admin_type);
                return (
                  <tr key={user.id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                          {user.avatar_url ? (
                            <img src={user.avatar_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-gray-400 text-sm font-medium">
                              {getName(user).charAt(0).toUpperCase()}
                            </span>
                          )}
                        </div>
                        <div>
                          <p className="font-medium text-white">{getName(user)}</p>
                          <p className="text-sm text-gray-400">{user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 hidden md:table-cell">
                      <span className="text-gray-300">{user.phone || 'N/A'}</span>
                    </td>
                    <td className="p-4 text-gray-400 hidden lg:table-cell">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="p-4 text-center hidden md:table-cell">
                      {user.onboarding_completed ? (
                        <span className="text-green-400">
                          <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                      ) : (
                        <span className="text-gray-500">
                          <svg className="w-5 h-5 inline" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
