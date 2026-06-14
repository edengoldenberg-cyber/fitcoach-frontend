import React, { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Key, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Shown when user opens "/" directly (no token).
 * ENTRY_MODE: DIRECT_APP_ENTRY / PWA_DIRECT_ENTRY
 */
export default function GoogleLoginScreen() {
  const navigate = useNavigate();
  const [entryMode, setEntryMode] = useState('DIRECT_APP_ENTRY');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const isStandalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
    const hasPending = !!localStorage.getItem('pending_access_token');
    let mode = 'DIRECT_APP_ENTRY';
    if (isStandalone) mode = 'PWA_DIRECT_ENTRY';
    else if (params.has('token')) mode = 'ACCESS_LINK_TOKEN';
    else if (hasPending) mode = 'PENDING_TOKEN';
    setEntryMode(mode);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)' }} dir="rtl">
      <div className="w-full max-w-sm space-y-6">

        {/* Logo / Brand */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg" style={{ background: 'linear-gradient(135deg, #79DBD6, #5BC5C0)' }}>
            <span className="text-white text-3xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">FIT COACH PRO</h1>
          <p className="text-slate-500 text-sm mt-1">מערכת אימונים ותזונה מקצועית</p>
        </div>

        {/* Login Card */}
        <Card className="p-6 shadow-md border-0 space-y-3">
          <h2 className="text-lg font-bold text-slate-800 text-center mb-4">כניסה למערכת</h2>

          {/* Primary: email + password */}
          <Button
            onClick={() => navigate('/LoginWithPassword')}
            className="w-full h-12 text-base font-semibold text-white rounded-xl gap-3"
            style={{ backgroundColor: '#79DBD6' }}
          >
            <Lock className="w-5 h-5" />
            כניסה עם אימייל וסיסמה
          </Button>

          <div className="relative my-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-400">כניסה ראשונה?</span>
            </div>
          </div>

          {/* Secondary: access code for first-time login */}
          <Button
            variant="outline"
            onClick={() => navigate('/AccessCodeLogin')}
            className="w-full h-11 gap-3"
          >
            <Key className="w-5 h-5 text-teal-600" />
            כניסה עם קוד גישה מהמאמן
          </Button>

          <p className="text-xs text-slate-400 text-center pt-2">
            לא הוגדרה סיסמה עדיין? בקש/י קוד גישה מהמאמן שלך
          </p>
        </Card>

        {import.meta.env.DEV && (
          <div className="text-center">
            <span className="text-xs text-slate-300 font-mono">ENTRY_MODE: {entryMode}</span>
          </div>
        )}

      </div>
    </div>
  );
}