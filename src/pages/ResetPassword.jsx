import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle, CheckCircle2, Lock } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [success, setSuccess]       = useState(false);
  const [countdown, setCountdown]   = useState(5);

  // Redirect to login after success
  useEffect(() => {
    if (!success) return;
    const id = setInterval(() => {
      setCountdown(n => {
        if (n <= 1) {
          clearInterval(id);
          navigate('/LoginWithPassword');
        }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [success, navigate]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl"
        style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#e0f2fe 100%)' }}>
        <Card className="p-8 max-w-sm w-full text-center shadow-md border-0">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">קישור לא תקף</h2>
          <p className="text-slate-500 text-sm mb-6">
            הקישור חסר או שגוי. בקש קישור חדש.
          </p>
          <Link to="/LoginWithPassword">
            <Button className="w-full" style={{ backgroundColor: '#79DBD6' }}>
              חזור לכניסה
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl"
        style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#e0f2fe 100%)' }}>
        <Card className="p-8 max-w-sm w-full text-center shadow-md border-0">
          <CheckCircle2 className="w-12 h-12 text-teal-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">הסיסמה עודכנה!</h2>
          <p className="text-slate-500 text-sm mb-6">
            ניתן עכשיו להתחבר עם הסיסמה החדשה.
          </p>
          <p className="text-slate-400 text-xs mb-4">מעביר אוטומטית בעוד {countdown} שניות...</p>
          <Link to="/LoginWithPassword">
            <Button className="w-full text-white font-semibold" style={{ backgroundColor: '#79DBD6' }}>
              כניסה עכשיו
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('סיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    if (password !== confirm) {
      setError('הסיסמאות אינן תואמות');
      return;
    }

    setLoading(true);
    try {
      const result = await base44.auth.resetPassword({ token, password });
      if (!result?.ok) {
        setError(result?.error || 'שגיאה באיפוס הסיסמה. הקישור אולי פג תוקף — בקש קישור חדש.');
        return;
      }
      setSuccess(true);
    } catch (err) {
      setError(err?.data?.error || err.message || 'שגיאה באיפוס הסיסמה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" dir="rtl"
      style={{ background: 'linear-gradient(135deg,#f0fdf4 0%,#e0f2fe 100%)' }}>
      <div className="w-full max-w-sm space-y-6">

        {/* Brand */}
        <div className="text-center">
          <div className="w-20 h-20 rounded-2xl mx-auto mb-4 flex items-center justify-center shadow-lg"
            style={{ background: 'linear-gradient(135deg,#79DBD6,#5BC5C0)' }}>
            <span className="text-white text-3xl font-bold">F</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-800">איפוס סיסמה</h1>
          <p className="text-slate-500 text-sm mt-1">בחר סיסמה חדשה לחשבון שלך</p>
        </div>

        <Card className="p-6 shadow-md border-0">
          <form onSubmit={handleSubmit} className="space-y-4">

            <div>
              <Label htmlFor="password">סיסמה חדשה</Label>
              <div className="relative mt-1">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 8 תווים"
                  required
                  minLength={8}
                  className="pr-9"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="confirm">אישור סיסמה</Label>
              <div className="relative mt-1">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="הזן שוב את הסיסמה"
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

            <Button type="submit" disabled={loading}
              className="w-full h-11 text-base font-semibold text-white"
              style={{ backgroundColor: '#79DBD6' }}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'עדכן סיסמה'}
            </Button>

            <div className="text-center">
              <Link to="/LoginWithPassword"
                className="text-sm text-slate-500 hover:text-slate-700">
                חזור לכניסה
              </Link>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
