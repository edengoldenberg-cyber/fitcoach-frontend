import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Plus, Edit2, Trash2, Play, CheckCircle2, XCircle, Clock,
  Zap, MessageSquare, Users, History, AlertCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ─── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_TYPES = [
  { value: 'manual_test',             label: 'בדיקה ידנית (Manual Test)' },
  { value: 'new_trainee_created',     label: 'מתאמן חדש נוצר' },
  { value: 'first_login',             label: 'כניסה ראשונה' },
  { value: 'daily_workout_reminder',  label: 'תזכורת אימון יומית' },
  { value: 'meal_log_reminder',       label: 'תזכורת רישום ארוחות' },
  { value: 'water_reminder',          label: 'תזכורת מים' },
  { value: 'inactive_trainee',        label: 'מתאמן לא פעיל' },
  { value: 'weekly_summary',          label: 'סיכום שבועי' },
  { value: 'custom_scheduled',        label: 'שליחה מתוזמנת מותאמת' },
];

const TARGET_TYPES = [
  { value: 'all', label: 'כל המתאמנים' },
  { value: 'one', label: 'מתאמן ספציפי (לפי טלפון)' },
];

const CONSENT_CATEGORIES = [
  { value: 'whatsapp_reminder',   label: 'תזכורות WhatsApp' },
  { value: 'workout_reminder',    label: 'תזכורות אימון' },
  { value: 'nutrition_reminder',  label: 'תזכורות תזונה' },
  { value: 'water_reminder',      label: 'תזכורות מים' },
  { value: 'inactivity_reminder', label: 'תזכורות אי-פעילות' },
];

const VARIABLE_HINTS = [
  { var: '{{trainee_name}}', desc: 'שם המתאמן' },
  { var: '{{coach_name}}',   desc: 'שם המאמן' },
  { var: '{{app_link}}',     desc: 'קישור לאפליקציה' },
  { var: '{{date}}',         desc: 'תאריך היום' },
];

const EMPTY_FORM = {
  name:             '',
  trigger_type:     'manual_test',
  message_template: 'שלום {{trainee_name}},\n\nהודעה מ-FitCoach 💪',
  target_type:      'all',
  target_phone:     '',
  schedule_config:  '',
  consent_category: 'whatsapp_reminder',
  enabled:          false,
  cooldown_hours:   24,
};

// ─── AutomationForm dialog ────────────────────────────────────────────────────

