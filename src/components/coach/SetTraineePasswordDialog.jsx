import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { Loader2, CheckCircle2, Copy, RefreshCw, Mail, Lock, AlertCircle } from 'lucide-react';

function generatePassword() {
  const words = ['Fit', 'Pro', 'Run', 'Gym', 'Lift', 'Jump', 'Push', 'Move'];
  const word  = words[Math.floor(Math.random() * words.length)];
  const num   = Math.floor(1000 + Math.random() * 9000);
  const sym   = ['!', '@', '#'][Math.floor(Math.random() * 3)];
  return `${word}${num}${sym}`;
}

export default function SetTraineePasswordDialog({ trainee, open, onClose }) {
  const [mode, setMode]         = useState('generate'); // 'generate' | 'manual'
  const [password, setPassword] = useState('');
  const [sendEmail, setSendEmail] = useState(true);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(null); // { email, password }
  const [copied, setCopied]     = useState(false);

  const generatedRef = React.useRef(generatePassword());

  const effectivePassword = mode === 'generate' ? generatedRef.current : password;

  function handleRegenerate() {
    generatedRef.current = generatePassword();
    // force re-render
    setPassword(p => p);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!effectivePassword || effectivePassword.length < 8) {
      setError('הסיסמה חייבת להכיל לפחות 8 תווים');
      return;
    }
    setLoading(true);
    // 15s safety net — if the backend hangs (e.g. SMTP timeout) we don't leave
    // the dialog stuck forever. The backend now fires email asynchronously so
    // this should rarely trigger, but it's here as a last resort.
    const timer = setTimeout(() => {
      setLoading(false);
      setError('הפעולה לקחה יותר מדי זמן. הסיסמה ייתכן שהוגדרה — נסה שוב או רענן.');
    }, 15000);
    try {
      await base44.auth.setTraineePassword(trainee.id, effectivePassword, sendEmail);
      clearTimeout(timer);
      setSuccess({ email: trainee.user_email, password: effectivePassword });
    } catch (err) {
      clearTimeout(timer);
      setError(err?.data?.error || err.message || 'שגיאה בהגדרת הסיסמה');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(effectivePassword).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setMode('generate');
    setPassword('');
    setSendEmail(true);
    setError('');
    setSuccess(null);
    setCopied(false);
    generatedRef.current = generatePassword();
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-teal-600" />
            הזמן למערכת / הגדר סיסמה
          </DialogTitle>
        </DialogHeader>

        {success ? (
          /* ── Success state ── */
          <div className="space-y-4 py-2">
            <div className="flex flex-col items-center gap-2 text-center">
              <CheckCircle2 className="w-10 h-10 text-teal-500" />
              <p className="font-semibold text-slate-800">הסיסמה הוגדרה בהצלחה!</p>
              <p className="text-sm text-slate-500">{success.email}</p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
              <p className="text-xs text-slate-500 mb-2">סיסמה להעביר למתאמן:</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 font-mono text-lg font-bold text-slate-800 tracking-wider">
                  {success.password}
                </span>
                <Button size="sm" variant="outline" onClick={handleCopy} className="flex-shrink-0">
                  {copied ? '✅' : <Copy className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {sendEmail && (
              <div className="flex items-center gap-2 text-sm text-teal-700 bg-teal-50 border border-teal-200 rounded-lg p-3">
                <Mail className="w-4 h-4 flex-shrink-0" />
                <span>אימייל הזמנה נשלח ל-{success.email}</span>
              </div>
            )}

            <p className="text-xs text-slate-400 text-center">
              העבר את הסיסמה למתאמן בהודעה פרטית. מומלץ שיחליף לאחר כניסה ראשונה.
            </p>

            <Button className="w-full text-white" style={{ backgroundColor: '#79DBD6' }} onClick={handleClose}>
              סגור
            </Button>
          </div>
        ) : (
          /* ── Form state ── */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Trainee name */}
            <div>
              <Label>מתאמן</Label>
              <Input value={trainee?.full_name || ''} disabled className="bg-slate-100 mt-1" />
            </div>

            {/* Mode toggle */}
            <div>
              <Label className="mb-2 block">סוג סיסמה</Label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode('generate')}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    mode === 'generate'
                      ? 'bg-teal-50 border-teal-400 text-teal-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  יצירה אוטומטית
                </button>
                <button
                  type="button"
                  onClick={() => setMode('manual')}
                  className={`flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                    mode === 'manual'
                      ? 'bg-teal-50 border-teal-400 text-teal-700'
                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  סיסמה ידנית
                </button>
              </div>
            </div>

            {/* Password display / input */}
            {mode === 'generate' ? (
              <div>
                <Label>סיסמה שתיווצר</Label>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 font-mono text-lg font-bold text-slate-800 tracking-wider">
                    {generatedRef.current}
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={handleRegenerate} className="flex-shrink-0">
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="manual-pwd">סיסמה</Label>
                <Input
                  id="manual-pwd"
                  type="text"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="לפחות 8 תווים"
                  minLength={8}
                  required
                  className="mt-1 font-mono"
                  dir="ltr"
                />
              </div>
            )}

            {/* Send email checkbox */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={sendEmail}
                onChange={e => setSendEmail(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-teal-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-700 flex items-center gap-1">
                  <Mail className="w-4 h-4 text-teal-600" />
                  שלח אימייל הזמנה למתאמן
                </p>
                <p className="text-xs text-slate-400">
                  יכלול קישור להתחברות ואת הסיסמה הזמנית
                </p>
              </div>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={handleClose}>
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={loading || (mode === 'manual' && password.length < 8)}
                className="text-white font-semibold"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {loading
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : 'הגדר סיסמה'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
