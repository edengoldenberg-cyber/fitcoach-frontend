import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Copy, CheckCircle, RefreshCw } from 'lucide-react';

function readStorageSafe(storage, key) {
  try {
    return { value: storage.getItem(key), error: null };
  } catch (e) {
    return { value: null, error: e.message };
  }
}

function writeStorageSafe(storage, key, val) {
  try {
    storage.setItem(key, val);
    const readBack = storage.getItem(key);
    return { ok: readBack === val, error: null };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

export default function LoginDiagnosticScreen() {
  const [report, setReport] = useState(null);
  const [copied, setCopied] = useState(false);
  const [autoFixResult, setAutoFixResult] = useState(null);
  const [fixing, setFixing] = useState(false);
  const [storageCheck, setStorageCheck] = useState(null);

  useEffect(() => {
    collectDiagnostics();
  }, []);

  const collectDiagnostics = async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const tokenParam = urlParams.get('token');
    const returnUrl = urlParams.get('returnUrl') || urlParams.get('next');

    // Read both storages
    const lsRead = readStorageSafe(localStorage, 'pending_access_token');
    const ssRead = readStorageSafe(sessionStorage, 'pending_access_token');
    const pendingTokenLS = lsRead.value;
    const pendingTokenSS = ssRead.value;
    const pendingToken = pendingTokenLS || pendingTokenSS;

    // Auth
    let authUser = null;
    let authError = null;
    try {
      authUser = await base44.auth.me();
    } catch (e) {
      authError = e.message;
    }

    // Trainee lookups
    let traineeByUserId = null;
    let traineeByEmail = null;
    let traineeByUserIdError = null;
    let traineeByEmailError = null;
    let duplicateCount = 0;

    if (authUser?.id) {
      try {
        const results = await base44.entities.Trainee.filter({ user_id: authUser.id });
        duplicateCount = results.length;
        traineeByUserId = results[0] || null;
      } catch (e) { traineeByUserIdError = e.message; }
    }

    if (authUser?.email && !traineeByUserId) {
      try {
        const normalizedEmail = authUser.email.toLowerCase().trim();
        const results = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
        traineeByEmail = results[0] || null;
      } catch (e) { traineeByEmailError = e.message; }
    }

    // Verdicts
    const googleAuthWorks = !!authUser;
    const tokenStorageWorks = !!(pendingTokenLS || pendingTokenSS);

    // Failure reason
    let failureReason = 'UNKNOWN';
    if (!authUser && !pendingToken) failureReason = 'NO_AUTH_SESSION_AND_NO_SAVED_TOKEN';
    else if (!authUser && pendingToken) failureReason = 'TOKEN_SAVED_BUT_GOOGLE_AUTH_FAILED';
    else if (!authUser) failureReason = 'NO_AUTH_SESSION';
    else if (!authUser.email) failureReason = 'AUTH_EMAIL_MISSING';
    else if (!traineeByUserId && !traineeByEmail) failureReason = 'TRAINEE_NOT_FOUND_BY_USER_ID_OR_EMAIL';
    else if (!traineeByUserId && traineeByEmail?.status === 'deleted') failureReason = 'TRAINEE_INACTIVE';
    else if (!traineeByUserId && traineeByEmail) failureReason = 'TRAINEE_FOUND_BY_EMAIL_NEEDS_LINK';
    else if (duplicateCount > 1) failureReason = 'DUPLICATE_TRAINEES_FOUND';
    else if (authUser && !traineeByUserId) failureReason = 'TRAINEE_NOT_FOUND_BY_USER_ID';

    const data = {
      timestamp: new Date().toISOString(),
      // VERDICTS
      verdicts: {
        GOOGLE_AUTH_SESSION_WORKS: googleAuthWorks,
        TOKEN_STORAGE_WORKS: tokenStorageWorks,
        TOKEN_IN_LOCALSTORAGE: !!pendingTokenLS,
        TOKEN_IN_SESSIONSTORAGE: !!pendingTokenSS,
        DIAGNOSTIC_UI_UPDATED: true,
      },
      // 1. Auth
      auth: {
        isLoggedIn: !!authUser,
        userId: authUser?.id || null,
        email: authUser?.email || null,
        fullName: authUser?.full_name || null,
        role: authUser?.role || null,
        error: authError,
      },
      // 2. Token Storage
      token: {
        tokenParamInUrl: !!tokenParam,
        tokenValueMasked: tokenParam ? tokenParam.substring(0, 4) + '****' : null,
        pendingTokenInLocalStorage: !!pendingTokenLS,
        pendingLocalTokenMasked: pendingTokenLS ? pendingTokenLS.substring(0, 6) + '****' : null,
        localStorageReadError: lsRead.error,
        pendingTokenInSessionStorage: !!pendingTokenSS,
        pendingSessionTokenMasked: pendingTokenSS ? pendingTokenSS.substring(0, 6) + '****' : null,
        sessionStorageReadError: ssRead.error,
      },
      // 3. URL
      url: {
        currentPath: window.location.pathname,
        fullUrl: window.location.href,
        allParams: Object.fromEntries(urlParams.entries()),
      },
      // 4. Trainee
      trainee: {
        lookupByUserIdInput: authUser?.id || 'N/A',
        lookupByEmailInput: authUser?.email || 'N/A',
        foundByUserId: !!traineeByUserId,
        foundByEmail: !!traineeByEmail,
        traineeId: traineeByUserId?.id || traineeByEmail?.id || null,
        traineeStatus: traineeByUserId?.status || traineeByEmail?.status || null,
        traineeUserId: traineeByUserId?.user_id || traineeByEmail?.user_id || null,
        traineeEmail: traineeByUserId?.user_email || traineeByEmail?.user_email || null,
        coachEmail: traineeByUserId?.coach_email || traineeByEmail?.coach_email || null,
        duplicateCount,
        lookupByUserIdError: traineeByUserIdError,
        lookupByEmailError: traineeByEmailError,
      },
      // 5. Failure
      failureReason,
      canAutoFix: !!(authUser && traineeByEmail && !traineeByUserId),
      traineeForFix: traineeByEmail,
    };

    console.log('[LoginDiagnostic] RUNTIME REPORT:', JSON.stringify(data, null, 2));
    setReport(data);
  };

  const handleStorageCheck = () => {
    const testKey = 'pending_access_token';
    const lsResult = readStorageSafe(localStorage, testKey);
    const ssResult = readStorageSafe(sessionStorage, testKey);

    // Also write test
    const lsWrite = writeStorageSafe(localStorage, '__diag_test__', 'ok');
    const ssWrite = writeStorageSafe(sessionStorage, '__diag_test__', 'ok');

    setStorageCheck({
      localStorage: {
        canWrite: lsWrite.ok,
        writeError: lsWrite.error,
        pendingToken: lsResult.value ? lsResult.value.substring(0, 6) + '****' : null,
        readError: lsResult.error,
      },
      sessionStorage: {
        canWrite: ssWrite.ok,
        writeError: ssWrite.error,
        pendingToken: ssResult.value ? ssResult.value.substring(0, 6) + '****' : null,
        readError: ssResult.error,
      },
    });
  };

  const handleAutoFix = async () => {
    if (!report?.canAutoFix || !report.traineeForFix) return;
    setFixing(true);
    try {
      const t = report.traineeForFix;
      const updates = { user_id: report.auth.userId, status: 'active' };
      if (t.deleted_at) updates.deleted_at = null;
      await base44.entities.Trainee.update(t.id, updates);
      setAutoFixResult('✅ תוקן! מפנה לדשבורד...');
      setTimeout(() => window.location.href = '/', 1500);
    } catch (e) {
      setAutoFixResult('❌ תיקון נכשל: ' + e.message);
    }
    setFixing(false);
  };

  const handleCopy = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const renderValue = (val) => {
    if (val === null || val === undefined) return <span className="text-slate-400">null</span>;
    if (val === true) return <span className="text-green-600 font-bold">✅ כן</span>;
    if (val === false) return <span className="text-red-500 font-bold">❌ לא</span>;
    return <span className="text-slate-800 font-mono text-xs break-all">{String(val)}</span>;
  };

  const Section = ({ title, data }) => (
    <div className="mb-3">
      <div className="font-bold text-slate-700 text-sm mb-1 border-b pb-1">{title}</div>
      <div className="space-y-0.5">
        {Object.entries(data || {}).map(([k, v]) => (
          typeof v === 'object' && v !== null && !Array.isArray(v) ? null :
          <div key={k} className="flex justify-between items-start gap-2 text-xs">
            <span className="text-slate-500 shrink-0">{k}:</span>
            <span className="text-right max-w-[60%]">{renderValue(v)}</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4" dir="rtl">
      <div className="max-w-md mx-auto space-y-4">

        {/* Header */}
        <Card className="p-6 text-center border-2 border-red-300">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center bg-red-500">
            <User className="w-9 h-9 text-white" />
          </div>
          <h2 className="text-xl font-bold text-red-700 mb-2">שגיאת התחברות</h2>
          <p className="text-slate-600 text-sm">
            {report ? <span className="font-mono font-bold text-red-800">{report.failureReason}</span> : 'אוסף נתוני דיאגנוסטיקה...'}
          </p>
        </Card>

        {/* VERDICTS */}
        {report && (
          <Card className="p-4 border-2 border-slate-700 bg-slate-900 text-white">
            <div className="font-bold text-yellow-400 text-sm mb-2">⚡ VERDICT</div>
            {Object.entries(report.verdicts).map(([k, v]) => (
              <div key={k} className="flex justify-between text-xs font-mono py-0.5">
                <span className="text-slate-300">{k}</span>
                <span className={v ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                  {v ? '✅ WORKS' : '❌ FAIL'}
                </span>
              </div>
            ))}
          </Card>
        )}

        {/* Storage Check Button */}
        <Button
          onClick={handleStorageCheck}
          variant="outline"
          className="w-full text-sm border-blue-400 text-blue-700"
        >
          🔍 בדוק אחסון טוקן (localStorage + sessionStorage)
        </Button>

        {storageCheck && (
          <Card className="p-4 border-2 border-blue-300 bg-blue-50 text-xs font-mono space-y-2">
            <div className="font-bold text-blue-800 text-sm">תוצאות בדיקת אחסון:</div>
            <div className="space-y-1">
              <div className="font-bold text-slate-700">localStorage:</div>
              <div>canWrite: {storageCheck.localStorage.canWrite ? '✅' : '❌'}</div>
              <div>writeError: {storageCheck.localStorage.writeError || 'none'}</div>
              <div>pending_access_token: {storageCheck.localStorage.pendingToken || 'null'}</div>
              <div>readError: {storageCheck.localStorage.readError || 'none'}</div>
            </div>
            <div className="space-y-1 mt-2">
              <div className="font-bold text-slate-700">sessionStorage:</div>
              <div>canWrite: {storageCheck.sessionStorage.canWrite ? '✅' : '❌'}</div>
              <div>writeError: {storageCheck.sessionStorage.writeError || 'none'}</div>
              <div>pending_access_token: {storageCheck.sessionStorage.pendingToken || 'null'}</div>
              <div>readError: {storageCheck.sessionStorage.readError || 'none'}</div>
            </div>
          </Card>
        )}

        {/* Auto-fix */}
        {report?.canAutoFix && !autoFixResult && (
          <Card className="p-4 border-2 border-green-300 bg-green-50">
            <p className="text-sm font-bold text-green-800 mb-2">✅ תיקון אוטומטי זמין</p>
            <p className="text-xs text-green-700 mb-3">נמצא מתאמן עם האימייל שלך אך ללא user_id.</p>
            <Button onClick={handleAutoFix} disabled={fixing} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm">
              {fixing ? 'מתקן...' : '🔧 תקן וכנס לדשבורד'}
            </Button>
          </Card>
        )}

        {autoFixResult && (
          <Card className="p-4 text-center border-2 border-green-200">
            <p className="font-bold text-green-700">{autoFixResult}</p>
          </Card>
        )}

        {/* Diagnostic Report */}
        {report && (
          <Card className="p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-slate-800 text-sm">🔍 דוח דיאגנוסטיקה</h3>
              <Button size="sm" variant="outline" onClick={handleCopy} className="text-xs gap-1 h-7">
                {copied ? <CheckCircle className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                {copied ? 'הועתק!' : 'העתק'}
              </Button>
            </div>
            <Section title="1. Auth Session" data={report.auth} />
            <Section title="2. Token Storage" data={report.token} />
            <Section title="3. URL" data={report.url} />
            <Section title="4. Trainee Lookup" data={report.trainee} />
            <div className="mt-2 p-2 rounded bg-red-50 border border-red-200">
              <div className="text-xs font-bold text-red-700">5. סיבת הכשל:</div>
              <div className="font-mono text-sm font-bold text-red-900 mt-1">{report.failureReason}</div>
            </div>
          </Card>
        )}

        {/* Actions */}
        <div className="space-y-2">
          <Button onClick={() => base44.auth.logout(window.location.origin)} className="w-full bg-red-600 hover:bg-red-700 text-white">
            התנתק והתחבר מחדש
          </Button>
          <Button variant="outline" onClick={collectDiagnostics} className="w-full gap-2">
            <RefreshCw className="w-4 h-4" /> רענן דיאגנוסטיקה
          </Button>
        </div>

      </div>
    </div>
  );
}