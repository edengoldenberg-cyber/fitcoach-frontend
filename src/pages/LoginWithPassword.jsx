import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, AlertCircle, Lock, Mail, Key } from 'lucide-react';

export default function LoginWithPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await base44.functions.invoke('verifyPasswordLogin', {
        email: email.toLowerCase().trim(),
        password,
      });

      if (!result?.ok) {
        if (result?.errorCode === 'ACCOUNT_LOCKED') {
          setError('יותר מדי ניסיונות. נסה שוב בעוד 15 דקות.');
        } else {
          setError('אימייל או סיסמה שגויים');
        }
        return;
      }

      // Set persistent session — stored in localStorage['base44_access_token']
      base44.auth.setToken(result.access_token, true);

      // Fetch full user from platform to get all fields
      const user = await base44.auth.me();
      if (!user) {
        setError('שגיאה בטעינת פרטי המשתמש');
        return;
      }

      toast.success(`ברוך הבא${user.full_name ? ' ' + user.full_name.split(' ')[0] : ''}!`);

      // Role-based redirect
      if (user.role === 'admin') {
        navigate('/SystemControlCenter');
        return;
      }

      if (user.role === 'coach') {
        navigate('/ManageTrainees');
        return;
      }

      // Trainee flow — check for existing trainee record
      const trainees = await base44.entities.Trainee.filter({ user_id: user.id }).catch(() => []);
      const trainee = trainees[0] || null;

      if (!trainee) {
        navigate('/SetPassword');
        return;
      }

      if (trainee.onboarding_status === 'pending') {
        navigate('/OnboardingScreen');
        return;
      }

      navigate('/');
    } catch (err) {
      console.error('[LoginWithPassword] error:', err);
      setError('אימייל או סיסמה שגויים');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      toast.error('הזן אימייל תחילה');
      return;
    }
    try {
      await base44.auth.resetPasswordRequest(email.toLowerCase().trim());
      toast.success('אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה.');
    } catch (_) {
      // Generic message to avoid email enumeration
      toast.success('אם האימייל קיים במערכת, נשלח אליו קישור לאיפוס סיסמה.');
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #e0f2fe 100%)' }}
      dir="rtl"
    >
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="text-center">
          <div
            className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg, #79DBD6, #5BC5C0)' }}
          >
            <span className="text-white text-3xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">FIT COACH PRO</h1>
          <p className="text-slate-500 text-sm mt-1">כניסה עם אימייל וסיסמה</p>
        </div>

        <Card className="p-6 shadow-md border-0">
          <form onSubmit={handleLogin} className="space-y-4">

            <div>
              <Label htmlFor="email">אימייל</Label>
              <div className="relative mt-1">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                  required
                  className="pr-9"
                  dir="ltr"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password">סיסמה</Label>
              <div className="relative mt-1">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="הסיסמה שלך"
                  required
                  className="pr-9"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <Button
              type="submit"
              className="w-full h-11 text-base font-semibold text-white"
              style={{ backgroundColor: '#79DBD6' }}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                'כניסה'
              )}
            </Button>

            <button
              type="button"
              onClick={handleForgotPassword}
              className="w-full text-sm text-slate-500 hover:text-slate-700 text-center"
            >
              שכחתי סיסמה
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2 text-slate-400">כניסה ראשונה?</span>
            </div>
          </div>

          <Link to="/AccessCodeLogin">
            <Button
              type="button"
              variant="outline"
              className="w-full h-11 gap-3"
            >
              <Key className="w-5 h-5 text-teal-600" />
              כניסה עם קוד גישה מהמאמן
            </Button>
          </Link>

          <p className="text-xs text-slate-400 text-center mt-4">
            לא הוגדרה סיסמה עדיין? בקש/י קוד גישה מהמאמן שלך
          </p>
        </Card>

      </div>
    </div>
  );
}
