import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Zap, Plus, Edit2, Trash2, ShieldOff, Shield, Users, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { toast } from 'sonner';

const TRIGGER_LABELS = {
  noAttendance: { label: 'לא הגיע', emoji: '🏃' },
  birthday: { label: 'יום הולדת', emoji: '🎂' },
  lowAttendance: { label: 'נוכחות נמוכה', emoji: '📉' },
  noWorkoutLog: { label: 'לא מילא אימון', emoji: '💪' },
  noNutritionLog: { label: 'לא מילא תזונה', emoji: '🥗' },
};

const DELIVERY_LABELS = {
  internal: { label: 'פנימי', color: 'bg-blue-100 text-blue-700' },
  whatsapp: { label: 'WhatsApp', color: 'bg-green-100 text-green-700' },
  push: { label: 'Push', color: 'bg-purple-100 text-purple-700' },
};

const DEFAULT_RULES = [
  { name: 'לא הגיע שבוע', triggerType: 'noAttendance', delayDays: 7, deliveryType: 'internal', messageTemplate: 'היי {name}\nלא ראינו אותך השבוע 💪\nמחכים לך באימון הבא' },
  { name: 'יום הולדת', triggerType: 'birthday', delayDays: 0, deliveryType: 'internal', messageTemplate: 'מזל טוב {name} 🎉\nמאחלים לך שנה של בריאות וכושר' },
  { name: 'לא מילא אימון', triggerType: 'noWorkoutLog', delayDays: 2, deliveryType: 'internal', messageTemplate: 'היי {name}\nלא מילאת אימונים לאחרונה\nיאללה חוזרים להתקדם 💪' },
  { name: 'לא מילא תזונה', triggerType: 'noNutritionLog', delayDays: 2, deliveryType: 'internal', messageTemplate: 'היי {name}\nאל תשכח למלא תזונה היום 📊' },
];

const EMPTY_FORM = {
  name: '',
  triggerType: 'noNutritionLog',
  delayDays: '2',
  deliveryType: 'internal',
  messageTemplate: '',
  target_mode: 'all',
  target_trainee_emails: [],
};

