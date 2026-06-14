import React, { useState, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  RefreshCw, Play, CheckCircle, XCircle, Clock, Droplets, Utensils,
  Dumbbell, Phone, Wifi, WifiOff, AlertTriangle, Shield, ShieldOff,
  ChevronDown, ChevronUp, Users, Check, Scale, Sparkles, MessageSquare, TrendingUp
} from 'lucide-react';
import { toast } from 'sonner';

// ── localStorage helpers ────────────────────────────────────────────────────
const ACTIVE_KEY = 'reminderAutomations_active';
const TARGETS_KEY = 'reminderAutomations_targets'; // { [automationId]: 'all' | string[] }
const GLOBAL_KEY = 'reminderAutomations_global';

function ls_get(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function ls_set(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}

function normalizePhoneClient(phoneRaw) {
  if (!phoneRaw) return null;
  let s = String(phoneRaw).trim().replace(/[\s\-().,]/g, '').replace(/[^\d+]/g, '');
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (/^972\d{9}$/.test(s)) s = '+' + s;
  if (/^0\d{9}$/.test(s)) s = '+972' + s.slice(1);
  if (/^\+972\d{9}$/.test(s)) return s;
  return null;
}

const AUTOMATIONS = [
  {
    id: 'reminderMealLog',
    name: 'תזכורת ארוחות',
    description: 'שולח תזכורת למתאמנים שלא רשמו ארוחות',
    icon: Utensils,
    color: 'text-orange-500',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    times: ['09:00', '13:30', '20:00'],
    statusFn: async (trainee, todayStr) => {
      const meals = await base44.entities.MealEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
      return { ok: meals.length >= 2, label: meals.length === 0 ? 'לא רשם כלום' : `${meals.length} ארוחות` };
    },
  },
  {
    id: 'reminderWaterLog',
    name: 'תזכורת מים',
    description: 'שולח תזכורת למתאמנים שלא עמדו ביעד המים',
    icon: Droplets,
    color: 'text-blue-500',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    times: ['12:30', '19:00'],
    statusFn: async (trainee, todayStr) => {
      const entries = await base44.entities.WaterEntry.filter({ trainee_email: trainee.user_email, date: todayStr });
      const total = entries.reduce((s, e) => s + (e.amount_ml || 0), 0);
      const target = trainee.target_water_ml || 2500;
      const pct = Math.round((total / target) * 100);
      return { ok: pct >= 60, label: `${total} מ"ל (${pct}%)` };
    },
  },
  {
    id: 'workoutMotivationCheck',
    name: 'עידוד אימונים',
    description: 'שולח הודעת עידוד לפי מספר האימונים השבוע',
    icon: Dumbbell,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    times: ['08:00'],
    statusFn: async (trainee, todayStr) => {
      const dayOfWeek = new Date(todayStr).getDay();
      const startOfWeek = new Date(todayStr);
      startOfWeek.setDate(startOfWeek.getDate() - dayOfWeek);
      const weekStartStr = startOfWeek.toISOString().split('T')[0];
      const sessions = await base44.entities.WorkoutSession.filter({ trainee_email: trainee.user_email, status: 'completed' });
      const weekCount = sessions.filter(s => s.date >= weekStartStr && s.date <= todayStr).length;
      return { ok: weekCount >= 3, label: `${weekCount} אימונים השבוע` };
    },
  },
  {
    id: 'weighInReminderScheduler',
    name: 'תזכורת שקילה',
    description: 'שולח תזכורת כל 3 שבועות משקילה ראשונה',
    icon: Scale,
    color: 'text-purple-500',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    times: ['08:00'],
    statusFn: async (trainee, todayStr) => {
      const meals = await base44.entities.MealEntry.filter({ trainee_email: trainee.user_email });
      if (!meals.length) return { ok: false, label: 'לא רשם ארוחות' };
      const firstMeal = meals.sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
      const first = new Date(firstMeal.created_date);
      const now = new Date(todayStr);
      const daysSinceFirst = (now - first) / (1000 * 60 * 60 * 24);
      const weeksElapsed = Math.floor(daysSinceFirst / 7);
      const nextWeekInCycle = ((Math.floor(weeksElapsed / 3) + 1) * 3);
      const daysUntilNext = Math.ceil((nextWeekInCycle * 7 - daysSinceFirst));
      return { ok: daysUntilNext <= 1, label: `${Math.max(0, daysUntilNext)} ימים עד שקילה` };
    },
  },
  {
    id: 'encouragementNotificationScheduler',
    name: 'הודעות עידוד',
    description: 'שולח הודעות עידוד למתאמנים פעילים',
    icon: Sparkles,
    color: 'text-pink-500',
    bg: 'bg-pink-50',
    border: 'border-pink-200',
    times: ['10:00'],
    statusFn: async (trainee, todayStr) => {
      const meals = await base44.entities.MealEntry.filter({ trainee_email: trainee.user_email });
      const water = await base44.entities.WaterEntry.filter({ trainee_email: trainee.user_email });
      const recentMeals = meals.filter(m => {
        const d = new Date(m.created_date || m.date);
        const now = new Date(todayStr);
        return (now - d) / (1000 * 60 * 60 * 24) <= 7;
      });
      const recentWater = water.filter(w => {
        const d = new Date(w.created_date || w.date);
        const now = new Date(todayStr);
        return (now - d) / (1000 * 60 * 60 * 24) <= 7;
      });
      const isActive = recentMeals.length > 0 || recentWater.length > 0;
      return { ok: isActive, label: isActive ? 'מתאמן פעיל' : 'לא פעיל' };
    },
  },
  {
    id: 'feedbackRequestScheduler',
    name: 'בקשת משוב 30 יום',
    description: 'שולח בקשת משוב למתאמנים בעד 30 יום',
    icon: MessageSquare,
    color: 'text-teal-500',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    times: ['12:00'],
    statusFn: async (trainee, todayStr) => {
      if (!trainee.first_login_at) return { ok: false, label: 'לא התחיל עדיין' };
      const firstLogin = new Date(trainee.first_login_at);
      const now = new Date(todayStr);
      const daysSince = (now - firstLogin) / (1000 * 60 * 60 * 24);
      const is30Days = daysSince >= 29 && daysSince <= 31;
      return { ok: is30Days, label: `${Math.round(daysSince)} ימים` };
    },
  },
  {
    id: 'weeklyMotivationSummary',
    name: 'סיכום שבוע מוטיבציה',
    description: 'שולח סיכום שבועי עם אימונים, גירעון קלורי והתקדמות ליעד',
    icon: TrendingUp,
    color: 'text-emerald-500',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    times: ['21:00'],
    statusFn: async (trainee, todayStr) => {
      const dayOfWeek = new Date(todayStr).getDay();
      const isSaturday = dayOfWeek === 6;
      return { ok: isSaturday, label: isSaturday ? 'מועד שליחה היום' : 'ישלח בשבת' };
    },
  },
];

// ── Trainee status row ──────────────────────────────────────────────────────
function TraineeStatusRow({ trainee, automation, todayStr }) {
  const { data: status, isLoading } = useQuery({
    queryKey: ['automationStatus', automation.id, trainee.id, todayStr],
    queryFn: () => automation.statusFn(trainee, todayStr),
    staleTime: 5 * 60 * 1000,
  });
  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-50">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-800">{trainee.full_name}</span>
        {trainee.phone && <span className="text-xs text-slate-400">{trainee.phone}</span>}
      </div>
      {isLoading ? (
        <span className="text-xs text-slate-400">טוען...</span>
      ) : status ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-500">{status.label}</span>
          {status.ok ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-400" />}
        </div>
      ) : null}
    </div>
  );
}

