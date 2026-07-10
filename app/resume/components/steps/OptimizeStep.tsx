'use client';

import { useState } from 'react';
import { Target, Loader2, AlertCircle, CheckCircle, Plus, Lightbulb } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';

interface AtsReport {
  score: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  suggestedSkills: string[];
  improvedSummary: string;
  suggestions: string[];
}

interface OptimizeStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

function scoreColor(score: number): string {
  if (score >= 75) return 'text-green-400 border-green-500/40 bg-green-500/10';
  if (score >= 50) return 'text-yellow-400 border-yellow-500/40 bg-yellow-500/10';
  return 'text-red-400 border-red-500/40 bg-red-500/10';
}

function scoreLabel(score: number): string {
  if (score >= 75) return 'Strong match';
  if (score >= 50) return 'Decent match — room to improve';
  return 'Weak match — tailor your resume';
}

export default function OptimizeStep({ data, onChange }: OptimizeStepProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<AtsReport | null>(null);
  const [summaryApplied, setSummaryApplied] = useState(false);

  async function handleAnalyze() {
    setLoading(true);
    setError(null);
    setSummaryApplied(false);
    try {
      const res = await fetch('/api/resume/ats-score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: data, jobDescription }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok) {
        setReport(result as AtsReport);
      } else if (res.status === 429) {
        setError('Analysis limit reached — please try again later.');
      } else {
        setError(result.error || 'Analysis failed. Please try again.');
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  function addSkill(skill: string) {
    if (!data.skills.includes(skill)) {
      onChange({ skills: [...data.skills, skill] });
    }
  }

  function applySummary() {
    if (report?.improvedSummary) {
      onChange({ summary: report.improvedSummary });
      setSummaryApplied(true);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2 flex items-center gap-2">
          <Target className="w-5 h-5 text-blue-400" />
          Target a Job (Optional)
        </h2>
        <p className="text-gray-400">
          Paste a job description to see how well your resume matches, find missing keywords, and tailor it with AI. Skip this step if you want a general-purpose resume.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-2">Job Description</label>
        <textarea
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
          rows={8}
          className="w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 resize-y"
          placeholder="Paste the full job description here..."
        />
        <div className="flex items-center justify-between mt-2">
          <p className="text-xs text-gray-500">{jobDescription.length} characters (min 50)</p>
          <button
            type="button"
            onClick={handleAnalyze}
            disabled={loading || jobDescription.trim().length < 50}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            {loading ? 'Analyzing...' : report ? 'Re-analyze' : 'Analyze Match'}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {report && (
        <div className="space-y-5">
          {/* Score */}
          <div className={`flex items-center gap-4 border rounded-xl p-5 ${scoreColor(report.score)}`}>
            <div className="text-4xl font-bold">{report.score}</div>
            <div>
              <p className="font-semibold">Match Score</p>
              <p className="text-sm opacity-80">{scoreLabel(report.score)}</p>
            </div>
          </div>

          {/* Keywords */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {report.matchedKeywords.length > 0 && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-sm font-medium text-green-400 mb-3 flex items-center gap-1.5">
                  <CheckCircle className="w-4 h-4" />
                  Keywords you cover
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.matchedKeywords.map((kw) => (
                    <span key={kw} className="px-2.5 py-1 bg-green-500/15 text-green-300 border border-green-500/30 rounded-full text-xs">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {report.missingKeywords.length > 0 && (
              <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
                <p className="text-sm font-medium text-yellow-400 mb-3 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  Missing keywords
                </p>
                <div className="flex flex-wrap gap-2">
                  {report.missingKeywords.map((kw) => (
                    <span key={kw} className="px-2.5 py-1 bg-yellow-500/15 text-yellow-300 border border-yellow-500/30 rounded-full text-xs">
                      {kw}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggested skills to add */}
          {report.suggestedSkills.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-300 mb-1">Add these skills</p>
              <p className="text-xs text-gray-500 mb-3">Only add skills you genuinely have — recruiters verify them.</p>
              <div className="flex flex-wrap gap-2">
                {report.suggestedSkills.map((skill) => {
                  const added = data.skills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => addSkill(skill)}
                      disabled={added}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border transition-colors ${
                        added
                          ? 'bg-green-500/15 text-green-300 border-green-500/30 cursor-default'
                          : 'bg-blue-500/15 text-blue-300 border-blue-500/30 hover:bg-blue-500/25'
                      }`}
                    >
                      {added ? <CheckCircle className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {skill}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tailored summary */}
          {report.improvedSummary && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-300">Tailored summary for this job</p>
                <button
                  type="button"
                  onClick={applySummary}
                  disabled={summaryApplied}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition-colors ${
                    summaryApplied
                      ? 'bg-green-500/15 text-green-300 border-green-500/30 cursor-default'
                      : 'bg-purple-600/20 text-purple-300 border-purple-500/30 hover:bg-purple-600/30'
                  }`}
                >
                  {summaryApplied ? <CheckCircle className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                  {summaryApplied ? 'Applied' : 'Use this summary'}
                </button>
              </div>
              <p className="text-sm text-gray-300 italic">{report.improvedSummary}</p>
            </div>
          )}

          {/* Actionable suggestions */}
          {report.suggestions.length > 0 && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <p className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-1.5">
                <Lightbulb className="w-4 h-4 text-yellow-400" />
                Suggestions to improve your match
              </p>
              <ul className="space-y-2">
                {report.suggestions.map((s, i) => (
                  <li key={i} className="text-sm text-gray-400 flex gap-2">
                    <span className="text-blue-400 shrink-0">•</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
