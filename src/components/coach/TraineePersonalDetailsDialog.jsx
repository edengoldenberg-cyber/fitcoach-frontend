import React, { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, RefreshCw, Loader2, User, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

// Normalize Israeli phone → E.164
function normalizePhone(raw) {
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.startsWith('972')) return '+' + digits;
  if (digits.startsWith('0')) return '+972' + digits.slice(1);
  return '+' + digits;
}

function isValidPhone(e164) {
  return /^\+972[5-9]\d{8}$/.test(e164);
}

export default function TraineePersonalDetailsDialog({ open, onClose, trainee, onSaved }) {
  const queryClient = useQueryClient();

  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [emailWarning, setEmailWarning] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [authStatus, setAuthStatus] = useState(null); // null | 'loading' | object
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (trainee && open) {
      setForm({
        full_name: trainee.full_name || '',
        user_email: trainee.user_email || '',
        phone: trainee.phone || '',
        birth_date: trainee.birth_date || '',
        gender: trainee.gender || '',
        status: trainee.status || 'active',
        coach_email: trainee.coach_email || '',
      });
      setEmailWarning('');
      setPhoneError('');
      setAuthStatus(null);
    }
  }, [trainee, open]);

  const handleEmailChange = async (newEmail) => {
    const normalized = newEmail.toLowerCase().trim();
    setForm(f => ({ ...f, user_email: normalized }));
    setEmailWarning('');

    if (!normalized || normalized === trainee.user_email?.toLowerCase()) return;

    setEmailWarning('⚠️ שינוי אימייל עלול להשפיע על התחברות וקישורי הזמנה');

    // Check duplicate
    const existing = await base44.entities.Trainee.filter({ user_email: normalized });
    const conflict = existing.find(t => t.id !== trainee.id);
    if (conflict) {
      setEmailWarning(`❌ אימייל זה כבר שייך למתאמן אחר: ${conflict.full_name}`);
    }
  };

  const handlePhoneChange = (val) => {
    setForm(f => ({ ...f, phone: val }));
    setPhoneError('');
  };

  const checkAuthSync = async () => {
    setAuthStatus('loading');
    try {
      const users = await base44.entities.User.filter({ email: (form.user_email || '').toLowerCase().trim() });
      const userFound = users.length > 0;
      const user = users[0];
      const loginLinkReady = !!trainee.user_id && userFound && (user?.id === trainee.user_id);
      setAuthStatus({
        userFound,
        userId: user?.id,
        traineeUserId: trainee.user_id,
        linkedCorrectly: userFound && user?.id === trainee.user_id,
        loginReady: loginLinkReady,
      });
    } catch (e) {
      setAuthStatus({ error: e.message });
    }
  };

  const handleSyncByEmail = async () => {
    setSyncing(true);
    try {
      const email = (form.user_email || '').toLowerCase().trim();
      const users = await base44.entities.User.filter({ email });
      if (users.length === 0) {
        toast.error('לא נמצא משתמש התחברות לאימייל זה');
        return;
      }
      const user = users[0];
      await base44.entities.Trainee.update(trainee.id, { user_id: user.id });
      toast.success('user_id עודכן בהצלחה!');
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      await checkAuthSync();
    } catch (e) {
      toast.error('שגיאה בסנכרון: ' + e.message);
    } finally {
      setSyncing(false);
    }
  };

  const handleSave = async () => {
    // Validate phone
    if (form.phone && form.phone.trim()) {
      const normalized = normalizePhone(form.phone);
      if (!isValidPhone(normalized)) {
        setPhoneError(`מספר טלפון לא תקין: "${form.phone}" → "${normalized}"\nנדרש פורמט ישראלי, לדוגמה: 0547598919`);
        return;
      }
      form.phone = normalized;
    }

    // Block if email duplicate warning shows conflict
    if (emailWarning.startsWith('❌')) {
      toast.error('לא ניתן לשמור - כתובת אימייל תפוסה');
      return;
    }

    setSaving(true);
    try {
      const updates = {
        full_name:  form.full_name.trim(),
        user_email: (form.user_email || '').toLowerCase().trim(),
        phone:      form.phone,
        birth_date: form.birth_date || null,
        gender:     form.gender || null,
        status:     form.status,
        coach_email:form.coach_email.trim(),
      };

      await base44.entities.Trainee.update(trainee.id, updates);
      toast.success('פרטים אישיים נשמרו בהצלחה!');
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error('שגיאה בשמירה: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!trainee) return null;

  const phonePreviewed = form.phone ? normalizePhone(form.phone) : '';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" />
            ערוך פרטים אישיים
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Full name */}
          <div>
            <Label>שם מלא</Label>
            <Input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>

          {/* Email */}
          <div>
            <Label>אימייל (user_email)</Label>
            <Input
              value={form.user_email}
              onChange={e => handleEmailChange(e.target.value)}
              type="email"
              className={emailWarning.startsWith('❌') ? 'border-red-400' : emailWarning ? 'border-amber-400' : ''}
            />
            {emailWarning && (
              <p className={`text-xs mt-1 ${emailWarning.startsWith('❌') ? 'text-red-600' : 'text-amber-600'}`}>
                {emailWarning}
              </p>
            )}
          </div>

          {/* Phone */}
          <div>
            <Label>טלפון</Label>
            <Input
              value={form.phone}
              onChange={e => handlePhoneChange(e.target.value)}
              placeholder="0547598919"
              className={phoneError ? 'border-red-400' : ''}
            />
            {form.phone && (
              <p className="text-xs text-slate-500 mt-1">
                → E.164: <span className={isValidPhone(phonePreviewed) ? 'text-green-600 font-mono' : 'text-red-600 font-mono'}>{phonePreviewed}</span>
              </p>
            )}
            {phoneError && <p className="text-xs text-red-600 mt-1 whitespace-pre-line">{phoneError}</p>}
          </div>

          {/* Birth date */}
          <div>
            <Label>תאריך לידה</Label>
            <Input
              type="date"
              value={form.birth_date || ''}
              onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))}
            />
          </div>

          {/* Gender */}
          <div>
            <Label>מין</Label>
            <select
              value={form.gender || ''}
              onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm bg-white"
            >
              <option value="">לא מוגדר</option>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
          </div>

          {/* Status */}
          <div>
            <Label>סטטוס</Label>
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full h-10 px-3 border border-slate-200 rounded-md text-sm bg-white"
            >
              <option value="active">פעיל</option>
              <option value="inactive">לא פעיל</option>
              <option value="paused">מושהה</option>
              <option value="pending_coach_approval">ממתין לאישור</option>
            </select>
          </div>

          {/* Coach email */}
          <div>
            <Label>אימייל מאמן (coach_email)</Label>
            <Input
              value={form.coach_email}
              onChange={e => setForm(f => ({ ...f, coach_email: e.target.value }))}
            />
          </div>

          {/* WhatsApp toggle */}
          {/* ─── Auth / Login Status Section ─── */}
          <div className="border-t pt-4">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheck className="w-4 h-4 text-slate-500" />
              <p className="text-sm font-semibold text-slate-700">סטטוס התחברות (Auth)</p>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 text-xs space-y-1 text-slate-600 mb-3">
              <div>trainee.user_id: <span className="font-mono text-slate-800">{trainee.user_id || '❌ ריק'}</span></div>
              <div>user_email: <span className="font-mono">{form.user_email}</span></div>
            </div>

            {authStatus === 'loading' && (
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="w-4 h-4 animate-spin" />בודק...
              </div>
            )}

            {authStatus && authStatus !== 'loading' && !authStatus.error && (
              <div className="space-y-1 text-xs mb-3">
                <div className="flex items-center gap-2">
                  {authStatus.userFound ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span>auth user נמצא: <b>{authStatus.userFound ? 'כן' : 'לא'}</b></span>
                </div>
                {authStatus.userId && (
                  <div className="text-slate-500 font-mono pr-5">user.id: {authStatus.userId}</div>
                )}
                <div className="flex items-center gap-2">
                  {authStatus.linkedCorrectly ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <AlertCircle className="w-3.5 h-3.5 text-amber-500" />}
                  <span>מקושר נכון: <b>{authStatus.linkedCorrectly ? 'כן' : 'לא'}</b></span>
                </div>
                <div className="flex items-center gap-2">
                  {authStatus.loginReady ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <AlertCircle className="w-3.5 h-3.5 text-red-500" />}
                  <span>login ready: <b>{authStatus.loginReady ? 'כן ✅' : 'לא ❌'}</b></span>
                </div>
                {!authStatus.linkedCorrectly && authStatus.userFound && (
                  <div className="mt-1 p-2 bg-amber-50 border border-amber-200 rounded text-amber-700">
                    נדרש סנכרון משתמש התחברות
                  </div>
                )}
              </div>
            )}

            {authStatus?.error && (
              <p className="text-xs text-red-500 mb-2">שגיאה: {authStatus.error}</p>
            )}

            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={checkAuthSync} className="text-xs">
                <RefreshCw className="w-3 h-3 ml-1" />
                בדוק סנכרון התחברות
              </Button>
              {authStatus && authStatus !== 'loading' && authStatus.userFound && !authStatus.linkedCorrectly && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncByEmail}
                  disabled={syncing}
                  className="text-xs text-blue-600 border-blue-300"
                >
                  {syncing ? <Loader2 className="w-3 h-3 animate-spin ml-1" /> : null}
                  סנכרן לפי אימייל
                </Button>
              )}
            </div>
          </div>

          {/* Save / Cancel */}
          <div className="flex gap-2 pt-2">
            <Button
              onClick={handleSave}
              disabled={saving || emailWarning.startsWith('❌')}
              className="flex-1"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : null}
              שמור פרטים אישיים
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">
              ביטול
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}