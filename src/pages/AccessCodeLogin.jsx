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
      // Validate code format
      if (!/^\d{6}$/.test(accessCode)) {
        throw new Error('קוד חייב להיות 6 ספרות');
      }

      // Hash code
      const encoder = new TextEncoder();
      const data = encoder.encode(accessCode);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const codeHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Find code
      const codes = await base44.entities.AccessCode.filter({ 
        trainee_email: email.toLowerCase().trim(),
        code_hash: codeHash
      });

      if (codes.length === 0) {
        throw new Error('קוד שגוי או לא נמצא');
      }

      const code = codes[0];

      // Check if used
      if (code.used_at) {
        throw new Error('הקוד כבר נוצל. בקש/י קוד חדש מהמאמן.');
      }

      // Check expiry
      if (new Date(code.expires_at) < new Date()) {
        throw new Error('הקוד פג תוקף. בקש/י קוד חדש מהמאמן.');
      }

      // Check attempts
      if (code.attempts_count >= 5) {
        throw new Error('חרגת ממספר הניסיונות המותר. בקש/י קוד חדש מהמאמן.');
      }

      // Mark as used
      await base44.entities.AccessCode.update(code.id, {
        used_at: new Date().toISOString()
      });

      // Get user
      const users = await base44.entities.User.filter({ id: code.trainee_user_id });
      if (users.length === 0) {
        throw new Error('משתמש לא נמצא');
      }
      const user = users[0];

      // Update trainee login
      const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
      if (trainees.length > 0) {
        const trainee = trainees[0];
        const updates = { last_login_at: new Date().toISOString() };
        if (!trainee.first_login_at) {
          updates.first_login_at = new Date().toISOString();
        }
        await base44.entities.Trainee.update(trainee.id, updates);
      }

      // Create temp session for password setup
      const tempSession = {
        userId: user.id,
        userEmail: user.email,
        fullName: user.full_name,
        isTemporary: true,
        requirePasswordSetup: true,
        timestamp: Date.now()
      };
      sessionStorage.setItem('temp_access_session', JSON.stringify(tempSession));

      toast.success(`ברוך הבא ${user.full_name}!`);
      
      // Check if password exists
      const credentials = await base44.entities.Credentials.filter({ user_id: user.id });
      if (credentials.length === 0 || !credentials[0].password_hash) {
        // Redirect to set password
        navigate(createPageUrl('SetPassword'));
      } else {
        // Already has password, create permanent session
        const sessionData = {
          userId: user.id,
          userEmail: user.email,
          fullName: user.full_name,
          role: user.role,
          loginTime: new Date().toISOString(),
          rememberMe: true
        };
        localStorage.setItem('fitcoach_session', JSON.stringify(sessionData));
        navigate(createPageUrl('TraineeHome'));
      }

    } catch (err) {
      console.error('Code login error:', err);
      
      // Increment attempts if code was found
      if (err.message !== 'קוד שגוי או לא נמצא') {
        try {
          const encoder = new TextEncoder();
          const data = encoder.encode(accessCode);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const codeHash = Array.from(new Uint8Array(hashBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
          
          const codes = await base44.entities.AccessCode.filter({ 
            trainee_email: email.toLowerCase().trim(),
            code_hash: codeHash
          });
          
          if (codes.length > 0) {
            await base44.entities.AccessCode.update(codes[0].id, {
              attempts_count: (codes[0].attempts_count || 0) + 1
            });
          }
        } catch (updateErr) {
          console.error('Failed to update attempts:', updateErr);
        }
      }
      
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