'use client';

import type { ResumeData } from '@/lib/resume';
import AIButton from '../AIButton';

interface SummaryStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

export default function SummaryStep({ data, onChange }: SummaryStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Professional Summary</h2>
        <p className="text-gray-400">Write a brief overview of your professional background and goals.</p>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-300">Summary</label>
          <AIButton
            field="summary"
            value={data.summary}
            onResult={(improved) => onChange({ summary: improved as string })}
          />
        </div>
        <textarea
          value={data.summary}
          onChange={(e) => onChange({ summary: e.target.value })}
          rows={6}
          className="w-full px-3 py-2 bg-gray-800 text-gray-100 border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-gray-500 resize-y"
          placeholder="Experienced software engineer with 5+ years of expertise in building scalable web applications..."
        />
        <p className="text-xs text-gray-500 mt-1">
          {data.summary.length} characters
        </p>
      </div>
    </div>
  );
}
