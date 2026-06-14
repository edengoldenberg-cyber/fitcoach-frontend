import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Send, Users, CheckSquare, Square, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

const STATUS_COLORS = {
  queued: 'bg-yellow-100 text-yellow-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-500',
};

const PREVIEW_VARS = {
  firstName: 'ישראל', fullName: 'ישראל ישראלי', coachName: 'המאמן', studioName: 'הסטודיו',
  phone: '+972500000000', todayDate: new Date().toLocaleDateString('he-IL'), link: 'https://fitcoach.pro', missingType: 'ארוחה',
};

function renderPreview(text, vars = PREVIEW_VARS) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

function normalizePhone(raw) {
  let phone = (raw || '').trim();
  if (!phone) return null;
  if (!phone.startsWith('+')) {
    if (phone.startsWith('0')) phone = '+972' + phone.slice(1);
    else phone = '+' + phone;
  }
  return /^\+[1-9]\d{7,14}$/.test(phone) ? phone : null;
}

export default function WhatsAppBulkSendTab({ coachEmail }) {
  const queryClient = useQueryClient();
  const [audienceType, setAudienceType] = useState('trainees');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [templateKey, setTemplateKey] = useState('');
  const [sending, setSending] = useState(false);
  const [lastBatchIds, setLastBatchIds] = useState([]);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: trainees = [] } = useQuery({
    queryKey: ['traineesForBulk', coachEmail],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const { data: leads = [] } = useQuery({
    queryKey: ['leadsForBulk', coachEmail],
    queryFn: () => base44.entities.Lead.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['whatsappTemplates', coachEmail],
    queryFn: () => base44.entities.WhatsAppTemplate.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
    select: data => data.filter(t => t.is_active),
  });

  const { data: config } = useQuery({
    queryKey: ['whatsappConfig', coachEmail],
    queryFn: () => base44.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
    select: data => data[0],
  });

  const { data: batchQueue = [], refetch: refetchBatch } = useQuery({
    queryKey: ['bulkQueue', lastBatchIds],
    queryFn: async () => {
      if (!lastBatchIds.length) return [];
      const all = await base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail });
      return all.filter(q => lastBatchIds.includes(q.id));
    },
    enabled: lastBatchIds.length > 0,
    refetchInterval: lastBatchIds.length > 0 ? 3000 : false,
  });

  const contacts = useMemo(() => {
    if (audienceType === 'trainees') {
      return trainees
        .filter(t => t.status === 'active' && t.phone)
        .map(t => ({
          id: t.id,
          name: t.full_name || t.user_email,
          phone: t.phone,
          subtitle: t.user_email,
          type: 'trainee',
        }));
    }
    if (audienceType === 'active_trainees') {
      return trainees
        .filter(t => t.status === 'active' && t.phone)
        .map(t => ({
          id: t.id,
          name: t.full_name || t.user_email,
          phone: t.phone,
          subtitle: 'פעיל',
          type: 'trainee',
        }));
    }
    if (audienceType === 'leads') {
      return leads
        .filter(l => l.phone)
        .map(l => ({
          id: l.id,
          name: `${l.firstName || ''} ${l.lastName || ''}`.trim() || l.phone,
          phone: l.phone,
          subtitle: `ליד · ${l.status || 'new'}`,
          type: 'lead',
        }));
    }
    return [];
  }, [audienceType, trainees, leads]);

  const toggleContact = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedIds(new Set(contacts.map(c => c.id)));
  const clearAll = () => setSelectedIds(new Set());

  const selectedTemplate = templates.find(t => t.key === templateKey);

  const handleSend = async () => {
    if (!templateKey || selectedIds.size === 0) return;
    setSending(true);
    setLastBatchIds([]);

    const providerType = config?.provider_type || 'mock';
    const selected = contacts.filter(c => selectedIds.has(c.id));
    const newIds = [];
    const errors = [];
    // One UUID per bulk-send operation; each message gets a unique recipient-scoped key.
    // The backend can use idempotency_key to reject duplicates once the field is added to the schema.
    const batchId = crypto.randomUUID();

    for (const contact of selected) {
      const phone = normalizePhone(contact.phone);
      if (!phone) continue;

      const firstName = contact.name.split(' ')[0];
      const vars = {
        firstName,
        fullName: contact.name,
        phone,
        coachName: coachEmail?.split('@')[0] || '',
        todayDate: new Date().toLocaleDateString('he-IL'),
      };
      const renderedText = renderPreview(selectedTemplate?.message_text || '', vars);

      try {
        const record = await base44.entities.WhatsAppMessageQueue.create({
          coach_email: coachEmail,
          to_phone_e164: phone,
          to_name: contact.name,
          context_type: contact.type,
          context_id: contact.id,
          template_key: templateKey,
          rendered_text: renderedText,
          provider_type: providerType,
          status: 'queued',
          attempts: 0,
          scheduled_for: new Date().toISOString(),
          batch_id: batchId,
          idempotency_key: `${batchId}:${phone}`,
        });
        newIds.push(record.id);
      } catch (err) {
        errors.push({ contact, error: err.message });
      }
    }

    setLastBatchIds(newIds);
    setSending(false);

    // trigger worker
    try {
      await base44.functions.invoke('whatsAppQueueWorker', {});
    } catch (_) {}

    if (errors.length > 0) {
      toast.error(`${errors.length} נכשלו מתוך ${selected.length}. ${newIds.length} הודעות בתור.`);
    } else {
      toast.success(`נוספו ${newIds.length} הודעות לתור. Worker מעבד...`);
    }
    setSelectedIds(new Set());
    refetchBatch();
  };

  const sentCount = batchQueue.filter(q => q.status === 'sent').length;
  const failedCount = batchQueue.filter(q => q.status === 'failed').length;
  const pendingCount = batchQueue.filter(q => ['queued', 'sending'].includes(q.status)).length;

  return (
    <div className="p-4 space-y-4" dir="rtl">
      {/* Audience + Template */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Users className="w-4 h-4 text-teal-500" /> 1. בחר קהל יעד
        </h3>
        <div className="grid grid-cols-3 gap-2">
          {[
            { value: 'trainees', label: 'מתאמנים' },
            { value: 'active_trainees', label: 'פעילים בלבד' },
            { value: 'leads', label: 'לידים' },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => { setAudienceType(opt.value); setSelectedIds(new Set()); }}
              className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                audienceType === opt.value
                  ? 'bg-teal-500 text-white border-teal-500'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Contacts list */}
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b bg-slate-50">
          <span className="text-sm font-medium text-slate-700">{contacts.length} אנשי קשר · נבחרו {selectedIds.size}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={selectAll} className="gap-1 text-xs">
              <CheckSquare className="w-3 h-3" /> בחר הכל
            </Button>
            <Button size="sm" variant="outline" onClick={clearAll} className="gap-1 text-xs">
              <Square className="w-3 h-3" /> נקה
            </Button>
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto divide-y">
          {contacts.length === 0 && (
            <div className="text-center py-8 text-slate-400 text-sm">אין אנשי קשר עם מספר טלפון</div>
          )}
          {contacts.map(c => {
            const phone = normalizePhone(c.phone);
            return (
              <div
                key={c.id}
                className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-slate-50 transition-colors ${selectedIds.has(c.id) ? 'bg-teal-50' : ''}`}
                onClick={() => toggleContact(c.id)}
              >
                <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleContact(c.id)} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 truncate">{c.name}</span>
                    {!phone && <Badge className="text-xs bg-red-100 text-red-600">טלפון לא תקין</Badge>}
                  </div>
                  <span className="text-xs text-slate-400">{c.phone}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Template selection */}
      <div className="bg-white border rounded-xl p-4 space-y-3">
        <h3 className="font-semibold text-slate-800">2. בחר תבנית</h3>
        <Select value={templateKey} onValueChange={setTemplateKey}>
          <SelectTrigger><SelectValue placeholder="בחר תבנית הודעה" /></SelectTrigger>
          <SelectContent>
            {templates.map(t => <SelectItem key={t.key} value={t.key}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {selectedTemplate && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-green-600 font-medium mb-1">תצוגה מקדימה:</p>
            <p className="text-sm text-green-800 whitespace-pre-wrap">{renderPreview(selectedTemplate.message_text)}</p>
          </div>
        )}
      </div>

      {/* Send button — requires confirmation for > 5 recipients */}
      <Button
        className="w-full gap-2 h-12 text-base"
        style={{ backgroundColor: '#25D366' }}
        disabled={selectedIds.size === 0 || !templateKey || sending}
        onClick={() => selectedIds.size > 5 ? setConfirmOpen(true) : handleSend()}
      >
        <Send className="w-5 h-5" />
        {sending ? 'מכניס לתור...' : `שלח ל-${selectedIds.size} אנשי קשר`}
      </Button>

      {/* Bulk send confirmation dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              אישור שליחה מרובה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-slate-700">
            <p>עומד לשלוח הודעות ל-<strong>{selectedIds.size} אנשי קשר</strong>.</p>
            <p className="text-xs text-slate-500">תבנית: {templates.find(t => t.key === templateKey)?.name || templateKey}</p>
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
              לידים עם Opt-out יסוננו אוטומטית לפני השליחה.
            </p>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)} className="flex-1">ביטול</Button>
            <Button
              className="flex-1 gap-1"
              style={{ backgroundColor: '#25D366' }}
              onClick={() => { setConfirmOpen(false); handleSend(); }}
            >
              <Send className="w-4 h-4" /> אשר ושלח
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Batch status */}
      {lastBatchIds.length > 0 && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-slate-800">סטטוס שליחה</h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-green-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-green-600">{sentCount}</div>
              <div className="text-xs text-green-500">נשלח</div>
            </div>
            <div className="bg-yellow-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-yellow-600">{pendingCount}</div>
              <div className="text-xs text-yellow-500">ממתין</div>
            </div>
            <div className="bg-red-50 rounded-xl p-3">
              <div className="text-2xl font-bold text-red-600">{failedCount}</div>
              <div className="text-xs text-red-500">נכשל</div>
            </div>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {batchQueue.map(q => (
              <div key={q.id} className="flex items-center justify-between text-sm border rounded-lg px-3 py-2">
                <span className="font-medium text-slate-700 truncate">{q.to_name}</span>
                <Badge className={`text-xs ${STATUS_COLORS[q.status] || 'bg-slate-100'}`}>{q.status}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}