// ── Trainee Picker Dialog ───────────────────────────────────────────────────
function TraineePickerDialog({ open, onClose, allTrainees, selectedEmails, onSave }) {
  const [mode, setMode] = useState(selectedEmails === 'all' ? 'all' : 'selected');
  const [chosen, setChosen] = useState(selectedEmails === 'all' ? [] : (selectedEmails || []));

  const toggle = (email) => {
    setChosen(prev => prev.includes(email) ? prev.filter(e => e !== email) : [...prev, email]);
  };

  const handleSave = () => {
    onSave(mode === 'all' ? 'all' : chosen);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-sm max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-500" />
            בחר מתאמנים לאוטומציה
          </DialogTitle>
        </DialogHeader>
        <div className="flex gap-2 my-3">
          <button
            onClick={() => setMode('all')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'all' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            כל המתאמנים ({allTrainees.length})
          </button>
          <button
            onClick={() => setMode('selected')}
            className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${mode === 'selected' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
          >
            נבחרים
          </button>
        </div>
        {mode === 'selected' && (
          <div className="flex-1 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2 min-h-0">
            {allTrainees.map(t => {
              const sel = chosen.includes(t.user_email);
              return (
                <button
                  key={t.id}
                  onClick={() => toggle(t.user_email)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-right transition-all ${sel ? 'bg-teal-50 text-teal-800' : 'hover:bg-slate-50 text-slate-700'}`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${sel ? 'border-teal-400 bg-teal-400' : 'border-slate-300'}`}>
                    {sel && <Check className="w-3 h-3 text-white" />}
                  </div>
                  <span className="flex-1">{t.full_name}</span>
                </button>
              );
            })}
          </div>
        )}
        <div className="flex gap-2 mt-3">
          <Button variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
          <Button onClick={handleSave} className="flex-1" style={{ backgroundColor: '#79DBD6' }}>
            שמור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// No default test phone — forcing explicit entry prevents accidental sends to a real number

// ── Automation Card ─────────────────────────────────────────────────────────
function AutomationCard({ automation, allTrainees, todayStr, activeProvider, isActive, onToggle, targets, onTargetsChange, globalEnabled, killSwitchActive }) {
  const Icon = automation.icon;
  const [testPhone, setTestPhone] = useState('');
  const [showTestDialog, setShowTestDialog] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [showStatuses, setShowStatuses] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const queryClient = useQueryClient();

  const effectiveTrainees = targets === 'all'
    ? allTrainees.filter(t => t.user_email)
    : allTrainees.filter(t => t.user_email && (targets || []).includes(t.user_email));

  const targetLabel = targets === 'all'
    ? `כל המתאמנים (${allTrainees.length})`
    : `${effectiveTrainees.length} נבחרים`;

  const normalizedTestPhone = normalizePhoneClient(testPhone.trim());

  const handleTestClick = () => {
    if (killSwitchActive) {
      toast.warning('טסט חסום — הפעל Outbound כדי לשלוח');
      return;
    }
    if (!testPhone.trim() || !normalizedTestPhone) {
      toast.error('מספר טלפון לא תקין');
      return;
    }
    setTestResult(null);
    setShowConfirm(true);
  };

  const handleConfirmSend = async () => {
    setShowConfirm(false);
    setTestLoading(true);
    try {
      // Direct send — bypasses scheduler, queue, time windows
      const res = await base44.functions.invoke('testAutomationMessage', {
        automationId: automation.id,
        testPhone: testPhone.trim(),
      });
      const data = res?.data || {};
      setTestResult(data);
      if (data.success || data.testMode) {
        toast.success(`✅ טסט נשלח ל-${normalizedTestPhone}`);
      } else if (data.blocked) {
        toast.warning('⛔ חסום על ידי Kill Switch');
      } else {
        toast.error(`❌ ${data.error || data.message || 'שגיאה לא ידועה'}`);
      }
    } catch (e) {
      toast.error('שגיאה: ' + (e.message || 'לא ניתן לשלוח'));
    } finally {
      setTestLoading(false);
    }
  };

  const cardActive = isActive && globalEnabled;

  return (
    <>
      <Card className={`border-2 rounded-2xl overflow-hidden transition-all ${cardActive ? automation.border : 'border-slate-200'} ${!cardActive ? 'opacity-70' : ''}`}>
        {/* Header */}
        <div className={`${cardActive ? automation.bg : 'bg-slate-50'} px-4 py-3`}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                <Icon className={`w-5 h-5 ${cardActive ? automation.color : 'text-slate-400'}`} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-slate-800 text-sm">{automation.name}</h3>
                  <Badge className={`text-xs px-2 py-0 ${cardActive ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                    {cardActive ? 'פעיל' : 'כבוי'}
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 truncate">{automation.description}</p>
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={() => onToggle(automation.id)} />
          </div>

          {/* Times */}
          <div className="flex gap-1.5 mt-2 flex-wrap">
            {automation.times.map(t => (
              <Badge key={t} variant="outline" className="bg-white text-xs border-slate-200 text-slate-600 gap-1">
                <Clock className="w-3 h-3" />{t}
              </Badge>
            ))}
            {!isActive && <Badge className="bg-slate-200 text-slate-500 text-xs border-0">⏸ מושהה</Badge>}
            {!globalEnabled && isActive && <Badge className="bg-red-100 text-red-600 text-xs border-0">🔒 חסום גלובלית</Badge>}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-white">
          {/* Target */}
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 text-xs text-slate-600 hover:text-teal-600 transition-colors border border-slate-200 rounded-lg px-2.5 py-1.5 bg-slate-50 hover:bg-teal-50"
          >
            <Users className="w-3.5 h-3.5" />
            {targetLabel}
          </button>

          <div className="flex items-center gap-1">
            {/* Status toggle */}
            <button
              onClick={() => setShowStatuses(!showStatuses)}
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded-lg hover:bg-slate-50"
            >
              סטטוסים
              {showStatuses ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {/* Test */}
            <Button size="sm" onClick={() => setShowTestDialog(true)}
              className={`h-8 px-3 text-xs border-0 gap-1 ${killSwitchActive ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-teal-100 hover:bg-teal-200 text-teal-800'}`}>
              <Play className="w-3 h-3" />
              {killSwitchActive ? 'טסט חסום' : 'שלח טסט'}
            </Button>
          </div>
        </div>

        {/* Trainee statuses */}
        {showStatuses && (
          <div className="border-t border-slate-100 divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {effectiveTrainees.length === 0 ? (
              <p className="text-sm text-slate-400 py-3 text-center">אין מתאמנים בחירה זו</p>
            ) : effectiveTrainees.map(t => (
              <TraineeStatusRow key={t.id} trainee={t} automation={automation} todayStr={todayStr} />
            ))}
          </div>
        )}
      </Card>

      {/* Trainee Picker */}
      <TraineePickerDialog
        open={showPicker}
        onClose={() => setShowPicker(false)}
        allTrainees={allTrainees.filter(t => t.user_email)}
        selectedEmails={targets}
        onSave={onTargetsChange}
      />

      {/* Test Dialog */}
      <Dialog open={showTestDialog} onOpenChange={(v) => { setShowTestDialog(v); if (!v) { setTestResult(null); } }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={`w-5 h-5 ${automation.color}`} />
              שלח טסט — {automation.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">

            {/* Kill switch warning */}
            {killSwitchActive && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700 flex items-center gap-2 font-medium">
                ⛔ טסט חסום — הפעל Outbound כדי לשלוח
              </div>
            )}

            {!killSwitchActive && !activeProvider && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5" />
                WhatsApp לא מחובר — הטסט יכשל.
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1.5 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />מספר טלפון לטסט
              </label>
              <Input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="+972541234567"
                dir="ltr"
                disabled={killSwitchActive}
              />
              {testPhone && (() => {
                const norm = normalizePhoneClient(testPhone.trim());
                return norm
                  ? <p className="text-xs text-green-600 mt-1">✅ תקין: {norm}</p>
                  : <p className="text-xs text-red-500 mt-1">❌ פורמט לא תקין</p>;
              })()}
              <p className="text-xs text-slate-400 mt-1">הכנס מספר ישראלי (לדוגמה: 0541234567)</p>
            </div>

            {/* Test Result */}
            {testResult && (
              <div className={`rounded-lg px-3 py-2 text-xs border ${testResult.success || testResult.testMode ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {(testResult.success || testResult.testMode) ? (
                  <>
                    <div className="font-bold mb-1">✅ טסט נשלח בהצלחה</div>
                    <div>📞 {testResult.phone}</div>
                    {testResult.preview && (
                      <div className="mt-1 p-2 bg-white rounded border border-green-100 whitespace-pre-wrap leading-relaxed font-normal">{testResult.preview}</div>
                    )}
                    {testResult.queueId && <div className="text-green-600 mt-1">Queue ID: {testResult.queueId}</div>}
                  </>
                ) : testResult.blocked ? (
                  <div>⛔ חסום: {testResult.reason}</div>
                ) : (
                  <div>❌ {testResult.error || testResult.message || 'שגיאה'}</div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowTestDialog(false)} className="flex-1">סגור</Button>
              <Button
                onClick={handleTestClick}
                disabled={testLoading || killSwitchActive}
                className="flex-1 bg-teal-500 hover:bg-teal-600 text-white disabled:opacity-50"
              >
                {testLoading ? <><span className="animate-spin mr-1">⏳</span> שולח...</> : '▶ שלח טסט'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmation Modal */}
      <Dialog open={showConfirm} onOpenChange={setShowConfirm}>
        <DialogContent dir="rtl" className="max-w-xs">
          <DialogHeader>
            <DialogTitle>אישור שליחת טסט</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-slate-700">
              שולח הודעת טסט עבור <strong>{automation.name}</strong> אל:
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 text-center">
              {normalizedTestPhone}
            </div>
            <p className="text-xs text-slate-500">שליחה ישירה דרך הספק — ללא תור, ללא חלונות זמן, רק לטלפון הזה.</p>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1">ביטול</Button>
              <Button onClick={handleConfirmSend} className="flex-1 bg-teal-500 hover:bg-teal-600 text-white">
                ✅ אשר ושלח
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────
export default function ReminderAutomations() {
  const queryClient = useQueryClient();
  const todayStr = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().split('T')[0];

  // Global kill switch (default OFF = safe)
  const [globalEnabled, setGlobalEnabled] = useState(() => ls_get(GLOBAL_KEY, false));

  // Per-automation active states (default all false = safe)
  const [activeStates, setActiveStates] = useState(() => {
    const saved = ls_get(ACTIVE_KEY, {});
    const defaults = {};
    AUTOMATIONS.forEach(a => { defaults[a.id] = saved[a.id] !== undefined ? saved[a.id] : false; });
    return defaults;
  });

  // Per-automation target selection ('all' or string[])
  const [targets, setTargets] = useState(() => {
    const saved = ls_get(TARGETS_KEY, {});
    const defaults = {};
    AUTOMATIONS.forEach(a => { defaults[a.id] = saved[a.id] !== undefined ? saved[a.id] : 'all'; });
    return defaults;
  });

  const handleGlobalToggle = (val) => {
    setGlobalEnabled(val);
    ls_set(GLOBAL_KEY, val);
    toast.success(val ? '⚠️ אוטומציות הופעלו גלובלית' : '🔒 אוטומציות חסומות — לא יישלח כלום');
  };

  const handleToggle = useCallback((automationId) => {
    setActiveStates(prev => {
      const next = { ...prev, [automationId]: !prev[automationId] };
      ls_set(ACTIVE_KEY, next);
      toast.success(next[automationId] ? '✅ אוטומציה הופעלה' : '⏸ אוטומציה הושהתה');
      return next;
    });
  }, []);

  const handleTargetsChange = useCallback((automationId, val) => {
    setTargets(prev => {
      const next = { ...prev, [automationId]: val };
      ls_set(TARGETS_KEY, next);
      return next;
    });
  }, []);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  // WhatsApp connection check: use testWhatsAppConnection function
  // (WhatsAppProviderConfig is a Base44-only entity — not in the new schema)
  const { data: waStatus } = useQuery({
    queryKey: ['waConnectionStatus'],
    queryFn: () => base44.functions.invoke('testWhatsAppConnection', {}),
    staleTime: 60 * 1000,
  });
  const activeProvider = waStatus?.data?.connected ? { provider_type: 'greenapi' } : null;
  const anyProvider = activeProvider;

  const { data: trainees = [], isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['allTraineesForAutomations', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email, status: 'active' }),
    enabled: !!user?.email,
    staleTime: 2 * 60 * 60 * 1000,
    refetchInterval: 2 * 60 * 60 * 1000,
  });

  const handleRefreshAll = async () => {
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['automationStatus'] });
    toast.success('כל הנתונים עודכנו');
  };

  const activeCount = AUTOMATIONS.filter(a => activeStates[a.id]).length;
  const lastUpdate = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto p-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">אוטומציות תזכורות</h1>
            <p className="text-sm text-slate-500 mt-0.5">ניהול וניסוי האוטומציות השוטפות</p>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdate && <span className="text-xs text-slate-400">עודכן: {lastUpdate}</span>}
            <Button onClick={handleRefreshAll} disabled={isFetching} variant="outline" size="sm" className="gap-1.5 h-9">
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
              {isFetching ? 'מעדכן...' : 'רענן'}
            </Button>
          </div>
        </div>

        {/* Global Safety Toggle */}
        <Card className={`p-4 mb-4 border-2 ${globalEnabled ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {globalEnabled
                ? <Shield className="w-6 h-6 text-amber-500" />
                : <ShieldOff className="w-6 h-6 text-slate-400" />}
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  {globalEnabled ? '⚠️ מצב שליחה פעיל' : '🔒 מצב חסום — לא יישלח כלום'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {globalEnabled
                    ? `${activeCount}/${AUTOMATIONS.length} אוטומציות פועלות`
                    : 'הפעל כדי לאשר שליחת הודעות אוטומטיות'}
                </p>
              </div>
            </div>
            <Switch checked={globalEnabled} onCheckedChange={handleGlobalToggle} />
          </div>
        </Card>

        {/* WhatsApp status */}
        {activeProvider ? (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-green-800 flex items-center gap-2">
            <Wifi className="w-4 h-4 text-green-600 flex-shrink-0" />
            <span><strong>WhatsApp מחובר ✅</strong> — ספק: <span className="font-mono">{activeProvider.provider_type}</span>
              {activeProvider.phone_number_e164 && <> | מספר: <span className="font-mono">{activeProvider.phone_number_e164}</span></>}
            </span>
          </div>
        ) : anyProvider ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-amber-800 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span><strong>WhatsApp מוגדר אך לא מחובר</strong> — הודעות לא יישלחו.</span>
          </div>
        ) : (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 mb-4 text-sm text-red-800 flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-red-600 flex-shrink-0" />
            <span><strong>⚠️ WhatsApp לא מחובר</strong> — יש להגדיר Green API.</span>
          </div>
        )}

        {/* Stats */}
        {!isLoading && (
          <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 mb-5 flex items-center gap-5">
            <div className="text-center">
              <div className="text-2xl font-bold text-slate-900">{trainees.length}</div>
              <div className="text-xs text-slate-500">מתאמנים פעילים</div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-2xl font-bold text-teal-600">
                {activeCount}<span className="text-base font-normal text-slate-400">/{AUTOMATIONS.length}</span>
              </div>
              <div className="text-xs text-slate-500">אוטומציות פעילות</div>
            </div>
            <div className="h-8 w-px bg-slate-200" />
            <div className="text-center">
              <div className="text-sm font-bold text-slate-700">{todayStr}</div>
              <div className="text-xs text-slate-500">תאריך היום</div>
            </div>
          </div>
        )}

        {/* Automations */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">טוען נתונים...</div>
        ) : (
          <div className="space-y-3">
            {AUTOMATIONS.map(automation => (
              <AutomationCard
                key={automation.id}
                automation={automation}
                allTrainees={trainees}
                todayStr={todayStr}
                activeProvider={activeProvider}
                isActive={activeStates[automation.id] !== false}
                onToggle={handleToggle}
                targets={targets[automation.id]}
                onTargetsChange={(val) => handleTargetsChange(automation.id, val)}
                globalEnabled={globalEnabled}
                killSwitchActive={!globalEnabled}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}