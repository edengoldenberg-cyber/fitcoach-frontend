import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, CheckCircle2, Copy, Check } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';

const maskToken = (t) => {
  if (!t) return 'N/A';
  return t.slice(0, 6) + '••••••••••••••••' + t.slice(-4);
};

const Step = ({ label, value, ok }) => (
  <div className="flex items-start gap-2 py-1 border-b border-slate-700 last:border-0">
    <span className="text-lg leading-none mt-0.5">{ok === true ? '✅' : ok === false ? '❌' : '⚪'}</span>
    <div className="flex-1 min-w-0">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-white font-mono break-all">{value ?? '—'}</div>
    </div>
  </div>
);

export default function MagicLoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const isDebug = searchParams.get('debug') === 'true';

  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Debug state — each step tracked individually
  const [dbg, setDbg] = useState({
    tokenReceived: null,
    tokenMasked: null,
    linkFound: null,
    linkUsed: null,
    linkExpired: null,
    userFound: null,
    userId: null,
    userEmail: null,
    traineeLookupMethod: null,
    traineeQueryInput: null,
    traineeFound: null,
    traineeId: null,
    traineeStatus: null,
    traineeUserId: null,
    finalRoute: null,
    failureReason: null,
  });

  const addDbg = (updates) => setDbg(prev => ({ ...prev, ...updates }));

  useEffect(() => {
    validateAndLogin();
  }, [token]);

  const validateAndLogin = async () => {
    try {
      if (!token) {
        addDbg({ tokenReceived: false, failureReason: 'אין token ב-URL' });
        setError('לא נמצא token');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
        return;
      }

      addDbg({ tokenReceived: true, tokenMasked: maskToken(token) });

      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      console.log('[MAGIC_LOGIN] 🔐 Token hash computed');

      const links = await base44.entities.LoginLink.filter({ token_hash: tokenHash });

      if (links.length === 0) {
        addDbg({ linkFound: false, failureReason: 'LoginLink לא נמצא ב-DB לפי ה-hash' });
        setError('קישור לא תקין או פג תוקף');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
        return;
      }

      const link = links[0];
      addDbg({ linkFound: true });

      if (link.used_at) {
        addDbg({ linkUsed: true, failureReason: `קישור כבר שומש ב: ${link.used_at}` });
        setError('קישור זה כבר בשימוש');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
        return;
      }
      addDbg({ linkUsed: false });

      if (new Date(link.expires_at) < new Date()) {
        addDbg({ linkExpired: true, failureReason: `פג תוקף ב: ${link.expires_at}` });
        setError('קישור פג תוקף');
        setTimeout(() => base44.auth.redirectToLogin(), 2000);
        return;
      }
      addDbg({ linkExpired: false });

      // Use trainee_email from the link directly — avoids User entity permission issues
      const normalizedEmail = (link.trainee_email || '').toLowerCase().trim();
      const linkedUserId = link.trainee_user_id;
      addDbg({ userFound: true, userId: linkedUserId, userEmail: normalizedEmail });

      // Try by user_id first, then by email
      addDbg({ traineeLookupMethod: 'user_id', traineeQueryInput: linkedUserId });

      let trainees = await base44.entities.Trainee.filter({ user_id: linkedUserId });

      if (trainees.length === 0) {
        addDbg({ traineeLookupMethod: 'email (fallback)', traineeQueryInput: normalizedEmail });
        trainees = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
      }

      if (trainees.length === 0) {
        addDbg({
          traineeFound: false,
          failureReason: `Trainee לא נמצא. ניסיון: user_id=${linkedUserId} ואז email=${normalizedEmail}`
        });
        console.error('[MAGIC_LOGIN] ❌ CRITICAL: Trainee not found');
        setError('חשבון מתאמן לא נמצא - אנא צור קשר עם המאמן');
        setTimeout(() => base44.auth.redirectToLogin(), 3000);
        return;
      }

      const trainee = trainees[0];
      addDbg({
        traineeFound: true,
        traineeId: trainee.id,
        traineeStatus: trainee.status,
        traineeUserId: trainee.user_id ?? 'NULL'
      });

      if (trainee.status === 'deleted' || trainee.deleted_at) {
        console.log('[MAGIC_LOGIN] 🔄 Trainee marked deleted, auto-restoring...');
        await base44.entities.Trainee.update(trainee.id, { status: 'active', deleted_at: null, whatsapp_notifications_enabled: false });
        addDbg({ traineeStatus: 'active (restored)' });
      }

      if (!trainee.user_id && linkedUserId) {
        await base44.entities.Trainee.update(trainee.id, { user_id: linkedUserId });
        addDbg({ traineeUserId: linkedUserId + ' (auto-linked)' });
      }

      await base44.entities.LoginLink.update(link.id, { used_at: new Date().toISOString() });

      const updates = { last_login_at: new Date().toISOString() };
      if (!trainee.first_login_at) updates.first_login_at = new Date().toISOString();
      await base44.entities.Trainee.update(trainee.id, updates);

      const credentials = await base44.entities.Credentials.filter({ user_id: linkedUserId });

      if (credentials.length === 0 || !credentials[0].password_hash) {
        addDbg({ finalRoute: '→ SetPassword (אין סיסמה)' });
        console.log('[MAGIC_LOGIN] 🆕 No password set, redirecting to SetPassword');
        sessionStorage.setItem('temp_access_session', JSON.stringify({
          userId: linkedUserId,
          userEmail: normalizedEmail,
          fullName: trainee.full_name,
          linkId: link.id,
          isTemporary: false,
          timestamp: Date.now()
        }));
        toast.success(`ברוך הבא ${trainee.full_name}!`);
        setTimeout(() => navigate(createPageUrl('SetPassword')), isDebug ? 5000 : 1500);
      } else {
        addDbg({ finalRoute: '→ TraineeHome (יש סיסמה)' });
        console.log('[MAGIC_LOGIN] 🏠 Password set, redirecting to home');
        toast.success(`ברוך הבא ${trainee.full_name}!`);
        setTimeout(() => navigate(createPageUrl('TraineeHome')), isDebug ? 5000 : 1500);
      }

    } catch (err) {
      console.error('[MAGIC_LOGIN] ❌ Validation error:', err);
      addDbg({ failureReason: `Exception: ${err.message}` });
      setError(`שגיאה: ${err.message}`);
      setTimeout(() => base44.auth.redirectToLogin(), 3000);
    }
  };

  const buildReport = () => {
    const lines = [
      '=== MAGIC LOGIN DEBUG REPORT ===',
      `תאריך: ${new Date().toISOString()}`,
      '',
      `1. token received: ${dbg.tokenReceived}`,
      `2. token (masked): ${dbg.tokenMasked}`,
      `3. link found in DB: ${dbg.linkFound}`,
      `4. link already used: ${dbg.linkUsed}`,
      `5. link expired: ${dbg.linkExpired}`,
      `6. user found: ${dbg.userFound}`,
      `7. user id: ${dbg.userId}`,
      `8. user email: ${dbg.userEmail}`,
      `9. trainee lookup method: ${dbg.traineeLookupMethod}`,
      `10. trainee query input: ${dbg.traineeQueryInput}`,
      `11. trainee found: ${dbg.traineeFound}`,
      `12. trainee id: ${dbg.traineeId}`,
      `13. trainee status: ${dbg.traineeStatus}`,
      `14. trainee.user_id: ${dbg.traineeUserId}`,
      `15. final route: ${dbg.finalRoute}`,
      `16. failure reason: ${dbg.failureReason}`,
      `17. error shown: ${error || 'none'}`,
    ];
    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(buildReport()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col items-center justify-start p-4 pt-8 gap-4" dir="rtl">
      {/* Main card */}
      <Card className="p-8 text-center max-w-md w-full">
        {error ? (
          <>
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">שגיאה בהתחברות</h2>
            <p className="text-slate-600 mb-4">{error}</p>
            <p className="text-slate-500 text-sm">מעביר אותך לדף ההתחברות...</p>
          </>
        ) : (
          <>
            <Loader2 className="w-12 h-12 text-slate-400 animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-bold text-slate-800 mb-2">מתחבר...</h2>
            <p className="text-slate-600">אנא המתן</p>
          </>
        )}
      </Card>

      {/* Debug panel — only when ?debug=true */}
      {isDebug && (
        <div className="w-full max-w-md bg-slate-900 rounded-xl p-4 text-right" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-slate-600 text-slate-300 hover:bg-slate-700 gap-1"
              onClick={handleCopy}
            >
              {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'הועתק!' : 'העתק דוח דיבאג'}
            </Button>
            <h3 className="text-sm font-bold text-yellow-400">🐛 DEBUG PANEL</h3>
          </div>

          <div className="space-y-0">
            <Step label="1. token התקבל" value={dbg.tokenReceived === null ? 'ממתין...' : String(dbg.tokenReceived)} ok={dbg.tokenReceived} />
            <Step label="2. token (masked)" value={dbg.tokenMasked} ok={dbg.tokenMasked ? true : null} />
            <Step label="3. LoginLink נמצא ב-DB" value={dbg.linkFound === null ? 'ממתין...' : String(dbg.linkFound)} ok={dbg.linkFound} />
            <Step label="4. link כבר שומש?" value={dbg.linkUsed === null ? 'ממתין...' : String(dbg.linkUsed)} ok={dbg.linkUsed === false ? true : dbg.linkUsed === true ? false : null} />
            <Step label="5. link פג תוקף?" value={dbg.linkExpired === null ? 'ממתין...' : String(dbg.linkExpired)} ok={dbg.linkExpired === false ? true : dbg.linkExpired === true ? false : null} />
            <Step label="6. user נמצא" value={dbg.userFound === null ? 'ממתין...' : String(dbg.userFound)} ok={dbg.userFound} />
            <Step label="7. user.id" value={dbg.userId} ok={dbg.userId ? true : null} />
            <Step label="8. user.email" value={dbg.userEmail} ok={dbg.userEmail ? true : null} />
            <Step label="9. שיטת חיפוש trainee" value={dbg.traineeLookupMethod} ok={dbg.traineeLookupMethod ? true : null} />
            <Step label="10. קלט החיפוש" value={dbg.traineeQueryInput} ok={dbg.traineeQueryInput ? true : null} />
            <Step label="11. trainee נמצא" value={dbg.traineeFound === null ? 'ממתין...' : String(dbg.traineeFound)} ok={dbg.traineeFound} />
            <Step label="12. trainee.id" value={dbg.traineeId} ok={dbg.traineeId ? true : null} />
            <Step label="13. trainee.status" value={dbg.traineeStatus} ok={dbg.traineeStatus && dbg.traineeStatus !== 'deleted' ? true : null} />
            <Step label="14. trainee.user_id" value={dbg.traineeUserId} ok={dbg.traineeUserId && dbg.traineeUserId !== 'NULL' ? true : false} />
            <Step label="15. ניתוב סופי" value={dbg.finalRoute} ok={dbg.finalRoute ? true : null} />
            {dbg.failureReason && (
              <div className="mt-2 p-2 bg-red-900/40 rounded text-red-300 text-xs font-mono break-all">
                ❌ {dbg.failureReason}
              </div>
            )}
          </div>
          {dbg.finalRoute && !error && (
            <div className="mt-2 text-xs text-slate-400 text-center">
              (במצב debug ממתין 5 שניות לפני מעבר)
            </div>
          )}
        </div>
      )}
    </div>
  );
}