function AutomationForm({ open, onClose, editing, coachEmail, onSaved }) {
  const [form, setForm] = useState(() => editing
    ? {
        name:             editing.name,
        trigger_type:     editing.trigger_type,
        message_template: editing.message_template,
        target_type:      editing.target_type || 'all',
        target_phone:     editing.target_phone || '',
        schedule_config:  editing.schedule_config || '',
        consent_category: editing.consent_category || 'whatsapp_reminder',
        enabled:          editing.enabled || false,
        cooldown_hours:   editing.cooldown_hours ?? 24,
      }
    : EMPTY_FORM
  );

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        ...form,
        coach_email:   coachEmail,
        cooldown_hours: Number(form.cooldown_hours) || 24,
        target_phone:  form.target_type === 'one' ? form.target_phone : null,
      };
      if (editing?.id) {
        return base44.entities.WhatsAppAutomation.update(editing.id, data);
      }
      return base44.entities.WhatsAppAutomation.create(data);
    },
    onSuccess: () => {
      toast.success(editing ? 'אוטומציה עודכנה' : 'אוטומציה נוצרה');
      onSaved();
      onClose();
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  const insertVar = (v) => set('message_template', form.message_template + v);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-teal-500" />
            {editing ? 'עריכת אוטומציה' : 'אוטומציה חדשה'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Name */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">שם האוטומציה</Label>
            <Input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="לדוגמה: תזכורת אימון יומית"
              className="mt-1"
            />
          </div>

          {/* Trigger type */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">סוג טריגר</Label>
            <Select value={form.trigger_type} onValueChange={v => set('trigger_type', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TRIGGER_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Message template */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">תוכן ההודעה</Label>
            <Textarea
              value={form.message_template}
              onChange={e => set('message_template', e.target.value)}
              placeholder="הזן טקסט ההודעה..."
              rows={4}
              className="mt-1 font-mono text-sm"
            />
            <div className="flex flex-wrap gap-1.5 mt-2">
              <span className="text-xs text-slate-500">משתנים:</span>
              {VARIABLE_HINTS.map(v => (
                <button
                  key={v.var}
                  type="button"
                  onClick={() => insertVar(v.var)}
                  className="text-xs px-2 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 font-mono"
                  title={v.desc}
                >
                  {v.var}
                </button>
              ))}
            </div>
          </div>

          {/* Target */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">יעד שליחה</Label>
            <Select value={form.target_type} onValueChange={v => set('target_type', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TARGET_TYPES.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.target_type === 'one' && (
              <Input
                value={form.target_phone}
                onChange={e => set('target_phone', e.target.value)}
                placeholder="+972XXXXXXXXX"
                className="mt-2 font-mono"
                dir="ltr"
              />
            )}
          </div>

          {/* Consent category */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">קטגוריית הסכמה</Label>
            <Select value={form.consent_category} onValueChange={v => set('consent_category', v)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONSENT_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Cooldown */}
          <div>
            <Label className="text-xs font-semibold text-slate-600">מינימום שעות בין שליחות (Cooldown)</Label>
            <Input
              type="number"
              min={0}
              value={form.cooldown_hours}
              onChange={e => set('cooldown_hours', e.target.value)}
              className="mt-1 w-24"
            />
          </div>

          {/* Enabled */}
          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
            <div>
              <p className="text-sm font-medium text-slate-700">פעיל</p>
              <p className="text-xs text-slate-500">הפעל את האוטומציה</p>
            </div>
            <Switch checked={form.enabled} onCheckedChange={v => set('enabled', v)} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending || !form.name.trim() || !form.message_template.trim()}
              className="flex-1 text-white"
              style={{ backgroundColor: '#79DBD6' }}
            >
              {saveMutation.isPending ? 'שומר...' : editing ? 'שמור שינויים' : 'צור אוטומציה'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── History dialog ───────────────────────────────────────────────────────────

function HistoryDialog({ open, onClose, automationId }) {
  const { data: queue = [], isLoading } = useQuery({
    queryKey: ['automationHistory', automationId],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ context_id: automationId }),
    enabled: open && !!automationId,
  });

  const sorted = [...queue].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 20);

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-500" />
            היסטוריית שליחות
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <p className="text-center text-slate-400 py-6">טוען...</p>
        ) : sorted.length === 0 ? (
          <p className="text-center text-slate-400 py-6">אין שליחות עדיין</p>
        ) : (
          <div className="space-y-2 mt-2">
            {sorted.map(q => (
              <div key={q.id} className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg text-xs">
                <div className={`w-2 h-2 rounded-full mt-1 flex-shrink-0 ${
                  q.status === 'sent'    ? 'bg-green-500' :
                  q.status === 'failed'  ? 'bg-red-500'   :
                  q.status === 'queued'  ? 'bg-blue-400'  : 'bg-slate-300'
                }`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-slate-600 truncate">{q.to_phone_e164}</span>
                    <Badge className={`text-xs px-1.5 py-0 border-0 ${
                      q.status === 'sent'   ? 'bg-green-100 text-green-700' :
                      q.status === 'failed' ? 'bg-red-100 text-red-700'    : 'bg-blue-100 text-blue-700'
                    }`}>{q.status}</Badge>
                  </div>
                  <p className="text-slate-500 truncate mt-0.5">{q.rendered_text?.slice(0, 60)}...</p>
                  <p className="text-slate-400 mt-0.5">{new Date(q.created_at).toLocaleString('he-IL')}</p>
                  {q.error && <p className="text-red-500 mt-0.5">{q.error}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── AutomationCard ───────────────────────────────────────────────────────────

function AutomationCard({ automation, coachEmail, onEdit, onDelete, onToggle, onRefresh }) {
  const [showHistory, setShowHistory]   = useState(false);
  const [showTest, setShowTest]         = useState(false);
  const [testPhone, setTestPhone]       = useState('0535716559');
  const [testLoading, setTestLoading]   = useState(false);
  const [testResult, setTestResult]     = useState(null);

  const triggerLabel = TRIGGER_TYPES.find(t => t.value === automation.trigger_type)?.label || automation.trigger_type;

  const handleTest = async () => {
    if (!testPhone.trim()) { toast.error('הכנס מספר טלפון'); return; }
    setTestLoading(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke('testAutomationFromBuilder', {
        automation_id: automation.id,
        test_phone: testPhone.trim(),
      });
      const data = res?.data || {};
      setTestResult(data);
      if (res?.ok && data.queue_id) {
        toast.success(`✅ הודעה נשלחה — Queue ID: ${data.queue_id.slice(-8)}`);
        onRefresh();
      } else {
        toast.error('❌ ' + (res?.error || 'שגיאה'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setTestLoading(false);
    }
  };

  return (
    <>
      <Card className={`border-2 rounded-2xl overflow-hidden transition-all ${automation.enabled ? 'border-teal-200' : 'border-slate-200'}`}>
        {/* Header */}
        <div className={`px-4 py-3 ${automation.enabled ? 'bg-teal-50' : 'bg-slate-50'}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-800 text-sm">{automation.name}</h3>
                <Badge className={`text-xs px-2 py-0 border-0 ${automation.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                  {automation.enabled ? 'פעיל' : 'כבוי'}
                </Badge>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">{triggerLabel}</p>
              {automation.last_run_at && (
                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  ריצה אחרונה: {new Date(automation.last_run_at).toLocaleString('he-IL')}
                </p>
              )}
            </div>
            <Switch checked={!!automation.enabled} onCheckedChange={() => onToggle(automation)} />
          </div>

          {/* Message preview */}
          <div className="mt-2 p-2 bg-white rounded-lg border border-slate-100 text-xs text-slate-600 leading-relaxed line-clamp-2 font-mono">
            {automation.message_template}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-2 bg-white">
          <div className="flex items-center gap-1.5">
            <Badge variant="outline" className="text-xs px-2 py-0 border-slate-200 text-slate-500 gap-1">
              <Users className="w-3 h-3" />
              {automation.target_type === 'all' ? 'כולם' : automation.target_phone || 'ספציפי'}
            </Badge>
            <Badge variant="outline" className="text-xs px-2 py-0 border-slate-200 text-slate-500">
              {automation.cooldown_hours}h cooldown
            </Badge>
          </div>

          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" onClick={() => setShowHistory(true)} className="h-7 w-7 p-0 text-slate-400 hover:text-slate-600">
              <History className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onEdit(automation)} className="h-7 w-7 p-0 text-slate-400 hover:text-teal-600">
              <Edit2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onDelete(automation.id)} className="h-7 w-7 p-0 text-slate-400 hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
            <Button size="sm" onClick={() => setShowTest(true)}
              className="h-8 px-3 text-xs border-0 gap-1 bg-teal-100 hover:bg-teal-200 text-teal-800">
              <Play className="w-3 h-3" />
              שלח טסט
            </Button>
          </div>
        </div>
      </Card>

      {/* Test dialog */}
      <Dialog open={showTest} onOpenChange={v => { setShowTest(v); if (!v) setTestResult(null); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Play className="w-4 h-4 text-teal-500" />
              שלח הודעת טסט — {automation.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold">מספר טלפון לטסט</Label>
              <Input
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                placeholder="0535716559"
                dir="ltr"
                className="mt-1 font-mono"
              />
              <p className="text-xs text-slate-400 mt-1">ברירת מחדל: טלפון בדיקה (0535716559)</p>
            </div>

            {/* Message preview */}
            <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
              <p className="text-xs text-slate-500 mb-1">תצוגה מקדימה:</p>
              <p className="text-xs text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
                {automation.message_template
                  .replace(/\{\{trainee_name\}\}/g, 'מתאמן טסט')
                  .replace(/\{\{coach_name\}\}/g, 'המאמן')
                  .replace(/\{\{app_link\}\}/g, 'fitcoach...')
                  .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('he-IL'))}
              </p>
            </div>

            {testResult && (
              <div className={`rounded-lg p-3 text-xs border ${testResult.queue_id ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.queue_id ? (
                  <>
                    <div className="font-bold mb-1 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> הודעה נשלחה</div>
                    <div>Queue ID: <span className="font-mono">{testResult.queue_id.slice(-12)}</span></div>
                    <div>Worker: processed={testResult.worker?.processed}, failed={testResult.worker?.failed}</div>
                    {testResult.duplicate && <div className="text-amber-600 mt-1">⚠️ כפיל — כבר נשלח בדקה זו</div>}
                  </>
                ) : (
                  <div className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" /> {testResult.error || 'שגיאה'}</div>
                )}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setShowTest(false)} className="flex-1">סגור</Button>
              <Button
                onClick={handleTest}
                disabled={testLoading}
                className="flex-1 text-white"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {testLoading ? '⏳ שולח...' : '▶ שלח'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <HistoryDialog open={showHistory} onClose={() => setShowHistory(false)} automationId={automation.id} />
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function WhatsAppAutomations() {
  const queryClient  = useQueryClient();
  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn:  () => base44.auth.me(),
  });

  const { data: automations = [], isLoading, refetch } = useQuery({
    queryKey: ['whatsappAutomations', user?.email],
    queryFn:  () => base44.entities.WhatsAppAutomation.filter({ coach_email: user?.email }),
    enabled:  !!user?.email,
  });

  const { data: waStatus } = useQuery({
    queryKey: ['waStatusAutomations'],
    queryFn:  () => base44.functions.invoke('testWhatsAppConnection', {}),
    staleTime: 60000,
  });
  const waConnected = waStatus?.data?.connected;

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WhatsAppAutomation.delete(id),
    onSuccess:  () => { queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] }); toast.success('נמחק'); },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, enabled }) => base44.entities.WhatsAppAutomation.update(id, { enabled: !enabled }),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] }),
  });

  const openEdit = (a) => { setEditing(a); setShowForm(true); };
  const openCreate = () => { setEditing(null); setShowForm(true); };
  const handleSaved = () => queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] });

  const enabledCount = automations.filter(a => a.enabled).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">אוטומציות WhatsApp</h1>
            <p className="text-sm text-slate-500">
              {automations.length} אוטומציות • {enabledCount} פעילות
            </p>
          </div>
          <Button onClick={openCreate} className="gap-1.5 text-white" style={{ backgroundColor: '#79DBD6' }}>
            <Plus className="w-4 h-4" />
            חדש
          </Button>
        </div>

        {/* WhatsApp status banner */}
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs border ${waConnected ? 'bg-green-50 border-green-200 text-green-700' : 'bg-amber-50 border-amber-200 text-amber-700'}`}>
          <div className={`w-2 h-2 rounded-full ${waConnected ? 'bg-green-500' : 'bg-amber-400'}`} />
          {waConnected ? '✅ WhatsApp מחובר — Green API' : '⚠️ WhatsApp לא מחובר'}
          <Button size="sm" variant="ghost" onClick={() => refetch()} className="h-6 px-2 mr-auto text-slate-400">
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {/* Info card */}
        <Card className="p-3 bg-blue-50 border-blue-200">
          <div className="flex gap-2">
            <AlertCircle className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-xs text-blue-700">
              <p className="font-semibold mb-0.5">איך זה עובד:</p>
              <p>כל שליחה עוברת דרך תור (Queue) → עובד (Worker) → Green API. כפיל נחסם על-ידי מפתח Idempotency.</p>
              <p className="mt-0.5">המשתנים <span className="font-mono">{'{{trainee_name}}'}</span> ו-<span className="font-mono">{'{{date}}'}</span> מוחלפים אוטומטית.</p>
            </div>
          </div>
        </Card>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">טוען...</div>
        ) : automations.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center">
            <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">אין אוטומציות עדיין</p>
            <p className="text-slate-400 text-sm mt-1">לחץ על "חדש" כדי ליצור</p>
            <Button onClick={openCreate} className="mt-4 gap-1.5 text-white" style={{ backgroundColor: '#79DBD6' }}>
              <Plus className="w-4 h-4" />
              צור אוטומציה ראשונה
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {automations.map(a => (
              <AutomationCard
                key={a.id}
                automation={a}
                coachEmail={user?.email}
                onEdit={openEdit}
                onDelete={(id) => { if (confirm('למחוק?')) deleteMutation.mutate(id); }}
                onToggle={(auto) => toggleMutation.mutate({ id: auto.id, enabled: auto.enabled })}
                onRefresh={() => queryClient.invalidateQueries({ queryKey: ['whatsappAutomations'] })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Form dialog */}
      {showForm && (
        <AutomationForm
          open={showForm}
          onClose={() => { setShowForm(false); setEditing(null); }}
          editing={editing}
          coachEmail={user?.email}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
