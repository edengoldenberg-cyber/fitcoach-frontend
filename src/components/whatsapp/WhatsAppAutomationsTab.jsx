import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Play } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGER_LABELS = {
  lead_created: 'ליד חדש נוצר',
  trainee_created: 'מתאמן חדש נוצר',
  trainee_missing_meal: 'מתאמן לא עדכן ארוחה',
  trainee_missing_workout: 'מתאמן לא עדכן אימון',
  trainee_missing_water: 'מתאמן לא עדכן מים',
  birthday: 'יום הולדת',
  trial_day1: 'יום ראשון לניסיון',
  trial_day3: 'יום שלישי לניסיון',
  custom_schedule: 'לוח זמנים מותאם',
  broadcast_manual: 'שידור ידני',
};

const AUDIENCE_LABELS = {
  leads: 'לידים',
  trainees: 'מתאמנים',
  external_trainees: 'מתאמנים חיצוניים',
  all: 'כולם',
};

const DAYS_LABELS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const DEFAULT_FORM = {
  name: '',
  is_active: false,
  trigger_type: 'trainee_missing_meal',
  schedule_send_at: '20:00',
  schedule_allowed_days: [],
  audience_target_type: 'trainees',
  template_key: '',
  throttle_max_per_day: 3,
  throttle_min_minutes: 60,
};

export default function WhatsAppAutomationsTab({ coachEmail }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(DEFAULT_FORM);

  // WhatsAppAutomationRule and WhatsAppTemplate entities no longer exist in this backend.
  // Stubbed to empty arrays to prevent 400 errors. Full automation management: /WhatsAppAutomations
  const rules = [];
  const loadingRules = false;
  const templates = [];

  // Mutations stubbed — entity no longer exists. See /WhatsAppAutomations for working CRUD.
  const saveMutation = useMutation({
    mutationFn: async () => { toast.error('ניהול אוטומציות זמין ב-/WhatsAppAutomations'); },
  });
  const deleteMutation = useMutation({ mutationFn: async () => {} });
  const toggleMutation = useMutation({ mutationFn: async () => {} });

  const openNew = () => {
    setEditing(null);
    setForm(DEFAULT_FORM);
    setShowDialog(true);
  };

  const openEdit = (r) => {
    setEditing(r);
    setForm({
      name: r.name,
      is_active: r.is_active,
      trigger_type: r.trigger_type,
      schedule_send_at: r.schedule_send_at || '20:00',
      schedule_allowed_days: r.schedule_allowed_days || [],
      audience_target_type: r.audience_target_type || 'trainees',
      template_key: r.template_key,
      throttle_max_per_day: r.throttle_max_per_day || 3,
      throttle_min_minutes: r.throttle_min_minutes || 60,
    });
    setShowDialog(true);
  };

  const toggleDay = (day) => {
    setForm(f => {
      const days = f.schedule_allowed_days || [];
      return {
        ...f,
        schedule_allowed_days: days.includes(day) ? days.filter(d => d !== day) : [...days, day]
      };
    });
  };

  if (loadingRules) return <div className="p-6 text-center text-slate-500">טוען כללים...</div>;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">כללי אוטומציה</h3>
        <Button size="sm" onClick={openNew}><Plus className="w-4 h-4 ml-1" /> כלל חדש</Button>
      </div>

      {rules.length === 0 && (
        <div className="text-center py-10 text-slate-500 border-2 border-dashed rounded-xl">
          <p className="mb-2">אין כללי אוטומציה עדיין</p>
          <Button size="sm" variant="outline" onClick={openNew}>צור כלל ראשון</Button>
        </div>
      )}

      <div className="space-y-3">
        {rules.map(r => (
          <div key={r.id} className="border rounded-xl p-4 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="font-medium text-slate-800">{r.name}</span>
                  <Badge variant="outline" className="text-xs">{TRIGGER_LABELS[r.trigger_type] || r.trigger_type}</Badge>
                  <Badge variant="outline" className="text-xs">{AUDIENCE_LABELS[r.audience_target_type] || r.audience_target_type}</Badge>
                  {r.schedule_send_at && <Badge variant="secondary" className="text-xs">⏰ {r.schedule_send_at}</Badge>}
                  {!r.is_active && <Badge variant="secondary" className="text-xs">כבוי</Badge>}
                </div>
                <p className="text-xs text-slate-500">תבנית: {r.template_key || '—'}</p>
                {r.last_triggered_at && (
                  <p className="text-xs text-slate-400">הופעל לאחרונה: {new Date(r.last_triggered_at).toLocaleString('he-IL')}</p>
                )}
                {r.trigger_count > 0 && <p className="text-xs text-slate-400">הופעל {r.trigger_count} פעמים</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <Switch checked={!!r.is_active} onCheckedChange={v => toggleMutation.mutate({ id: r.id, is_active: v })} />
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Edit className="w-4 h-4" /></Button>
                <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteMutation.mutate(r.id)}><Trash2 className="w-4 h-4" /></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'עריכת כלל' : 'כלל חדש'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>שם הכלל</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="תזכורת ארוחת ערב" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>טריגר</Label>
                <Select value={form.trigger_type} onValueChange={v => setForm(f => ({ ...f, trigger_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(TRIGGER_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>קהל יעד</Label>
                <Select value={form.audience_target_type} onValueChange={v => setForm(f => ({ ...f, audience_target_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(AUDIENCE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>תבנית הודעה</Label>
              <Select value={form.template_key} onValueChange={v => setForm(f => ({ ...f, template_key: v }))}>
                <SelectTrigger><SelectValue placeholder="בחר תבנית" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => <SelectItem key={t.key} value={t.key}>{t.name} ({t.key})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>שעת שליחה</Label>
                <Input type="time" value={form.schedule_send_at} onChange={e => setForm(f => ({ ...f, schedule_send_at: e.target.value }))} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label>מקסימום הודעות ליום</Label>
                <Input type="number" min={1} max={10} value={form.throttle_max_per_day} onChange={e => setForm(f => ({ ...f, throttle_max_per_day: Number(e.target.value) }))} dir="ltr" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>ימי שליחה (ריק = כל הימים)</Label>
              <div className="flex flex-wrap gap-2">
                {DAYS_LABELS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                      (form.schedule_allowed_days || []).includes(i)
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <Label>כלל פעיל</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.name || !form.template_key}>
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}