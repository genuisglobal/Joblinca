'use client';

import type { ResumeData } from '@/lib/resume';
import TemplateThumbnail from '../TemplateThumbnail';

interface TemplatePickStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

const TEMPLATES: Array<{ id: ResumeData['template']; badge?: string }> = [
  { id: 'professional' },
  { id: 'modern' },
  { id: 'executive',   badge: 'Formal' },
  { id: 'creative',    badge: 'Standout' },
  { id: 'minimal',     badge: 'ATS Safe' },
  { id: 'compact',     badge: 'Dense' },
];

export default function TemplatePickStep({ data, onChange }: TemplatePickStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Choose a Template</h2>
        <p className="text-gray-400">
          Select a design for your resume PDF. Each template is fully paginated — no content will be cut off.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
        {TEMPLATES.map(({ id, badge }) => (
          <div key={id} className="relative">
            {badge && (
              <span className="absolute -top-2 left-2 z-10 px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-600 text-white shadow">
                {badge}
              </span>
            )}
            <TemplateThumbnail
              template={id}
              selected={data.template === id}
              onClick={() => onChange({ template: id })}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-500">
        Tip: <span className="text-gray-400">Minimal</span> and{' '}
        <span className="text-gray-400">Professional</span> are the most ATS-friendly.{' '}
        <span className="text-gray-400">Executive</span> uses Times Roman for a formal feel.{' '}
        <span className="text-gray-400">Compact</span> fits the most content on one page.
      </p>
    </div>
  );
}
