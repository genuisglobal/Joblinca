'use client';

import { useState } from 'react';
import { Plus, Trash2, Sparkles, Loader2 } from 'lucide-react';
import type { ResumeData, ExperienceEntry } from '@/lib/resume';
import { createEmptyExperience } from '@/lib/resume';
import AIButton from '../AIButton';

interface ExperienceStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const inputClass =
  'mt-1 w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500';
const labelClass = 'block text-sm font-medium text-gray-300';

// Renders each line of a multi-line description with its own AI improve
// button, so users can polish one bullet without rewriting the whole entry.
function BulletImprover({
  description,
  context,
  onChange,
}: {
  description: string;
  context: string;
  onChange: (description: string) => void;
}) {
  const [improvingLine, setImprovingLine] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const lines = description.split('\n');
  const bulletIndexes = lines
    .map((line, i) => ({ line: line.trim(), i }))
    .filter(({ line }) => line.length > 0)
    .map(({ i }) => i);

  if (bulletIndexes.length < 2) return null;

  async function improveLine(lineIndex: number) {
    const raw = lines[lineIndex];
    // Strip any leading bullet marker before sending, re-add it after
    const markerMatch = raw.match(/^(\s*(?:[•\-*]\s*)?)/);
    const marker = markerMatch ? markerMatch[1] : '';
    const text = raw.slice(marker.length).trim();
    if (!text) return;

    setImprovingLine(lineIndex);
    setError(null);
    try {
      const res = await fetch('/api/resume/optimize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ field: 'bullet', value: text, context }),
      });
      const result = await res.json().catch(() => ({}));
      if (res.ok && typeof result.improved === 'string') {
        const updated = [...lines];
        updated[lineIndex] = `${marker}${result.improved.replace(/^[•\-*]\s*/, '')}`;
        onChange(updated.join('\n'));
      } else if (res.status === 429) {
        setError('AI limit reached — try again later.');
      } else {
        setError(result.error || 'Improvement failed. Try again.');
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setImprovingLine(null);
    }
  }

  return (
    <div className="mt-2 space-y-1">
      <p className="text-xs text-gray-500">Improve individual bullets:</p>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {bulletIndexes.map((lineIndex) => (
        <div key={lineIndex} className="flex items-start gap-2 group">
          <button
            type="button"
            onClick={() => improveLine(lineIndex)}
            disabled={improvingLine !== null}
            className="shrink-0 mt-0.5 p-1 text-purple-400 hover:text-purple-300 disabled:opacity-40 transition-colors"
            title="Improve this bullet with AI"
          >
            {improvingLine === lineIndex ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
          </button>
          <p className="text-xs text-gray-400 leading-relaxed">{lines[lineIndex].trim()}</p>
        </div>
      ))}
    </div>
  );
}

export default function ExperienceStep({ data, onChange }: ExperienceStepProps) {
  function updateEntry(index: number, updates: Partial<ExperienceEntry>) {
    const updated = [...data.experience];
    updated[index] = { ...updated[index], ...updates };
    onChange({ experience: updated });
  }

  function addEntry() {
    onChange({ experience: [...data.experience, createEmptyExperience()] });
  }

  function removeEntry(index: number) {
    onChange({ experience: data.experience.filter((_, i) => i !== index) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Work Experience</h2>
        <p className="text-gray-400">Add your work history, starting with the most recent position.</p>
      </div>

      {data.experience.map((exp, index) => (
        <div key={index} className="bg-gray-800/50 border border-gray-700 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-300">Position {index + 1}</h3>
            <button
              type="button"
              onClick={() => removeEntry(index)}
              className="text-red-400 hover:text-red-300 p-1"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Job Title *</label>
              <input
                type="text"
                value={exp.role}
                onChange={(e) => updateEntry(index, { role: e.target.value })}
                className={inputClass}
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <label className={labelClass}>Company *</label>
              <input
                type="text"
                value={exp.company}
                onChange={(e) => updateEntry(index, { company: e.target.value })}
                className={inputClass}
                placeholder="Acme Corp"
              />
            </div>
            <div>
              <label className={labelClass}>Start Date *</label>
              <input
                type="text"
                value={exp.startDate}
                onChange={(e) => updateEntry(index, { startDate: e.target.value })}
                className={inputClass}
                placeholder="Jan 2022"
              />
            </div>
            <div>
              <label className={labelClass}>End Date</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={exp.current ? '' : exp.endDate}
                  onChange={(e) => updateEntry(index, { endDate: e.target.value })}
                  className={inputClass}
                  placeholder="Dec 2023"
                  disabled={exp.current}
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-400 whitespace-nowrap mt-1">
                  <input
                    type="checkbox"
                    checked={exp.current}
                    onChange={(e) => updateEntry(index, { current: e.target.checked, endDate: '' })}
                    className="rounded border-gray-600 bg-gray-800 text-blue-500 focus:ring-blue-500"
                  />
                  Current
                </label>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass}>Description</label>
              <AIButton
                field="experience"
                value={exp.description}
                context={[exp.role, exp.company].filter(Boolean).join(' at ')}
                onResult={(improved) => updateEntry(index, { description: improved as string })}
              />
            </div>
            <textarea
              value={exp.description}
              onChange={(e) => updateEntry(index, { description: e.target.value })}
              rows={4}
              className="w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 resize-y"
              placeholder="Led development of customer-facing features, increasing user engagement by 30%..."
            />
            <BulletImprover
              description={exp.description}
              context={[exp.role, exp.company].filter(Boolean).join(' at ')}
              onChange={(description) => updateEntry(index, { description })}
            />
          </div>
        </div>
      ))}

      <button
        type="button"
        onClick={addEntry}
        className="w-full py-3 border-2 border-dashed border-gray-600 rounded-xl text-gray-400 hover:text-gray-200 hover:border-gray-400 transition-colors flex items-center justify-center gap-2"
      >
        <Plus className="w-4 h-4" />
        Add Experience
      </button>
    </div>
  );
}
