'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import {
  Role,
  Gender,
  RecruiterType,
  Skill,
  OnboardingStatus,
  getStepsForRole,
} from '@/lib/onboarding/types';
import { validateBasicInfo } from '@/lib/onboarding/schemas';

import ProgressIndicator from './ProgressIndicator';
import StepContainer from './StepContainer';
import WelcomeStep from './steps/WelcomeStep';
import BasicInfoStep from './steps/BasicInfoStep';
import ProfilePictureStep from './steps/ProfilePictureStep';
import LocationStep from './steps/LocationStep';
import ResumeUploadStep from './steps/ResumeUploadStep';
import LocationInterestStep from './steps/LocationInterestStep';
import EducationStep from './steps/EducationStep';
import SkillsStep from './steps/SkillsStep';
import RecruiterTypeStep from './steps/RecruiterTypeStep';
import CompanyInfoStep from './steps/CompanyInfoStep';
import CompletionStep from './steps/CompletionStep';

interface OnboardingWizardProps {
  initialStatus: OnboardingStatus;
}

export default function OnboardingWizard({ initialStatus }: OnboardingWizardProps) {
  const router = useRouter();
  const supabase = createClient();

  // Navigation state
  const [currentStep, setCurrentStep] = useState(initialStatus.currentStep);
  const [direction, setDirection] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [firstName, setFirstName] = useState(initialStatus.savedData.firstName || '');
  const [lastName, setLastName] = useState(initialStatus.savedData.lastName || '');
  const [phone, setPhone] = useState(initialStatus.savedData.phone || '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialStatus.savedData.avatarUrl || null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [gender, setGender] = useState<Gender | null>((initialStatus.savedData.gender as Gender) || null);
  const [residenceLocation, setResidenceLocation] = useState<string | null>(
    initialStatus.savedData.residenceLocation || null
  );
  const [resumeUrl, setResumeUrl] = useState<string | null>(initialStatus.savedData.resumeUrl || null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [locationInterests, setLocationInterests] = useState<string[]>(
    initialStatus.savedData.locationInterests || []
  );
  const [schoolName, setSchoolName] = useState(initialStatus.savedData.schoolName || '');
  const [graduationYear, setGraduationYear] = useState<number | null>(
    initialStatus.savedData.graduationYear || null
  );
  const [fieldOfStudy, setFieldOfStudy] = useState(initialStatus.savedData.fieldOfStudy || '');
  const [skills, setSkills] = useState<Skill[]>(initialStatus.savedData.skills || []);
  const [recruiterType, setRecruiterType] = useState<RecruiterType | null>(
    (initialStatus.savedData.recruiterType as RecruiterType) || null
  );
  const [companyName, setCompanyName] = useState(initialStatus.savedData.companyName || '');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(
    initialStatus.savedData.companyLogoUrl || null
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [contactEmail, setContactEmail] = useState(initialStatus.savedData.contactEmail || '');

  // Error state
  const [errors, setErrors] = useState<Record<string, string>>({});

  const role = initialStatus.role;
  const steps = getStepsForRole(role);

  // Get current step config
  const currentStepConfig = steps[currentStep];

  // Upload file to Supabase Storage
  const uploadFile = useCallback(async (file: File, bucket: string, path: string): Promise<string | null> => {
    try {
      const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        upsert: true,
      });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(data.path);
      return urlData.publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      return null;
    }
  }, [supabase]);

  // Save current step data
  const saveStep = useCallback(async () => {
    setIsSaving(true);
    setErrors({});

    try {
      // Get user ID for file uploads
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Build data to save
      const data: Record<string, unknown> = {};

      // Handle file uploads first
      if (avatarFile) {
        const url = await uploadFile(avatarFile, 'profile-avatars', `${user.id}/avatar`);
        if (url) {
          data.avatarUrl = url;
          setAvatarUrl(url);
          setAvatarFile(null);
        }
      }

      if (resumeFile) {
        const ext = resumeFile.name.split('.').pop();
        const url = await uploadFile(resumeFile, 'application-cvs', `${user.id}/resume.${ext}`);
        if (url) {
          data.resumeUrl = url;
          setResumeUrl(url);
          setResumeFile(null);
        }
      }

      if (logoFile) {
        const url = await uploadFile(logoFile, 'company-logos', `${user.id}/logo`);
        if (url) {
          data.companyLogoUrl = url;
          setCompanyLogoUrl(url);
          setLogoFile(null);
        }
      }

      // Add form data based on current step
      const stepId = currentStepConfig?.id;

      if (stepId === 'basic-info') {
        data.firstName = firstName;
        data.lastName = lastName;
        data.phone = phone;
      } else if (stepId === 'profile-picture') {
        if (avatarUrl) data.avatarUrl = avatarUrl;
      } else if (stepId === 'location') {
        data.residenceLocation = residenceLocation;
        data.gender = gender;
      } else if (stepId === 'resume') {
        if (resumeUrl) data.resumeUrl = resumeUrl;
      } else if (stepId === 'location-interests') {
        data.locationInterests = locationInterests;
      } else if (stepId === 'education') {
        data.schoolName = schoolName;
        data.graduationYear = graduationYear;
        data.fieldOfStudy = fieldOfStudy;
      } else if (stepId === 'skills') {
        data.skills = skills;
      } else if (stepId === 'recruiter-type') {
        data.recruiterType = recruiterType;
      } else if (stepId === 'company-info') {
        data.companyName = companyName;
        if (companyLogoUrl) data.companyLogoUrl = companyLogoUrl;
        data.contactEmail = contactEmail;
      }

      // Save to API - only if we have data to save
      if (Object.keys(data).length > 0) {
        const response = await fetch('/api/onboarding/save-step', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step: currentStep, data }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          console.error('API error:', errorData);
          // Don't throw - just return false and let goNext decide what to do
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error('Save error:', err);
      // Return true for optional steps so navigation isn't blocked
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [
    currentStep,
    currentStepConfig,
    firstName,
    lastName,
    phone,
    avatarUrl,
    avatarFile,
    gender,
    residenceLocation,
    resumeUrl,
    resumeFile,
    locationInterests,
    schoolName,
    graduationYear,
    fieldOfStudy,
    skills,
    recruiterType,
    companyName,
    companyLogoUrl,
    logoFile,
    contactEmail,
    supabase,
    uploadFile,
  ]);

  // Validate current step
  const validateCurrentStep = useCallback((): boolean => {
    const stepId = currentStepConfig?.id;
    const newErrors: Record<string, string> = {};

    if (stepId === 'basic-info') {
      const result = validateBasicInfo({ firstName, lastName, phone });
      if (!result.success) {
        result.error.errors.forEach((err) => {
          const field = err.path[0] as string;
          newErrors[field] = err.message;
        });
      }
    } else if (stepId === 'recruiter-type' && role === 'recruiter' && !recruiterType) {
      newErrors.recruiterType = 'Please select a recruiter type';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [currentStepConfig, firstName, lastName, phone, recruiterType, role]);

  // Navigate to next step
  const goNext = useCallback(async () => {
    // Skip validation for welcome and completion steps
    if (currentStepConfig?.id !== 'welcome' && currentStepConfig?.id !== 'completion') {
      if (!validateCurrentStep()) return;
    }

    // Save current step data (except welcome and completion)
    if (currentStepConfig?.id !== 'welcome' && currentStepConfig?.id !== 'completion') {
      const saved = await saveStep();
      // Only block navigation if save failed AND step is required (basic-info, recruiter-type)
      if (!saved && currentStepConfig?.required) {
        console.error('Failed to save required step');
        return;
      }
      // For optional steps, continue even if save failed
    }

    if (currentStep < steps.length - 1) {
      setDirection(1);
      setCurrentStep((prev) => prev + 1);
    }
  }, [currentStep, currentStepConfig, steps.length, validateCurrentStep, saveStep]);

  // Navigate to previous step
  const goPrev = useCallback(() => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep((prev) => prev - 1);
    }
  }, [currentStep]);

  // Skip onboarding
  const skipOnboarding = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/onboarding/skip', {
        method: 'POST',
      });

      if (response.ok) {
        // Use replace to prevent back button returning to onboarding
        window.location.href = '/dashboard';
      } else {
        console.error('Skip failed:', await response.text());
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Skip error:', err);
      setIsLoading(false);
    }
  }, []);

  // Complete onboarding
  const completeOnboarding = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/onboarding/complete', {
        method: 'POST',
      });

      if (response.ok) {
        // Use replace to prevent back button returning to onboarding
        window.location.href = '/dashboard';
      } else {
        console.error('Complete failed:', await response.text());
        setIsLoading(false);
      }
    } catch (err) {
      console.error('Complete error:', err);
      setIsLoading(false);
    }
  }, []);

  // Render current step component
  const renderStep = () => {
    const stepId = currentStepConfig?.id;

    switch (stepId) {
      case 'welcome':
        return <WelcomeStep role={role} onNext={goNext} />;

      case 'basic-info':
        return (
          <BasicInfoStep
            firstName={firstName}
            lastName={lastName}
            phone={phone}
            onFirstNameChange={setFirstName}
            onLastNameChange={setLastName}
            onPhoneChange={setPhone}
            errors={errors}
          />
        );

      case 'profile-picture':
        return (
          <ProfilePictureStep
            avatarUrl={avatarUrl}
            avatarFile={avatarFile}
            onFileSelect={setAvatarFile}
          />
        );

      case 'location':
        return (
          <LocationStep
            residenceLocation={residenceLocation}
            gender={gender}
            onLocationChange={setResidenceLocation}
            onGenderChange={setGender}
          />
        );

      case 'resume':
        return (
          <ResumeUploadStep
            resumeFile={resumeFile}
            resumeUrl={resumeUrl}
            onFileSelect={setResumeFile}
          />
        );

      case 'location-interests':
        return (
          <LocationInterestStep
            locationInterests={locationInterests}
            onLocationInterestsChange={setLocationInterests}
          />
        );

      case 'education':
        return (
          <EducationStep
            schoolName={schoolName}
            graduationYear={graduationYear}
            fieldOfStudy={fieldOfStudy}
            onSchoolNameChange={setSchoolName}
            onGraduationYearChange={setGraduationYear}
            onFieldOfStudyChange={setFieldOfStudy}
          />
        );

      case 'skills':
        return <SkillsStep skills={skills} onSkillsChange={setSkills} />;

      case 'recruiter-type':
        return (
          <RecruiterTypeStep
            recruiterType={recruiterType}
            onRecruiterTypeChange={setRecruiterType}
            error={errors.recruiterType}
          />
        );

      case 'company-info':
        return (
          <CompanyInfoStep
            companyName={companyName}
            contactEmail={contactEmail}
            companyLogoUrl={companyLogoUrl}
            logoFile={logoFile}
            onCompanyNameChange={setCompanyName}
            onContactEmailChange={setContactEmail}
            onLogoFileSelect={setLogoFile}
            errors={errors}
          />
        );

      case 'completion':
        return (
          <CompletionStep
            role={role}
            firstName={firstName}
            onComplete={completeOnboarding}
            isLoading={isLoading}
          />
        );

      default:
        return null;
    }
  };

  const showNavigation = currentStepConfig?.id !== 'welcome' && currentStepConfig?.id !== 'completion';
  const showSkip = currentStepConfig?.id !== 'completion';
  const isFirstContentStep = currentStep === 1;

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <span className="text-2xl font-bold text-white">Job</span>
          <span className="text-2xl font-bold text-yellow-400">Linca</span>
        </div>

        {/* Skip button */}
        {showSkip && (
          <button
            onClick={skipOnboarding}
            disabled={isLoading || isSaving}
            className="flex items-center gap-1 text-gray-400 hover:text-gray-200 transition-colors text-sm disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <span className="animate-spin rounded-full h-4 w-4 border-2 border-gray-400 border-t-transparent" />
                Skipping...
              </>
            ) : (
              <>
                Skip for now
                <X className="w-4 h-4" />
              </>
            )}
          </button>
        )}
      </header>

      {/* Progress indicator */}
      {showNavigation && (
        <div className="px-6 py-4 border-b border-gray-800">
          <ProgressIndicator steps={steps} currentStep={currentStep} />
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="w-full max-w-lg">
          <StepContainer stepKey={currentStepConfig?.id || ''} direction={direction}>
            {renderStep()}
          </StepContainer>
        </div>
      </main>

      {/* Navigation buttons */}
      {showNavigation && (
        <footer className="px-6 py-4 border-t border-gray-800">
          <div className="max-w-lg mx-auto flex justify-between items-center">
            {/* Back button */}
            <button
              onClick={goPrev}
              disabled={isFirstContentStep || isSaving}
              className={`
                flex items-center gap-2 px-4 py-2 rounded-lg
                text-gray-300 hover:text-white transition-colors
                ${isFirstContentStep ? 'invisible' : ''}
                disabled:opacity-50 disabled:cursor-not-allowed
              `}
            >
              <ChevronLeft className="w-5 h-5" />
              Back
            </button>

            {/* Next button */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={goNext}
              disabled={isSaving}
              className="
                flex items-center gap-2 px-6 py-3 rounded-lg
                bg-blue-600 hover:bg-blue-700 text-white font-medium
                transition-colors
                disabled:opacity-50 disabled:cursor-not-allowed
              "
            >
              {isSaving ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Saving...
                </>
              ) : (
                <>
                  Continue
                  <ChevronRight className="w-5 h-5" />
                </>
              )}
            </motion.button>
          </div>
        </footer>
      )}
    </div>
  );
}
