import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

/**
 * Route Guard - enforces module visibility permissions
 * 
 * Usage:
 * <RouteGuard moduleName="workouts" trainee={trainee}>
 *   <YourComponent />
 * </RouteGuard>
 */
export default function RouteGuard({ moduleName, trainee, children, redirectTo = 'TraineeHome' }) {
  const navigate = useNavigate();

  useEffect(() => {
    // Wait for trainee to load
    if (!trainee) return;

    // Check if module is visible
    const visibleModules = trainee.visible_modules || {};
    const isModuleVisible = visibleModules[moduleName] !== false;

    if (!isModuleVisible) {
      toast.error('אין לך גישה למסך זה. פנה/י למאמן.');
      navigate(createPageUrl(redirectTo), { replace: true });
    }
  }, [trainee, moduleName, navigate, redirectTo]);

  // Don't render until we verify permissions
  if (!trainee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" dir="rtl">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-600">טוען הרשאות...</p>
        </div>
      </div>
    );
  }

  const visibleModules = trainee.visible_modules || {};
  const isModuleVisible = visibleModules[moduleName] !== false;

  if (!isModuleVisible) {
    return null;
  }

  return <>{children}</>;
}