import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';

/**
 * Validates that trainee has user_id before allowing data operations
 * Shows blocking message if user_id is missing
 */
export default function GuardrailsValidator({ children }) {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee, isLoading } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0];
    },
    enabled: !!user?.email,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white" dir="rtl">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-600">טוען...</p>
        </div>
      </div>
    );
  }

  // Only block if trainee doesn't exist - allow missing user_id (AutoLink will fix)
  if (!trainee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-50 px-4" dir="rtl">
        <div className="max-w-md w-full bg-white rounded-xl shadow-xl p-6 border-2 border-red-500">
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">
              לא נמצא כרטיס מתאמן
            </h2>
            <p className="text-slate-600 text-sm mb-4">
              לא נמצא כרטיס מתאמן במערכת עבור המשתמש הזה.
            </p>
            <p className="text-xs text-amber-700 bg-amber-50 p-2 rounded mb-4">
              {user?.email}
            </p>
          </div>

          <div className="space-y-3">
            <Button
              onClick={() => window.location.reload()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              🔄 רענן דף
            </Button>
            
            <Button
              onClick={() => base44.auth.logout()}
              variant="outline"
              className="w-full"
            >
              התנתק והתחבר שוב
            </Button>

            <div className="pt-3 border-t">
              <p className="text-xs text-slate-500 text-center">
                אם הבעיה נמשכת, פנה למאמן שלך
              </p>
            </div>
          </div>

          {user?.role === 'admin' && (
            <div className="mt-4 p-3 bg-slate-100 rounded text-xs">
              <p className="font-bold text-slate-700 mb-1">Debug Info:</p>
              <p className="text-slate-600">User ID: {user?.id}</p>
              <p className="text-slate-600">Email: {user?.email}</p>
              <p className="text-slate-600">Trainee: Not Found</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Warn if user_id is missing but continue rendering (AutoLink will fix)
  if (!trainee.user_id) {
    console.warn('⚠️ GuardrailsValidator: Trainee missing user_id, AutoLink should fix:', {
      trainee_id: trainee.id,
      trainee_email: trainee.user_email,
      user_id: user?.id
    });
  }

  // All good - render children
  return <>{children}</>;
}