import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { hashPassword } from '@/utils/passwordHash';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Lock, AlertCircle, CheckCircle2, Home } from 'lucide-react';
import { toast } from 'sonner';

export default function SetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [traceLog, setTraceLog] = useState([]);
  const [tempSession, setTempSession] = useState(null);

  const addTrace = (key, value) => {
    console.log(`[SetPassword] ${key}:`, value);
    setTraceLog(prev => [...prev, { key, value: String(value) }]);
  };

  useEffect(() => {
    const sessionData = sessionStorage.getItem('temp_access_session');
    if (!sessionData) {
      addTrace('session_found', 'NO');
      // Don't redirect immediately — user might have arrived directly; show manual entry button
      return;
    }

    const session = JSON.parse(sessionData);
    const elapsed = Date.now() - session.timestamp;

    // Extend session validity to 30 minutes (was 10)
    if (elapsed > 30 * 60 * 1000) {
      addTrace('session_expired', true);
      sessionStorage.removeItem('temp_access_session');
      toast.error('הסשן פג תוקף. נסה שוב דרך הקישור.');
      navigate('/');
      return;
    }

    addTrace('session_found', 'YES');
    addTrace('session_email', session.userEmail);
    addTrace('session_user_id', session.userId);
    setTempSession(session);
  }, []);

  const handleSetPassword = async (e) => {
    e.preventDefault();

    if (newPassword !== confirmPassword) {
      toast.error('הסיסמאות לא תואמות');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('הסיסמה חייבת להיות לפחות 8 תווים');
      return;
    }

    setIsLoading(true);

    try {
      // Step 1: Resolve user identity
      let authUser = null;
      try {
        authUser = await base44.auth.me();
        addTrace('auth_user_exists', authUser ? authUser.email : 'NO');
      } catch (_) {
        addTrace('auth_user_exists', 'ERROR');
      }

      const userId = tempSession?.userId || authUser?.id;
      const userEmail = tempSession?.userEmail || authUser?.email;

      if (!userId || !userEmail) {
        addTrace('final_status', 'MISSING_USER_ID');
        toast.error('לא נמצא משתמש מחובר. נסה להיכנס מחדש דרך הקישור.');
        setIsLoading(false);
        return;
      }

      // Step 2: Save password — prefer server-side bcrypt when authenticated
      const isAuthenticatedAsThisUser = authUser?.id === userId;

      if (isAuthenticatedAsThisUser) {
        // User is authenticated: use hashAndStorePassword (bcrypt, server-side)
        addTrace('password_path', 'bcrypt_backend');
        const result = await base44.functions.invoke('hashAndStorePassword', {
          userId,
          password: newPassword,
        });
        if (!result?.ok) {
          throw new Error('שגיאה בשמירת הסיסמה בשרת');
        }
      } else {
        // Not authenticated (e.g. AccessCode flow): fall back to client-side SHA-256.
        // verifyPasswordLogin auto-upgrades this to bcrypt on first login.
        addTrace('password_path', 'sha256_fallback');
        const passwordHash = await hashPassword(newPassword);
        const existingCreds = await base44.entities.Credentials.filter({ user_id: userId });
        addTrace('credentials_exist', existingCreds.length > 0);

        if (existingCreds.length > 0) {
          await base44.entities.Credentials.update(existingCreds[0].id, {
            password_hash: passwordHash,
            last_password_change_at: new Date().toISOString()
          });
        } else {
          await base44.entities.Credentials.create({
            user_id: userId,
            email: userEmail,
            password_hash: passwordHash,
            last_password_change_at: new Date().toISOString()
          });
        }
      }
      addTrace('password_saved', true);

      // Step 4: Find trainee and ensure user_id is linked + status active
      const trainees = await base44.entities.Trainee.filter({ user_email: userEmail });
      addTrace('trainee_found', trainees.length > 0 ? trainees[0].id : 'NO');

      if (trainees.length > 0) {
        const trainee = trainees[0];
        addTrace('trainee_user_id_before', trainee.user_id || 'null');

        const traineeUpdates = {
          last_login_at: new Date().toISOString(),
          invite_status: 'joined',
          status: 'active',
        };
        if (!trainee.user_id) {
          traineeUpdates.user_id = userId;
        }
        if (!trainee.first_login_at) {
          traineeUpdates.first_login_at = new Date().toISOString();
        }

        await base44.entities.Trainee.update(trainee.id, traineeUpdates);
        addTrace('trainee_user_id_after', userId);
      }

      // Step 5: Clean up session data
      sessionStorage.removeItem('temp_access_session');
      localStorage.removeItem('pending_access_token');
      sessionStorage.removeItem('pending_access_token');
      addTrace('session_cleared', true);

      toast.success('הסיסמה הוגדרה בהצלחה! מתחבר לאפליקציה...');
      addTrace('redirect_target', '/');
      addTrace('final_status', 'SUCCESS');

      setDone(true);

      // Redirect to home after short delay
      setTimeout(() => {
        window.location.replace('/');
      }, 1500);

    } catch (err) {
      console.error('[SetPassword] Error:', err);
      addTrace('final_status', 'ERROR: ' + err.message);
      toast.error('שגיאה בהגדרת הסיסמה: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Done state — show success + manual button as failsafe
  if (done) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md w-full">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">הסיסמה הוגדרה!</h2>
          <p className="text-slate-500 text-sm mb-6">מעביר אותך לאפליקציה...</p>
          {/* Failsafe manual button */}
          <Button
            onClick={() => window.location.replace('/')}
            className="w-full"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            <Home className="w-4 h-4 ml-2" />
            כניסה לאפליקציה
          </Button>
        </Card>
      </div>
    );
  }

  // No session — show manual redirect failsafe
  if (!tempSession) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md w-full">
          <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">לא נמצא session</h2>
          <p className="text-slate-600 mb-4">אנא פתח שוב את קישור ההזמנה</p>
          <Button
            onClick={() => window.location.replace('/')}
            className="w-full"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            <Home className="w-4 h-4 ml-2" />
            עבור לאפליקציה
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: '#79DBD6' }}>
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">הגדרת סיסמה</h1>
          <p className="text-slate-600">שלום {tempSession.fullName}</p>
        </div>

        <form onSubmit={handleSetPassword} className="space-y-4">
          <div>
            <Label>אימייל</Label>
            <Input value={tempSession.userEmail} disabled className="bg-slate-100" />
          </div>

          <div>
            <Label htmlFor="password">סיסמה חדשה</Label>
            <Input
              id="password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="לפחות 8 תווים"
              required
              minLength={8}
            />
          </div>

          <div>
            <Label htmlFor="confirm">אימות סיסמה</Label>
            <Input
              id="confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
              required
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">הסיסמאות לא תואמות</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12 text-lg"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
            disabled={isLoading || newPassword !== confirmPassword || newPassword.length < 8}
          >
            {isLoading ? 'שומר...' : 'שמור וכנס לאפליקציה'}
          </Button>
        </form>

        {/* Trace log for debug */}
        {traceLog.length > 0 && (
          <div className="mt-4 p-2 bg-slate-900 rounded text-xs font-mono space-y-0.5 max-h-40 overflow-y-auto">
            {traceLog.map((t, i) => (
              <div key={i} className="text-slate-300">
                <span className="text-yellow-400">{t.key}:</span> {t.value}
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 text-center">
          <p className="text-xs text-slate-500">FIT COACH PRO</p>
        </div>
      </Card>
    </div>
  );
}