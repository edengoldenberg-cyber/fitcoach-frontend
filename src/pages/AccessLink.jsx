import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, Copy, CheckCircle } from 'lucide-react';

export default function AccessLinkPage() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  const isDebugMode = urlParams.get('debug') === 'true';

  const [status, setStatus] = useState('validating');
  const [error, setError] = useState('');
  const [traineeName, setTraineeName] = useState('');
  const [saveProof, setSaveProof] = useState(null);
  const [proofCopied, setProofCopied] = useState(false);
  const [pendingGoogleRedirect, setPendingGoogleRedirect] = useState(false);

  useEffect(() => {
    validateAndProcess();
  }, []);

  const validateAndProcess = async () => {
    if (!token) {
      // Try to recover from localStorage (survives cross-origin redirects)
      const savedToken = localStorage.getItem('pending_access_token');
      if (savedToken) {
        localStorage.removeItem('pending_access_token');
        window.location.replace(`/AccessLink?token=${savedToken}`);
        return;
      }
      setStatus('invalid');
      setError('חסר קישור התחברות תקין');
      return;
    }

    // Clean up localStorage now that we have the token in URL
    localStorage.removeItem('pending_access_token');

    try {
      // Step 1: Find trainee by invite_token (simple short token from WhatsApp)
      const traineesByToken = await base44.entities.Trainee.filter({ invite_token: token });

      let trainee = null;

      if (traineesByToken.length > 0) {
        trainee = traineesByToken[0];
      } else {
        // Fallback: hash-based LoginLink lookup (deprecated path)
        const encoder = new TextEncoder();
        const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(token));
        const tokenHash = Array.from(new Uint8Array(hashBuffer))
          .map(b => b.toString(16).padStart(2, '0')).join('');

        const links = await base44.entities.LoginLink.filter({ token_hash: tokenHash });
        if (import.meta.env.DEV) console.log('[AccessLink] LoginLink fallback:', links.length);

        setStatus('invalid');
        setError('הקישור לא תקין או פג תוקף. נא לבקש קישור חדש מהמאמן.');
        return;
      }

      setTraineeName(trainee.full_name || '');

      // Step 2: Check if user is authenticated
      let user = null;
      try {
        user = await base44.auth.me();
      } catch (_) {
        // not authenticated
      }

      if (!user) {
        // Save token to BOTH storages — belt and suspenders

        // Write to both storages
        let lsOk = false, ssOk = false, lsErr = null, ssErr = null;
        try { localStorage.setItem('pending_access_token', token); lsOk = localStorage.getItem('pending_access_token') === token; }
        catch (e) { lsErr = e.message; }
        try { sessionStorage.setItem('pending_access_token', token); ssOk = sessionStorage.getItem('pending_access_token') === token; }
        catch (e) { ssErr = e.message; }

        const nextUrl = window.location.origin + '/';
        const proof = {
          timestamp: new Date().toISOString(),
          tokenReceived: !!token,
          tokenMasked: token ? token.substring(0, 6) + '****' : null,
          localStorageWriteOk: lsOk,
          localStorageError: lsErr,
          sessionStorageWriteOk: ssOk,
          sessionStorageError: ssErr,
          nextUrlUsed: nextUrl,
          redirectTarget: 'Google OAuth via base44.auth.redirectToLogin',
          debugMode: isDebugMode,
        };
        if (import.meta.env.DEV) console.log('[AccessLink] TOKEN SAVE PROOF:', JSON.stringify(proof, null, 2));
        setSaveProof(proof);

        if (isDebugMode) {
          // Pause before redirect — user must click button
          setPendingGoogleRedirect(true);
          setStatus('debug_pause');
          return;
        }

        // Normal: redirect immediately
        base44.auth.redirectToLogin(nextUrl);
        return;
      }

      // Step 3: Burn the token immediately — before any redirect or further work.
      // This ensures the invite link cannot be replayed even if the browser
      // closes before the rest of the updates complete.
      await base44.entities.Trainee.update(trainee.id, { invite_token: null });

      // Step 3b: Apply remaining updates now that the token is invalidated.
      const updates = {
        last_login_at: new Date().toISOString(),
        invite_status: 'joined',
      };
      if (!trainee.user_id) {
        updates.user_id = user.id;
      }
      if (!trainee.first_login_at) {
        updates.first_login_at = new Date().toISOString();
      }
      await base44.entities.Trainee.update(trainee.id, updates);

      // Step 4: Check if password already set
      const credentials = await base44.entities.Credentials.filter({ user_id: user.id });
      const hasPassword = credentials.length > 0 && credentials[0].password_hash;

      sessionStorage.setItem('temp_access_session', JSON.stringify({
        userId: user.id,
        userEmail: user.email,
        fullName: trainee.full_name || user.full_name,
        isTemporary: false,
        timestamp: Date.now()
      }));

      setStatus('valid');

      setTimeout(() => {
        if (hasPassword) {
          navigate('/', { replace: true });
        } else {
          navigate('/SetPassword', { replace: true });
        }
      }, 1500);

    } catch (err) {
      console.error('[AccessLink] ❌ Error:', err);
      setStatus('invalid');
      setError('שגיאה באימות הקישור: ' + err.message);
    }
  };

  const handleCopyProof = () => {
    if (!saveProof) return;
    navigator.clipboard.writeText(JSON.stringify(saveProof, null, 2)).then(() => {
      setProofCopied(true);
      setTimeout(() => setProofCopied(false), 2000);
    });
  };

  const ProofBlock = () => {
    if (!saveProof) return null;
    return (
      <div className="mt-4 p-3 rounded-lg bg-slate-900 text-xs font-mono text-left space-y-1 border border-slate-600">
        <div className="text-yellow-400 font-bold mb-2">🔐 TOKEN SAVE PROOF</div>
        <div className={saveProof.tokenReceived ? 'text-green-400' : 'text-red-400'}>token received: {saveProof.tokenReceived ? '✅ YES' : '❌ NO'}</div>
        <div className="text-slate-300">token: {saveProof.tokenMasked}</div>
        <div className={saveProof.localStorageWriteOk ? 'text-green-400' : 'text-red-400'}>localStorage write+read: {saveProof.localStorageWriteOk ? '✅ OK' : '❌ FAIL'} {saveProof.localStorageError ? '→ ' + saveProof.localStorageError : ''}</div>
        <div className={saveProof.sessionStorageWriteOk ? 'text-green-400' : 'text-red-400'}>sessionStorage write+read: {saveProof.sessionStorageWriteOk ? '✅ OK' : '❌ FAIL'} {saveProof.sessionStorageError ? '→ ' + saveProof.sessionStorageError : ''}</div>
        <div className="text-slate-400">nextUrl: {saveProof.nextUrlUsed}</div>
        <div className="text-slate-400">redirect: {saveProof.redirectTarget}</div>
        <Button size="sm" variant="outline" onClick={handleCopyProof} className="mt-2 text-xs h-7 text-white border-slate-500 gap-1">
          {proofCopied ? <><CheckCircle className="w-3 h-3 text-green-400" /> הועתק!</> : <><Copy className="w-3 h-3" /> העתק דוח AccessLink</>}
        </Button>
      </div>
    );
  };

  if (status === 'debug_pause') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 max-w-md w-full">
          <div className="text-center mb-4">
            <div className="w-12 h-12 rounded-full bg-yellow-500 flex items-center justify-center mx-auto mb-3">
              <span className="text-white text-xl">🔍</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800">DEBUG MODE</h2>
            <p className="text-slate-500 text-sm mt-1">הטוקן נשמר. לחץ להמשיך לגוגל.</p>
          </div>
          <ProofBlock />
          <Button
            onClick={() => base44.auth.redirectToLogin(window.location.origin + '/')}
            className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white"
          >
            המשך להתחברות Google →
          </Button>
        </Card>
      </div>
    );
  }

  if (status === 'validating') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md w-full">
          <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">מאמת קישור...</h2>
          <p className="text-slate-600">אנא המתן</p>
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
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          {status === 'used' ? 'הקישור כבר נוצל' :
           status === 'expired' ? 'הקישור פג תוקף' :
           'הקישור לא תקין'}
        </h2>
        <p className="text-slate-600 mb-6">{error}</p>
        <p className="text-sm text-slate-500">💬 פנה למאמן שלך לקבלת קישור חדש</p>
      </Card>
    </div>
  );
}