export default function CoachAutomations() {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [expandedTargets, setExpandedTargets] = useState({});
  // Global safety toggle — stored in localStorage, defaults to OFF (safe)
  const [globalEnabled, setGlobalEnabled] = useState(() =>
    localStorage.getItem('automations_global_enabled') === 'true'
  );

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: rules = [], isLoading } = useQuery({
    queryKey: ['automationRules', user?.email],
    queryFn: () => base44.entities.AutomationRule.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['traineesForAutomations', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingRule) {
        await base44.entities.AutomationRule.update(editingRule.id, data);
      } else {
        await base44.entities.AutomationRule.create({ coach_email: user.email, isActive: false, ...data });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      toast.success(editingRule ? 'עודכן בהצלחה' : 'נוצר כלל חדש');
      closeDialog();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.AutomationRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      toast.success('נמחק');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }) => base44.entities.AutomationRule.update(id, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['automationRules'] }),
  });

  const importDefaultsMutation = useMutation({
    mutationFn: async () => {
      for (const r of DEFAULT_RULES) {
        await base44.entities.AutomationRule.create({ coach_email: user.email, isActive: false, isDefault: true, ...r });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      toast.success('✅ כללי ברירת מחדל נוצרו (כבויים)');
    },
  });

  const handleGlobalToggle = (val) => {
    setGlobalEnabled(val);
    localStorage.setItem('automations_global_enabled', val ? 'true' : 'false');
    toast.success(val ? '⚠️ אוטומציות הופעלו גלובלית' : '🔒 אוטומציות נחסמו — לא יישלח כלום');
  };

  const openCreate = () => {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  };

  const openEdit = (rule) => {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      triggerType: rule.triggerType,
      delayDays: String(rule.delayDays ?? 0),
      deliveryType: rule.deliveryType || 'internal',
      messageTemplate: rule.messageTemplate,
      target_mode: rule.target_mode || 'all',
      target_trainee_emails: rule.target_trainee_emails || [],
    });
    setShowDialog(true);
  };

  const closeDialog = () => {
    setShowDialog(false);
    setEditingRule(null);
    setForm(EMPTY_FORM);
  };

  const handleSave = () => {
    if (!form.name.trim() || !form.messageTemplate.trim()) {
      toast.error('שם והודעה הם שדות חובה');
      return;
    }
    saveMutation.mutate({
      name: form.name,
      triggerType: form.triggerType,
      delayDays: parseInt(form.delayDays) || 0,
      deliveryType: form.deliveryType,
      messageTemplate: form.messageTemplate,
      target_mode: form.target_mode,
      target_trainee_emails: form.target_mode === 'selected' ? form.target_trainee_emails : [],
    });
  };

  const toggleTraineeTarget = (email) => {
    setForm(prev => ({
      ...prev,
      target_trainee_emails: prev.target_trainee_emails.includes(email)
        ? prev.target_trainee_emails.filter(e => e !== email)
        : [...prev.target_trainee_emails, email],
    }));
  };

  const activeCount = rules.filter(r => r.isActive).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto p-4">

        {/* Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-slate-800">אוטומציות</h1>
          <p className="text-sm text-slate-500 mt-0.5">הודעות אוטומטיות למתאמנים</p>
        </div>

        {/* Global Safety Toggle */}
        <Card className={`p-4 mb-5 border-2 ${globalEnabled ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {globalEnabled
                ? <Shield className="w-6 h-6 text-amber-500" />
                : <ShieldOff className="w-6 h-6 text-slate-400" />
              }
              <div>
                <p className="font-bold text-slate-800 text-sm">
                  {globalEnabled ? '⚠️ אוטומציות פעילות' : '🔒 אוטומציות חסומות'}
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {globalEnabled
                    ? `${activeCount} כללים פועלים — הודעות נשלחות`
                    : 'כרגע לא יישלח כלום — הפעל כדי להתחיל'}
                </p>
              </div>
            </div>
            <Switch checked={globalEnabled} onCheckedChange={handleGlobalToggle} />
          </div>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-2 mb-5">
          <Button onClick={openCreate} className="flex-1 gap-2" style={{ backgroundColor: '#79DBD6' }}>
            <Plus className="w-4 h-4" />
            כלל חדש
          </Button>
          {rules.length === 0 && (
            <Button onClick={() => importDefaultsMutation.mutate()} variant="outline" className="flex-1 gap-2" disabled={importDefaultsMutation.isPending}>
              📥 {importDefaultsMutation.isPending ? 'מייבא...' : 'ייבא ברירות מחדל'}
            </Button>
          )}
        </div>

        {/* Rules List */}
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">טוען...</div>
        ) : rules.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-2 border-slate-200">
            <Zap className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">אין כללים עדיין</p>
            <p className="text-sm text-slate-400 mt-1">צור כלל חדש או ייבא ברירות מחדל</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rules.map(rule => {
              const trigger = TRIGGER_LABELS[rule.triggerType] || { label: rule.triggerType, emoji: '⚡' };
              const delivery = DELIVERY_LABELS[rule.deliveryType] || DELIVERY_LABELS.internal;
              const targetCount = rule.target_mode === 'selected' ? rule.target_trainee_emails?.length ?? 0 : trainees.length;
              const showTargets = expandedTargets[rule.id];

              return (
                <Card key={rule.id} className={`p-4 border-2 transition-all ${rule.isActive && globalEnabled ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200 bg-white'}`}>
                  {/* Top row */}
                  <div className="flex items-start gap-3">
                    <div className="text-2xl mt-0.5">{trigger.emoji}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-800 text-sm">{rule.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${delivery.color}`}>
                          {delivery.label}
                        </span>
                        {rule.delayDays > 0 && (
                          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {rule.delayDays}ד׳ השהייה
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{trigger.label}</p>
                      <p className="text-xs text-slate-600 mt-1.5 bg-slate-50 rounded-lg p-2 whitespace-pre-line line-clamp-2">
                        {rule.messageTemplate}
                      </p>
                    </div>
                    {/* Toggle */}
                    <Switch
                      checked={!!rule.isActive}
                      onCheckedChange={(val) => toggleMutation.mutate({ id: rule.id, isActive: val })}
                    />
                  </div>

                  {/* Bottom row */}
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                    <button
                      onClick={() => setExpandedTargets(prev => ({ ...prev, [rule.id]: !prev[rule.id] }))}
                      className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
                    >
                      <Users className="w-3.5 h-3.5" />
                      {rule.target_mode === 'selected' ? `${targetCount} נבחרים` : `כל המתאמנים (${targetCount})`}
                      {showTargets ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(rule)} className="h-7 px-2 text-blue-600 hover:text-blue-700">
                        <Edit2 className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteMutation.mutate(rule.id)} className="h-7 px-2 text-red-500 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Trainee target list (collapsed) */}
                  {showTargets && rule.target_mode === 'selected' && (
                    <div className="mt-2 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1">
                      {(rule.target_trainee_emails || []).map(email => {
                        const t = trainees.find(tr => tr.user_email === email);
                        return <div key={email} className="bg-slate-50 px-2 py-1 rounded">{t?.full_name || email}</div>;
                      })}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5" style={{ color: '#79DBD6' }} />
              {editingRule ? 'עריכת כלל' : 'כלל חדש'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1">שם הכלל *</label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="לדוגמה: תזכורת ארוחת בוקר" />
            </div>

            {/* Trigger + Delay */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">טריגר</label>
                <Select value={form.triggerType} onValueChange={v => setForm(f => ({ ...f, triggerType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent dir="rtl">
                    {Object.entries(TRIGGER_LABELS).map(([key, { label, emoji }]) => (
                      <SelectItem key={key} value={key}>{emoji} {label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-semibold text-slate-700 block mb-1">השהייה (ימים)</label>
                <Input type="number" min="0" value={form.delayDays} onChange={e => setForm(f => ({ ...f, delayDays: e.target.value }))} />
              </div>
            </div>

            {/* Delivery */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1">אופן שליחה</label>
              <Select value={form.deliveryType} onValueChange={v => setForm(f => ({ ...f, deliveryType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent dir="rtl">
                  {Object.entries(DELIVERY_LABELS).map(([key, { label }]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Message */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-1">הודעה *</label>
              <Textarea
                value={form.messageTemplate}
                onChange={e => setForm(f => ({ ...f, messageTemplate: e.target.value }))}
                rows={4}
                placeholder={'היי {name}\n...'}
                className="rounded-xl border-2 border-slate-200 focus:border-teal-400 p-3 text-sm"
              />
              <p className="text-xs text-slate-400 mt-1">השתמש ב-{'{name}'} לשם המתאמן</p>
            </div>

            {/* Target */}
            <div>
              <label className="text-sm font-semibold text-slate-700 block mb-2">שלח ל...</label>
              <div className="flex gap-2 mb-3">
                <button
                  onClick={() => setForm(f => ({ ...f, target_mode: 'all' }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${form.target_mode === 'all' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
                >
                  כל המתאמנים ({trainees.length})
                </button>
                <button
                  onClick={() => setForm(f => ({ ...f, target_mode: 'selected' }))}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${form.target_mode === 'selected' ? 'border-teal-400 bg-teal-50 text-teal-700' : 'border-slate-200 text-slate-600'}`}
                >
                  נבחרים
                </button>
              </div>

              {form.target_mode === 'selected' && (
                <div className="max-h-48 overflow-y-auto space-y-1 border border-slate-200 rounded-xl p-2">
                  {trainees.map(t => {
                    const selected = form.target_trainee_emails.includes(t.user_email);
                    return (
                      <button
                        key={t.id}
                        onClick={() => toggleTraineeTarget(t.user_email)}
                        className={`w-full flex items-center gap-2 p-2 rounded-lg text-sm text-right transition-all ${selected ? 'bg-teal-50 text-teal-800' : 'hover:bg-slate-50 text-slate-700'}`}
                      >
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${selected ? 'border-teal-400 bg-teal-400' : 'border-slate-300'}`}>
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </div>
                        <span className="flex-1">{t.full_name}</span>
                        <span className="text-xs text-slate-400">{t.user_email}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Buttons */}
            <div className="flex gap-2 pt-1">
              <Button variant="outline" onClick={closeDialog} className="flex-1">ביטול</Button>
              <Button onClick={handleSave} disabled={saveMutation.isPending} className="flex-1 gap-2" style={{ backgroundColor: '#79DBD6' }}>
                {saveMutation.isPending ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}