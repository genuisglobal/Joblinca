'use client';

import { useState } from 'react';
import StatusBadge from '../../../components/StatusBadge';
import { CustomQuestion, QuestionAnswer } from '@/lib/questions';

interface Profile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
}

interface Application {
  id: string;
  job_id: string;
  applicant_id: string;
  cover_letter: string | null;
  answers: QuestionAnswer[] | null;
  status: string;
  created_at: string;
  profiles: Profile;
}

interface ApplicationsTableProps {
  applications: Application[];
  jobId: string;
  customQuestions?: CustomQuestion[] | null;
}

const statusOptions = [
  'submitted',
  'shortlisted',
  'interviewed',
  'hired',
  'rejected',
];

export default function ApplicationsTable({
  applications,
  jobId,
  customQuestions,
}: ApplicationsTableProps) {
  const [appStatuses, setAppStatuses] = useState<Record<string, string>>(
    Object.fromEntries(applications.map((app) => [app.id, app.status]))
  );
  const [updating, setUpdating] = useState<string | null>(null);
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const updateStatus = async (appId: string, newStatus: string) => {
    setUpdating(appId);
    try {
      const response = await fetch(`/api/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (response.ok) {
        setAppStatuses((prev) => ({ ...prev, [appId]: newStatus }));
      }
    } catch (error) {
      console.error('Failed to update status:', error);
    } finally {
      setUpdating(null);
    }
  };

  const getApplicantName = (profile: Profile) => {
    if (profile.first_name && profile.last_name) {
      return `${profile.first_name} ${profile.last_name}`;
    }
    return profile.full_name || 'Anonymous';
  };

  if (applications.length === 0) {
    return (
      <div className="text-center py-12">
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
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="text-lg font-medium text-white mb-2">
          No applications yet
        </h3>
        <p className="text-gray-400">
          Applications will appear here once candidates start applying.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {applications.map((app) => (
        <div
          key={app.id}
          className="border border-gray-700 rounded-lg overflow-hidden"
        >
          <div
            className="flex items-center justify-between p-4 bg-gray-700/30 cursor-pointer hover:bg-gray-700/50"
            onClick={() =>
              setExpandedApp(expandedApp === app.id ? null : app.id)
            }
          >
            <div className="flex items-center gap-4">
              {app.profiles?.avatar_url ? (
                <img
                  src={app.profiles.avatar_url}
                  alt="Applicant"
                  className="w-10 h-10 rounded-full object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                  {getApplicantName(app.profiles).charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-medium text-white">
                  {getApplicantName(app.profiles)}
                </p>
                <p className="text-sm text-gray-400">
                  Applied {new Date(app.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <StatusBadge status={appStatuses[app.id]} />
              <svg
                className={`w-5 h-5 text-gray-400 transition-transform ${
                  expandedApp === app.id ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </div>
          </div>

          {expandedApp === app.id && (
            <div className="p-4 border-t border-gray-700 space-y-4">
              {/* Cover Letter */}
              {app.cover_letter && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Cover Letter
                  </h4>
                  <p className="text-gray-300 whitespace-pre-wrap bg-gray-900 p-4 rounded-lg">
                    {app.cover_letter}
                  </p>
                </div>
              )}

              {/* Custom Answers */}
              {app.answers && app.answers.length > 0 && customQuestions && (
                <div>
                  <h4 className="text-sm font-medium text-gray-400 mb-2">
                    Screening Questions
                  </h4>
                  <div className="bg-gray-900 p-4 rounded-lg space-y-4">
                    {app.answers.map((answerObj) => {
                      const question = customQuestions.find(
                        (q) => q.id === answerObj.questionId
                      );
                      if (!question) return null;

                      let displayAnswer: string;
                      if (typeof answerObj.answer === 'boolean') {
                        displayAnswer = answerObj.answer ? 'Yes' : 'No';
                      } else if (Array.isArray(answerObj.answer)) {
                        displayAnswer = answerObj.answer.join(', ');
                      } else {
                        displayAnswer = String(answerObj.answer);
                      }

                      return (
                        <div key={answerObj.questionId}>
                          <p className="text-sm text-gray-400 mb-1">
                            {question.question}
                            {question.required && (
                              <span className="text-red-400 ml-1">*</span>
                            )}
                          </p>
                          <p className="text-gray-300">{displayAnswer || '-'}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Status Update */}
              <div>
                <h4 className="text-sm font-medium text-gray-400 mb-2">
                  Update Status
                </h4>
                <div className="flex flex-wrap gap-2">
                  {statusOptions.map((status) => (
                    <button
                      key={status}
                      onClick={() => updateStatus(app.id, status)}
                      disabled={
                        updating === app.id || appStatuses[app.id] === status
                      }
                      className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        appStatuses[app.id] === status
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                      } ${
                        updating === app.id
                          ? 'opacity-50 cursor-not-allowed'
                          : ''
                      }`}
                    >
                      {status === 'submitted' && 'Submitted'}
                      {status === 'shortlisted' && 'Shortlist'}
                      {status === 'interviewed' && 'Interviewed'}
                      {status === 'hired' && 'Hire'}
                      {status === 'rejected' && 'Reject'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
