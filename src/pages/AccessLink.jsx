import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  'http://localhost:3001';

// Calls the public invite validation endpoint (no auth needed)
async function validateInviteToken(token) {
  const res = await fetch(`${API_BASE}/api/auth/invite/${encodeURIComponent(token)}`);
  return res.json();
}

// Calls the consume endpoint (requires auth) — burns token, links user
async function consumeInviteToken(token) {
  const storedToken = localStorage.getItem('fitcoach_token') || '';
  const res = await fetch(`${API_BASE}/api/auth/invite/${encodeURIComponent(token)}/consume`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
    },
    credentials: 'include',
  });
  return res.json();
}

export default function AccessLinkPage() {
  const navigate = useNavigate();
  const urlParams  = new URLSearchParams(window.location.search);
  const token      = urlParams.get('token');

  const [status, setStatus]           = useState('validating');
  const [error, setError]             = useState('');
  const [traineeName, setTraineeName] = useState('');

  useEffect(() => { validateAndProcess(); }, []);

  const validateAndProcess = async () => {
    // ── PWA / Saved-app escape hatch ─────────────────────────────────────────
    // If the user saved the app to their iPhone home screen while on this URL,
    // the PWA will always re-open /AccessLink?token=... even after the token is
    // consumed. Check localStorage FIRST — if they already have a valid session,
    // redirect to home immediately without making any network calls.
    // This also handles: expired tokens, consumed tokens, invalid tokens —
    // all cases where an authenticated user should just go home.
    const localToken = localStorage.getItem('fitcoach_token');
    if (localToken) {
      // Fast path: trust the stored JWT and go home.
      // The home page's own auth guard will validate it and redirect to login
      // if it has somehow expired, so we don't need to verify it here.
      window.location.replace('/');
      return;
    }

    // ── No local session — process the invite token normally ─────────────────
    if (!token) {
      // No token in URL — check for cross-origin redirect recovery
      const saved = localStorage.getItem('pending_access_token');
      if (saved) {
        localStorage.removeItem('pending_access_token');
        window.location.replace(`/AccessLink?token=${saved}`);
        return;
      }
      setStatus('invalid');
      setError('חסר קישור התחברות תקין');
      return;
    }

    // Always clear the saved token now that we have it in the URL
    localStorage.removeItem('pending_access_token');

    try {
      // Step 1: PUBLIC validation — no auth required
      const validation = await validateInviteToken(token);
      if (!validation.ok) {
        // Token is invalid/consumed — do one more auth check in case
        // localStorage was empty but the user has a session via cookie
        let existingUser = null;
        try { existingUser = await base44.auth.me(); } catch { /* not authenticated */ }
        if (existingUser) {
          window.location.replace('/');
          return;
        }
        setStatus('invalid');
        setError('הקישור לא תקין או פג תוקף. נא לבקש קישור חדש ממאמן.');
        return;
      }
      setTraineeName(validation.trainee_name || '');

      // Step 2: Check if user is already authenticated
      let user = null;
      try { user = await base44.auth.me(); } catch { /* not authenticated */ }

      if (!user) {
        // Step 2a: Try auto-login via the invite token (new trainees have no password yet).
        try {
          const loginRes = await fetch(`${API_BASE}/api/auth/invite/${encodeURIComponent(token)}/login`, {
            method: 'POST',
            credentials: 'include',
          });
          const loginData = await loginRes.json();
          if (loginData.ok && loginData.access_token) {
            base44.auth.setToken(loginData.access_token, true);
            setTraineeName(loginData.trainee_name || traineeName);
            setStatus('valid');
            setTimeout(() => {
              if (!loginData.has_password) {
                navigate('/SetPassword', { replace: true });
              } else {
                navigate('/', { replace: true });
              }
            }, 1500);
            return;
          }
        } catch { /* network error — fall through */ }

        // Step 2b: Trainee already has a password — redirect to standard login
        try { localStorage.setItem('pending_access_token', token); } catch { /* */ }
        try { sessionStorage.setItem('pending_access_token', token); } catch { /* */ }
        base44.auth.redirectToLogin(window.location.href);
        return;
      }

      // Step 3: User is already authenticated — consume the token
      setStatus('consuming');
      const consumeRes = await consumeInviteToken(token);
      if (!consumeRes.ok) {
        console.warn('[AccessLink] consume failed:', consumeRes.error);
      }

      setStatus('valid');
      setTimeout(() => {
        if (consumeRes.has_password === false) {
          navigate('/SetPassword', { replace: true });
        } else {
          navigate('/', { replace: true });
        }
      }, 1500);

    } catch (err) {
      console.error('[AccessLink] error:', err);
      setStatus('invalid');
      setError('שגיאה באימות הקישור: ' + err.message);
    }
  };

  if (status === 'validating' || status === 'consuming') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md w-full">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">מאמת קישור...</h2>
          <p className="text-slate-600">רק רגע</p>
        </Card>
      </div>
    );
  }

  if (status === 'valid') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md w-full">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">ברוך הבא{traineeName ? ` ${traineeName}` : ''}!</h2>
          <p className="text-slate-500 text-sm">מעביר אותך...</p>
        </Card>
      </div>
    );
  }

  // ── Invalid / error state ─────────────────────────────────────────────────
  const handleGoHome = async () => {
    // Always try to enter the app — if not authenticated the home page will
    // redirect to login. This is the escape hatch for PWA users who see this
    // screen after their saved app reopens a consumed invite link.
    window.location.replace('/');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="p-8 text-center max-w-md w-full">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">קישור ההזמנה לא תקין</h2>
        <p className="text-slate-600 mb-4">{error}</p>
        <p className="text-sm text-slate-500 mb-6">
          ייתכן שהקישור כבר שומש. אם כבר יצרת חשבון, לחץ/י על הכפתור למטה.
        </p>

        {/* Primary CTA — always visible, always navigates to home */}
        <Button
          onClick={handleGoHome}
          className="w-full mb-3"
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
        >
          🏠 כניסה לאפליקציה
        </Button>

        <p className="text-xs text-slate-400">
          אם עדיין לא נרשמת, בקש/י קישור חדש מהמאמן שלך.
        </p>
      </Card>
    </div>
  );
}
