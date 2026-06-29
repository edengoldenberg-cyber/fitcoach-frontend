import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Key } from 'lucide-react';

export default function AccessCodeLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!/^\d{6}$/.test(accessCode)) {
        throw new Error('קוד חייב להיות 6 ספרות');
      }

      // Call the public backend function — no prior JWT needed.
      // The backend validates the code, marks it used, and issues a real JWT.
      const result = await base44.functions.invoke('verifyAccessCode', {
        email: email.toLowerCase().trim(),
        code: accessCode,
      });

      if (!result.ok) {
        const messages = {
          INVALID_CODE:       'קוד שגוי או לא נמצא',
          CODE_ALREADY_USED:  'הקוד כבר נוצל. בקש/י קוד חדש מהמאמן.',
          CODE_EXPIRED:       'הקוד פג תוקף. בקש/י קוד חדש מהמאמן.',
          TOO_MANY_ATTEMPTS:  'חרגת ממספר הניסיונות המותר. בקש/י קוד חדש מהמאמן.',
          USER_NOT_FOUND:     'משתמש לא נמצא',
          INVALID_FORMAT:     'קוד חייב להיות 6 ספרות',
          MISSING_FIELDS:     'יש למלא אימייל וקוד',
        };
        throw new Error(messages[result.errorCode] || 'שגיאה בהתחברות');
      }

      // Store the JWT — exactly like password login.
      // This sets localStorage['fitcoach_token'] so all subsequent API calls
      // include Authorization: Bearer <token> and req.user is always populated.
      base44.auth.setToken(result.access_token, true);

      toast.success(`ברוך הבא${result.user_full_name ? ' ' + result.user_full_name.split(' ')[0] : ''}!`);

      if (!result.has_password) {
        // First-time user — needs to set a password.
        // Store temp session so SetPassword.jsx can read userId/email.
        sessionStorage.setItem('temp_access_session', JSON.stringify({
          userId:              result.user_id,
          userEmail:           result.user_email,
          fullName:            result.user_full_name,
          isTemporary:         false,
          requirePasswordSetup: true,
          timestamp:           Date.now(),
        }));
        navigate(createPageUrl('SetPassword'));
      } else {
        navigate('/');
      }
    } catch (err) {
      console.error('[AccessCodeLogin] error:', err);
      setError(err.message || 'שגיאה בהתחברות');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: '#79DBD6' }}>
            <Key className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: '#79DBD6' }}>
            FIT COACH PRO
          </h1>
          <p className="text-slate-600">כניסה עם קוד מהמאמן</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <Label>אימייל</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              required
            />
            <p className="text-xs text-slate-500 mt-1">
              האימייל שהמאמן רשם אותך איתו
            </p>
          </div>

          <div>
            <Label>קוד גישה</Label>
            <Input
              type="text"
              value={accessCode}
              onChange={(e) => setAccessCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="123456"
              required
              maxLength={6}
              className="text-3xl tracking-widest text-center font-bold"
              style={{ letterSpacing: '0.5em' }}
            />
            <p className="text-xs text-slate-500 mt-1">
              קוד בן 6 ספרות שקיבלת מהמאמן
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                מתחבר...
              </>
            ) : (
              <>
                <Key className="w-4 h-4 ml-2" />
                כניסה עם קוד
              </>
            )}
          </Button>

          <div className="text-center pt-4 border-t">
            <p className="text-sm text-slate-600">
              יש לך סיסמה?{' '}
              <button
                type="button"
                onClick={() => base44.auth.redirectToLogin()}
                className="text-blue-600 hover:underline font-medium"
              >
                התחבר באופן רגיל
              </button>
            </p>
          </div>
        </form>
      </Card>
    </div>
  );
}