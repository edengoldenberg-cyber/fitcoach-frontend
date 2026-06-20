import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
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

  const [status, setStatus]         = useState('validating');
  const [error, setError]           = useState('');
  const [traineeName, setTraineeName] = useState('');

  useEffect(() => { validateAndProcess(); }, []);

  const validateAndProcess = async () => {
    // If no token in URL, try to recover from localStorage (survives cross-origin redirects)
    if (!token) {
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
        setStatus('invalid');
        setError('הקישור לא תקין או פג תוקף. נא לבקש קישור חדש ממאמן.');
        return;
      }
      setTraineeName(validation.trainee_name || '');

      // Step 2: Check if user is authenticated
      let user = null;
      try { user = await base44.auth.me(); } catch { /* not authenticated */ }

      if (!user) {
        // Save token so we can recover it after the login redirect
        try { localStorage.setItem('pending_access_token', token); } catch { /* */ }
        try { sessionStorage.setItem('pending_access_token', token); } catch { /* */ }

        // Redirect to login — pass current URL as ?from= so LoginWithPassword returns here
        base44.auth.redirectToLogin(window.location.href);
        return;
      }

      // Step 3: User is authenticated — consume the token (burns it, links user_id)
      setStatus('consuming');
      const consumeRes = await consumeInviteToken(token);
      if (!consumeRes.ok) {
        // Token was already consumed (user re-opened the link) — treat as already joined
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="p-8 text-center max-w-md w-full">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">הקישור לא תקין</h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <p className="text-sm text-slate-500">💬 פנה למאמן שלך לקבלת קישור חדש</p>
      </Card>
    </div>
  );
}
