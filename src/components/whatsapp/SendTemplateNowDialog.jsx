import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Send, Eye, Loader2, ExternalLink } from 'lucide-react';

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

function renderText(text, vars) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
}

export default function SendTemplateNowDialog({ template, coachEmail, coachSelf, onClose, onOpenDiagnostics }) {
  const [recipientType, setRecipientType] = useState(coachSelf ? 'self' : 'trainee');
  const [selectedTraineeId, setSelectedTraineeId] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [vars, setVars] = useState({ ...PREVIEW_VARS });
  const [loading, setLoading] = useState(false);
  const [sentMessageId, setSentMessageId] = useState(null);

  const usedVars = [...new Set((template?.message_text || '').match(/\{\{(\w+)\}\}/g)?.map(v => v.slice(2, -2)) || [])];
  const preview = renderText(template?.message_text || '', vars);

  const { data: trainees = [] } = useQuery({
    queryKey: ['traineesForSend', coachEmail],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail && recipientType === 'trainee',
  });

  const { data: selfUser } = useQuery({
    queryKey: ['selfUser'],
    queryFn: () => base44.auth.me(),
    enabled: recipientType === 'self',
  });

  // Auto-fill vars when trainee selected
  useEffect(() => {
    if (recipientType === 'trainee' && selectedTraineeId) {
      const t = trainees.find(t => t.id === selectedTraineeId);
      if (t) {
        const firstName = t.full_name?.split(' ')[0] || t.full_name || '';
        setVars(prev => ({
          ...prev,
          firstName,
          fullName: t.full_name || '',
          phone: t.phone || prev.phone,
        }));
      }
    }
    if (recipientType === 'self' && selfUser) {
      const firstName = selfUser.full_name?.split(' ')[0] || '';
      setVars(prev => ({
        ...prev,
        firstName,
        fullName: selfUser.full_name || '',
      }));
    }
  }, [selectedTraineeId, recipientType, trainees, selfUser]);

  const getPhone = () => {
    if (recipientType === 'self') return selfUser?.phone || coachSelf || '';
    if (recipientType === 'trainee') {
      const t = trainees.find(t => t.id === selectedTraineeId);
      return t?.phone || '';
    }
    return manualPhone;
  };

  const toE164 = (phone) => {
    if (!phone) return '';
    const clean = phone.replace(/\s/g, '');
    if (clean.startsWith('+')) return clean;
    return '+972' + clean.replace(/^0/, '');
  };

  const handleSend = async () => {
    const rawPhone = getPhone();
    if (!rawPhone) return toast.error('נא להזין / לבחור מספר טלפון');
    const phone = toE164(rawPhone);

    const selectedTrainee = trainees.find(t => t.id === selectedTraineeId);

    setLoading(true);
    try {
      const res = await base44.functions.invoke('enqueueWhatsAppMessage', {
        coachEmail,
        toPhoneE164: phone,
        toName: vars.fullName || vars.firstName || '',
        templateKey: template.key,
        templateVars: vars,
        contextType: selectedTrainee ? 'trainee' : 'system',
        contextId: selectedTrainee?.id || '',
      });

      if (res.data?.ok) {
        const msgId = res.data?.record?.id;
        // Fire and forget worker
        base44.functions.invoke('whatsAppQueueWorker', {});
        toast.success('הודעה נשלחה ✅');
        setSentMessageId(msgId);
      } else {
        toast.error('שגיאה: ' + (res.data?.error || 'לא ידוע'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const isValid = () => {
    if (recipientType === 'self') return !!selfUser;
    if (recipientType === 'trainee') return !!selectedTraineeId;
    return !!manualPhone;
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span>📩 שליחת תבנית</span>
            <Badge variant="outline" className="text-xs font-normal">{template?.name}</Badge>
          </DialogTitle>
        </DialogHeader>

        {sentMessageId ? (
          <div className="space-y-4 text-center py-4">
            <div className="text-5xl">✅</div>
            <p className="text-slate-700 font-medium">ההודעה נוספה לתור ונשלחת!</p>
            <div className="flex gap-2 justify-center">
              {onOpenDiagnostics && (
                <Button variant="outline" onClick={() => { onOpenDiagnostics(template.key); onClose(); }}>
                  <ExternalLink className="w-4 h-4 ml-1" /> פתח דיאגנוסטיקה
                </Button>
              )}
              <Button onClick={onClose}>סגור</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Recipient Type */}
            <div className="space-y-1">
              <Label>שלח אל</Label>
              <div className="flex gap-2">
                {[
                  { val: 'trainee', label: '👤 מתאמן' },
                  { val: 'manual', label: '📱 טלפון ידני' },
                  { val: 'self', label: '✅ שלח לעצמי' },
                ].map(({ val, label }) => (
                  <button
                    key={val}
                    onClick={() => setRecipientType(val)}
                    className={`flex-1 text-sm py-2 px-3 rounded-lg border transition-colors ${
                      recipientType === val
                        ? 'bg-teal-500 text-white border-teal-500'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recipient Input */}
            {recipientType === 'trainee' && (
              <div className="space-y-1">
                <Label>בחר מתאמן</Label>
                <Select value={selectedTraineeId} onValueChange={setSelectedTraineeId}>
                  <SelectTrigger><SelectValue placeholder="בחר מתאמן..." /></SelectTrigger>
                  <SelectContent>
                    {trainees.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.full_name} {t.phone ? `(${t.phone})` : '⚠️ אין טלפון'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {recipientType === 'manual' && (
              <div className="space-y-1">
                <Label>מספר טלפון</Label>
                <Input value={manualPhone} onChange={e => setManualPhone(e.target.value)} placeholder="+972501234567 או 0501234567" dir="ltr" />
              </div>
            )}

            {recipientType === 'self' && selfUser && (
              <div className="bg-teal-50 border border-teal-200 rounded-lg p-3 text-sm text-teal-800">
                ✅ ישלח אל: {selfUser.full_name} ({selfUser.email})
              </div>
            )}

            {/* Vars */}
            {usedVars.length > 0 && (
              <div className="space-y-2">
                <Label>מילוי משתנים</Label>
                <div className="grid grid-cols-2 gap-2">
                  {usedVars.map(v => (
                    <div key={v}>
                      <p className="text-xs text-slate-500 mb-0.5">{`{{${v}}}`}</p>
                      <Input
                        value={vars[v] || ''}
                        onChange={e => setVars(prev => ({ ...prev, [v]: e.target.value }))}
                        placeholder={PREVIEW_VARS[v] || v}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Preview */}
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-1 mb-2">
                <Eye className="w-3 h-3 text-green-600" />
                <p className="text-xs text-green-600 font-medium">תצוגה מקדימה</p>
              </div>
              <p className="text-sm text-green-900 whitespace-pre-wrap leading-relaxed">{preview}</p>
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-1">
              <Button variant="outline" onClick={onClose}>ביטול</Button>
              <Button onClick={handleSend} disabled={loading || !isValid()}>
                {loading ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Send className="w-4 h-4 ml-1" />}
                שלח עכשיו
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}