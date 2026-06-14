import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import InteractiveOnboarding, { coachSteps, traineeSteps } from '@/components/onboarding/InteractiveOnboarding';
import { toast } from 'sonner';

const createSessionId = () => `ONB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export default function OnboardingScreen() {
  const sessionId = useRef(createSessionId()).current;
  const startTime = useRef(Date.now()).current;
  const [stepIndex, setStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState([]);
  const [showSuccess, setShowSuccess] = useState(false);
  const [firstSuccessfulAction, setFirstSuccessfulAction] = useState(null);
  const [skippedSteps, setSkippedSteps] = useState([]);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee, isLoading: traineeLoading } = useQuery({
    queryKey: ['onboardingTrainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const [isSaving, setIsSaving] = useState(false);

  const { data: coachTrainees = [] } = useQuery({
    queryKey: ['onboardingCoachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const roleType = user?.role === 'admin' || coachTrainees.length > 0 ? 'coach' : 'trainee';
  const steps = roleType === 'coach' ? coachSteps : traineeSteps;
  const currentStep = steps[stepIndex] || steps[0];

  const analyticsBase = useMemo(() => ({
    user_email: user?.email || 'unknown',
    role_type: roleType,
    session_id: sessionId,
  }), [user?.email, roleType, sessionId]);

  const trackEvent = (event) => {
    if (!user?.email) return;
    base44.entities.OnboardingAnalytics.create({
      ...analyticsBase,
      ...event,
      completion_percent: event.completion_percent ?? Math.round(((stepIndex + (showSuccess ? 1 : 0)) / steps.length) * 100),
      duration_seconds: Math.round((Date.now() - startTime) / 1000),
    }).catch(() => null);
  };

  React.useEffect(() => {
    if (!user?.email) return;
    trackEvent({ event_type: 'started', step_id: currentStep?.id, step_index: stepIndex });
  }, [user?.email]);

  React.useEffect(() => {
    if (!user?.email || !currentStep?.id) return;
    trackEvent({ event_type: 'step_viewed', step_id: currentStep.id, step_index: stepIndex });
  }, [stepIndex, user?.email]);

  // Shared write-then-redirect. Called by both complete and skip paths.
  // Guards: (1) blocks if trainee hasn't loaded yet; (2) try/catch so a
  // network error shows a toast and keeps the user on the page instead of
  // redirecting with onboarding_status still 'pending'.
  const finishOnboarding = async () => {
    if (traineeLoading || !user?.email) {
      toast.error('נתוני המשתמש עדיין נטענים — נסה שנית');
      return;
    }
    if (!trainee?.id) {
      // Trainee record genuinely not found — still let them through so they
      // are not permanently stuck, but log the anomaly.
      console.warn('[Onboarding] trainee record not found for', user.email, '— redirecting anyway');
      window.location.href = '/';
      return;
    }
    setIsSaving(true);
    try {
      await base44.entities.Trainee.update(trainee.id, { onboarding_status: 'completed' });
      window.location.href = '/';
    } catch (err) {
      console.error('[Onboarding] Failed to save completion:', err);
      toast.error('שגיאה בשמירה — נסה שנית');
      setIsSaving(false);
    }
  };

  const completeOnboarding = async () => {
    trackEvent({
      event_type: 'completed',
      step_id: currentStep?.id,
      step_index: stepIndex,
      completion_percent: 100,
      first_successful_action: firstSuccessfulAction,
      skipped_steps: skippedSteps,
    });
    await finishOnboarding();
  };

  const handleActionComplete = (step) => {
    const nextCompleted = [...new Set([...completedSteps, step.id])];
    setCompletedSteps(nextCompleted);
    if (!firstSuccessfulAction) setFirstSuccessfulAction(step.id);
    trackEvent({
      event_type: 'action_completed',
      step_id: step.id,
      step_index: stepIndex,
      first_successful_action: firstSuccessfulAction || step.id,
    });
    setShowSuccess(true);
    setTimeout(() => {
      trackEvent({ event_type: 'success_shown', step_id: step.id, step_index: stepIndex });
    }, 250);
  };

  const handleNext = () => {
    if (stepIndex >= steps.length - 1) {
      completeOnboarding();
      return;
    }
    setShowSuccess(false);
    setStepIndex(stepIndex + 1);
  };

  const handleSkip = async () => {
    const remainingSteps = steps.slice(stepIndex).map(step => step.id);
    setSkippedSteps(remainingSteps);
    trackEvent({
      event_type: 'skipped',
      step_id: currentStep?.id,
      step_index: stepIndex,
      skipped_steps: remainingSteps,
      quit_step: currentStep?.id,
      confusion_signal: stepIndex < 2,
    });
    await finishOnboarding();
  };

  return (
    <InteractiveOnboarding
      roleType={roleType}
      currentIndex={stepIndex}
      completedSteps={completedSteps}
      showSuccess={showSuccess}
      onActionComplete={handleActionComplete}
      onNext={isSaving ? undefined : handleNext}
      onSkip={isSaving ? undefined : handleSkip}
      isSaving={isSaving}
    />
  );
}