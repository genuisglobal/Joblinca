'use client';

import type { ResumeData } from '@/lib/resume';
import TemplateThumbnail from '../TemplateThumbnail';

interface TemplatePickStepProps {
  data: ResumeData;
  onChange: (updates: Partial<ResumeData>) => void;
}

export default function TemplatePickStep({ data, onChange }: TemplatePickStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-100 mb-2">Choose a Template</h2>
        <p className="text-gray-400">Select a design for your resume PDF.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-2xl">
        <TemplateThumbnail
          template="professional"
          selected={data.template === 'professional'}
          onClick={() => onChange({ template: 'professional' })}
        />
        <TemplateThumbnail
          template="modern"
          selected={data.template === 'modern'}
          onClick={() => onChange({ template: 'modern' })}
        />
      </div>
    </div>
  );
}
