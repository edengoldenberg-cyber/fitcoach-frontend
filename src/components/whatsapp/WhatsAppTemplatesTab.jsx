import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Edit, Trash2, Send, Eye, CheckCircle } from 'lucide-react';
import SendTemplateNowDialog from './SendTemplateNowDialog';
import { toast } from 'sonner';

const VARIABLES = ['{{firstName}}', '{{fullName}}', '{{coachName}}', '{{studioName}}', '{{phone}}', '{{todayDate}}', '{{link}}', '{{missingType}}'];
const CATEGORIES = { lead: 'ליד', reminder: 'תזכורת', birthday: 'יום הולדת', motivation: 'מוטיבציה', system: 'מערכת' };

const PREVIEW_VARS = {
  firstName: 'ישראל',
  fullName: 'ישראל ישראלי',
  coachName: 'המאמן שלי',
  studioName: 'שייפ סטודיו',
  phone: '+9725XXXXXXXX',
  todayDate: new Date().toLocaleDateString('he-IL'),
  link: 'https://fitcoach.pro',
  missingType: 'ארוחת ערב',
};

function renderPreview(text) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => PREVIEW_VARS[key] ?? `{{${key}}}`);
}

export default function WhatsAppTemplatesTab({ coachEmail, coachPhone, onOpenDiagnostics }) {
  const queryClient = useQueryClient();
  const [showDialog, setShowDialog] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ key: '', name: '', message_text: '', category: 'system', is_active: true });
  const [sendingTemplate, setSendingTemplate] = useState(null);
  const [sendToSelf, setSendToSelf] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['whatsappTemplates', coachEmail],
    queryFn: () => base44.entities.WhatsAppTemplate.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editing?.id) return base44.entities.WhatsAppTemplate.update(editing.id, data);
      return base44.entities.WhatsAppTemplate.create({ ...data, coach_email: coachEmail });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsappTemplates', coachEmail] });
      setShowDialog(false);
      setEditing(null);
      toast.success('תבנית נשמרה');
    },
    onError: (e) => toast.error('שגיאה: ' + e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.WhatsAppTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsappTemplates', coachEmail] });
      toast.success('תבנית נמחקה');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.WhatsAppTemplate.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['whatsappTemplates', coachEmail] }),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ key: '', name: '', message_text: '', category: 'system', is_active: true });
    setShowDialog(true);
  };

  const openEdit = (t) => {
    setEditing(t);
    setForm({ key: t.key, name: t.name, message_text: t.message_text, category: t.category || 'system', is_active: t.is_active });
    setShowDialog(true);
  };

  const insertVar = (v) => {
    setForm(f => ({ ...f, message_text: f.message_text + v }));
  };

  if (isLoading) return <div className="p-6 text-center text-slate-500">טוען תבניות...</div>;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-slate-800">תבניות הודעות</h3>
        <Button size="sm" onClick={openNew}>
          <Plus className="w-4 h-4 ml-1" /> תבנית חדשה
        </Button>
      </div>

      {templates.length === 0 && (
        <div className="text-center py-10 text-slate-500 border-2 border-dashed rounded-xl">
          <p className="mb-2">אין תבניות עדיין</p>
          <Button size="sm" variant="outline" onClick={openNew}>צור תבנית ראשונה</Button>
        </div>
      )}

      <div className="space-y-3">
        {templates.map(t => (
          <div key={t.id} className="border rounded-xl p-4 bg-white flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-slate-800">{t.name}</span>
                <Badge variant="outline" className="text-xs">{t.key}</Badge>
                <Badge className="text-xs">{CATEGORIES[t.category] || t.category}</Badge>
                {!t.is_active && <Badge variant="secondary" className="text-xs">לא פעיל</Badge>}
              </div>
              <p className="text-sm text-slate-600 truncate">{t.message_text}</p>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <Switch checked={!!t.is_active} onCheckedChange={v => toggleMutation.mutate({ id: t.id, is_active: v })} />
              <Button size="icon" variant="ghost" title="תצוגה מקדימה" onClick={() => setPreviewTemplate(t)}><Eye className="w-4 h-4 text-slate-500" /></Button>
              <Button size="icon" variant="ghost" title="שלח לעצמי" onClick={() => { setSendToSelf(true); setSendingTemplate(t); }}>
                <CheckCircle className="w-4 h-4 text-teal-600" />
              </Button>
              <Button size="icon" variant="ghost" title="שלח עכשיו" onClick={() => { setSendToSelf(false); setSendingTemplate(t); }}>
                <Send className="w-4 h-4 text-green-600" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => openEdit(t)}><Edit className="w-4 h-4" /></Button>
              <Button size="icon" variant="ghost" className="text-red-500" onClick={() => deleteMutation.mutate(t.id)}><Trash2 className="w-4 h-4" /></Button>
            </div>
          </div>
        ))}
      </div>

      {/* Preview Dialog */}
      {previewTemplate && (
        <Dialog open onOpenChange={() => setPreviewTemplate(null)}>
          <DialogContent dir="rtl" className="max-w-sm">
            <DialogHeader>
              <DialogTitle>👁️ תצוגה מקדימה — {previewTemplate.name}</DialogTitle>
            </DialogHeader>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <p className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">
                {renderPreview(previewTemplate.message_text)}
              </p>
            </div>
            <p className="text-xs text-slate-400 text-center">מוצג עם נתוני דוגמה</p>
          </DialogContent>
        </Dialog>
      )}

      {sendingTemplate && (
        <SendTemplateNowDialog
          template={sendingTemplate}
          coachEmail={coachEmail}
          coachSelf={sendToSelf ? coachPhone : null}
          onClose={() => { setSendingTemplate(null); setSendToSelf(false); }}
          onOpenDiagnostics={onOpenDiagnostics}
        />
      )}

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? 'עריכת תבנית' : 'תבנית חדשה'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>מפתח (key)</Label>
                <Input value={form.key} onChange={e => setForm(f => ({ ...f, key: e.target.value }))} placeholder="lead_welcome" dir="ltr" disabled={!!editing} />
              </div>
              <div className="space-y-1">
                <Label>קטגוריה</Label>
                <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>שם תבנית</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="ברוכים הבאים" />
            </div>
            <div className="space-y-1">
              <Label>טקסט ההודעה</Label>
              <Textarea
                value={form.message_text}
                onChange={e => setForm(f => ({ ...f, message_text: e.target.value }))}
                rows={5}
                placeholder="כתוב הודעה כאן..."
              />
              <div className="flex flex-wrap gap-1 mt-1">
                {VARIABLES.map(v => (
                  <button key={v} onClick={() => insertVar(v)} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded hover:bg-blue-200">
                    {v}
                  </button>
                ))}
              </div>
            </div>
            {form.message_text && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <p className="text-xs text-green-600 font-medium mb-1">תצוגה מקדימה:</p>
                <p className="text-sm text-green-800 whitespace-pre-wrap">{renderPreview(form.message_text)}</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <Label>תבנית פעילה</Label>
              <Switch checked={form.is_active} onCheckedChange={v => setForm(f => ({ ...f, is_active: v }))} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowDialog(false)}>ביטול</Button>
              <Button onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending || !form.key || !form.name || !form.message_text}>
                שמור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}