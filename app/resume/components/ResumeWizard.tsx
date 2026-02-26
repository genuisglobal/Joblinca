'use client';

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';
import { createEmptyResume } from '@/lib/resume';
import { contactInfoSchema } from '@/lib/resume-schema';
import ResumeProgressBar from './ResumeProgressBar';
import UploadStep from './steps/UploadStep';
import ContactInfoStep from './steps/ContactInfoStep';
import SummaryStep from './steps/SummaryStep';
import ExperienceStep from './steps/ExperienceStep';
import EducationStep from './steps/EducationStep';
import SkillsStep from './steps/SkillsStep';
import ExtrasStep from './steps/ExtrasStep';
import TemplatePickStep from './steps/TemplatePickStep';
import PreviewStep from './steps/PreviewStep';

type WizardPath = 'upload' | 'scratch';

interface ResumeWizardProps {
  path: WizardPath;
  onBack: () => void;
}

const UPLOAD_STEPS = ['Upload', 'Contact', 'Summary', 'Experience', 'Education', 'Skills', 'Extras', 'Template', 'Preview'];
const SCRATCH_STEPS = ['Contact', 'Summary', 'Experience', 'Education', 'Skills', 'Extras', 'Template', 'Preview'];

export default function ResumeWizard({ path, onBack }: ResumeWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ResumeData>(createEmptyResume());
  const [direction, setDirection] = useState(1);

  const steps = path === 'upload' ? UPLOAD_STEPS : SCRATCH_STEPS;
  const totalSteps = steps.length;

  function handleChange(updates: Partial<ResumeData>) {
    setData((prev) => ({ ...prev, ...updates }));
  }

  function handleParsed(parsed: ResumeData) {
    setData((prev) => ({ ...prev, ...parsed }));
    goNext();
  }

  const canGoNext = useMemo(() => {
    const currentLabel = steps[step];
    if (currentLabel === 'Upload') return false; // auto-advances on parse
    if (currentLabel === 'Contact') {
      const result = contactInfoSchema.safeParse(data);
      return result.success;
    }
    return true;
  }, [step, steps, data]);

  function goNext() {
    if (step < totalSteps - 1) {
      setDirection(1);
      setStep((s) => s + 1);
    }
  }

  function goBack() {
    if (step > 0) {
      setDirection(-1);
      setStep((s) => s - 1);
    } else {
      onBack();
    }
  }

  function renderStep() {
    const currentLabel = steps[step];
    switch (currentLabel) {
      case 'Upload':
        return <UploadStep onParsed={handleParsed} />;
      case 'Contact':
        return <ContactInfoStep data={data} onChange={handleChange} />;
      case 'Summary':
        return <SummaryStep data={data} onChange={handleChange} />;
      case 'Experience':
        return <ExperienceStep data={data} onChange={handleChange} />;
      case 'Education':
        return <EducationStep data={data} onChange={handleChange} />;
      case 'Skills':
        return <SkillsStep data={data} onChange={handleChange} />;
      case 'Extras':
        return <ExtrasStep data={data} onChange={handleChange} />;
      case 'Template':
        return <TemplatePickStep data={data} onChange={handleChange} />;
      case 'Preview':
        return <PreviewStep data={data} />;
      default:
        return null;
    }
  }

  const isLastStep = step === totalSteps - 1;

  return (
    <div className="max-w-3xl mx-auto">
      <ResumeProgressBar currentStep={step} totalSteps={totalSteps} labels={steps} />

      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={step}
          custom={direction}
          initial={{ opacity: 0, x: direction * 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: direction * -40 }}
          transition={{ duration: 0.25 }}
        >
          {renderStep()}
        </motion.div>
      </AnimatePresence>

      {/* Navigation */}
      <div className="flex justify-between mt-8 pt-6 border-t border-gray-700">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 px-4 py-2.5 text-gray-300 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {!isLastStep && steps[step] !== 'Upload' && (
          <button
            type="button"
            onClick={goNext}
            disabled={!canGoNext}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
            <ArrowRight className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
