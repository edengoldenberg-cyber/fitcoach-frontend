import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import BackfillUserIds from '../components/coach/BackfillUserIds';
import GlobalUserIdFixer from '../components/coach/GlobalUserIdFixer';
import ImportFoodUnits from '../components/coach/ImportFoodUnits';
import ImportProductOverrides from '../components/coach/ImportProductOverrides';
import TraineeInviteManager from '../components/coach/TraineeInviteManager';

export default function ManageTrainees() {
  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  // Detect if this user is a coach (even when they also have admin role).
  // Coaches should use /TraineeManagement; this page is for system-only admins.
  const { data: coachSettings, isLoading: coachLoading } = useQuery({
    queryKey: ['coachSettingsForRedirect', user?.email],
    queryFn: () => base44.entities.CoachSettings.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  // While loading, render nothing to avoid flash
  if (userLoading || coachLoading) return null;

  // Non-admins and coaches with a CoachSettings record → correct trainee management page
  const isCoach = Array.isArray(coachSettings) && coachSettings.length > 0;
  if (user?.role !== 'admin' || isCoach) {
    return <Navigate to="/TraineeManagement" replace />;
  }

  const { data: settings } = useQuery({
    queryKey: ['systemSettings'],
    queryFn: async () => {
      const all = await base44.entities.SystemSettings.list();
      const map = {};
      all.forEach(s => {
        map[s.key] = s.value;
      });
      return map;
    }
  });

  const handleToggleNewUnits = async () => {
    const current = settings?.useNewUnits === 'true';
    const settingRecord = await base44.entities.SystemSettings.filter({ key: 'useNewUnits' });
    
    if (settingRecord.length > 0) {
      await base44.entities.SystemSettings.update(settingRecord[0].id, {
        value: (!current).toString()
      });
    } else {
      await base44.entities.SystemSettings.create({
        key: 'useNewUnits',
        value: (!current).toString(),
        description: 'Enable new units system'
      });
    }
    
    window.location.reload();
  };

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-white p-6" dir="rtl">
        <Card className="max-w-md mx-auto p-6">
          <p className="text-center text-slate-600">דף זה מיועד למנהלי מערכת בלבד</p>
        </Card>
      </div>
    );
  }

  const useNewUnits = settings?.useNewUnits === 'true';

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">🛠️ ניהול מערכת</h1>
          <p className="text-sm text-slate-600">כלים לתחזוקה ושיפור המערכת</p>
        </div>

        {/* Feature Flags */}
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">⚙️ Feature Flags</h3>
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="font-medium">מערכת יחידות מדידה חדשה</p>
              <p className="text-xs text-slate-500">
                {useNewUnits ? '✅ פעיל - משתמש ב-FoodUnit + ProductUnitOverride' : '❌ כבוי - משתמש ב-legacy portions'}
              </p>
            </div>
            <button
              onClick={handleToggleNewUnits}
              className={`px-4 py-2 rounded-lg font-medium text-sm ${
                useNewUnits 
                  ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {useNewUnits ? 'כבה' : 'הפעל'}
            </button>
          </div>
        </Card>

        <TraineeInviteManager />
        <BackfillUserIds />
        <GlobalUserIdFixer />
        <ImportFoodUnits />
        <ImportProductOverrides />
      </div>
    </div>
  );
}