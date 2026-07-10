'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, History, X } from 'lucide-react';
import type { ResumeData } from '@/lib/resume';
import { createEmptyResume, RESUME_DRAFT_KEY } from '@/lib/resume';
import { contactInfoSchema } from '@/lib/resume-schema';
import ResumeProgressBar from './ResumeProgressBar';
import UploadStep from './steps/UploadStep';
import ContactInfoStep from './steps/ContactInfoStep';
import SummaryStep from './steps/SummaryStep';
import ExperienceStep from './steps/ExperienceStep';
import EducationStep from './steps/EducationStep';
import SkillsStep from './steps/SkillsStep';
import ExtrasStep from './steps/ExtrasStep';
import OptimizeStep from './steps/OptimizeStep';
import TemplatePickStep from './steps/TemplatePickStep';
import PreviewStep from './steps/PreviewStep';

type WizardPath = 'upload' | 'scratch';

interface ResumeWizardProps {
  path: WizardPath;
  onBack: () => void;
  /** When editing a saved resume: prefill the wizard and update in place on save */
  initialData?: ResumeData;
  resumeId?: string;
}

interface DraftPayload {
  path: WizardPath;
  step: number;
  data: ResumeData;
  savedAt: number;
}

const UPLOAD_STEPS = ['Upload', 'Contact', 'Summary', 'Experience', 'Education', 'Skills', 'Extras', 'Optimize', 'Template', 'Preview'];
const SCRATCH_STEPS = ['Contact', 'Summary', 'Experience', 'Education', 'Skills', 'Extras', 'Optimize', 'Template', 'Preview'];

function loadDraft(path: WizardPath): DraftPayload | null {
  try {
    const raw = localStorage.getItem(RESUME_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as DraftPayload;
    if (draft.path !== path || !draft.data) return null;
    return draft;
  } catch {
    return null;
  }
}

export default function ResumeWizard({ path, onBack, initialData, resumeId }: ResumeWizardProps) {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<ResumeData>(() =>
    initialData ? { ...createEmptyResume(), ...initialData } : createEmptyResume()
  );
  const [direction, setDirection] = useState(1);
  const [draftRestored, setDraftRestored] = useState(false);
  const hydrated = useRef(false);

  // When editing a saved resume, the DB row is the source of truth —
  // skip the localStorage draft entirely so it can't clobber either one.
  const isEditing = Boolean(resumeId);

  const steps = path === 'upload' ? UPLOAD_STEPS : SCRATCH_STEPS;
  const totalSteps = steps.length;

  // Restore a saved draft on mount (client-only to avoid hydration mismatch)
  useEffect(() => {
    if (!isEditing) {
      const draft = loadDraft(path);
      if (draft) {
        setData({ ...createEmptyResume(), ...draft.data });
        const maxStep = (path === 'upload' ? UPLOAD_STEPS : SCRATCH_STEPS).length - 1;
        setStep(Math.min(Math.max(draft.step, 0), maxStep));
        setDraftRestored(true);
      }
    }
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave draft so a refresh doesn't lose the user's progress
  useEffect(() => {
    if (!hydrated.current || isEditing) return;
    const timeout = setTimeout(() => {
      try {
        const payload: DraftPayload = { path, step, data, savedAt: Date.now() };
        localStorage.setItem(RESUME_DRAFT_KEY, JSON.stringify(payload));
      } catch {
        // storage full or unavailable — autosave is best-effort
      }
    }, 400);
    return () => clearTimeout(timeout);
  }, [data, step, path, isEditing]);

  function discardDraft() {
    try {
      localStorage.removeItem(RESUME_DRAFT_KEY);
    } catch {
      // ignore
    }
    setData(createEmptyResume());
    setStep(0);
    setDraftRestored(false);
  }

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
      case 'Optimize':
        return <OptimizeStep data={data} onChange={handleChange} />;
      case 'Template':
        return <TemplatePickStep data={data} onChange={handleChange} />;
      case 'Preview':
        return <PreviewStep data={data} resumeId={resumeId} />;
      default:
        return null;
    }
  }

  const isLastStep = step === totalSteps - 1;

  return (
    <div className="max-w-3xl mx-auto">
      {draftRestored && (
        <div className="flex items-center justify-between gap-3 mb-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm text-blue-300">
          <span className="flex items-center gap-2">
            <History className="w-4 h-4 shrink-0" />
            We restored your unsaved draft.
          </span>
          <button
            type="button"
            onClick={discardDraft}
            className="inline-flex items-center gap-1 text-blue-300 hover:text-white transition-colors whitespace-nowrap"
          >
            <X className="w-3.5 h-3.5" />
            Start fresh
          </button>
        </div>
      )}

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
