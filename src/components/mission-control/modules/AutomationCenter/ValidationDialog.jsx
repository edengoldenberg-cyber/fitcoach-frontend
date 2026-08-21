import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Shield, Eye, Info, CheckCircle2, XCircle, Play, RefreshCw,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { getTriggerMeta, renderPreview } from '../../shared/utils.js';

export default function ValidationDialog({ open, onClose, automation, onTestSend }) {
  const [testPhone,   setTestPhone]   = useState('0535716559');
  const [testLoading, setTestLoading] = useState(false);
  const [testResult,  setTestResult]  = useState(null);

  if (!automation) return null;

  const meta     = getTriggerMeta(automation.trigger_type);
  const preview  = renderPreview(automation.message_template);
  const links    = automation.message_template.match(/https?:\/\/[^\s]+/g) || [];
  const minute   = new Date().toISOString().slice(0, 16);
  const idempKey = `automation:${automation.id}:test:${minute}`;

  const checks = [
    { label: 'שם האוטומציה',   ok: !!automation.name,              detail: automation.name },
    { label: 'טריגר מוגדר',    ok: !!automation.trigger_type,      detail: meta.label },
    { label: 'תוכן הודעה',     ok: !!automation.message_template,  detail: `${automation.message_template.length} תווים` },
    { label: 'יעד שליחה',      ok: true,                           detail: automation.target_type === 'all' ? 'כל המתאמנים' : automation.target_phone },
    { label: 'קטגוריית הסכמה', ok: !!automation.consent_category,  detail: automation.consent_category },
    { label: 'Cooldown מוגדר', ok: (automation.cooldown_hours || 0) > 0, detail: `${automation.cooldown_hours}h` },
  ];
  const allOk = checks.every(c => c.ok);

  const handleTest = async () => {
    if (!testPhone) { toast.error('הכנס טלפון'); return; }
    setTestLoading(true); setTestResult(null);
    try {
      const res  = await base44.functions.invoke('testAutomationFromBuilder', {
        automation_id: automation.id, test_phone: testPhone,
      });
      const data = res?.data || {};
      setTestResult(data);
      if (res?.ok && data.queue_id) {
        toast.success(`✅ Queue ID: ${data.queue_id.slice(-8)}`);
        onTestSend?.();
      } else {
        toast.error('❌ ' + (data.error || res?.error || 'שגיאה'));
      }
    } catch (e) { toast.error(e.message); }
    finally { setTestLoading(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-bold">
            <Shield className="w-5 h-5 text-blue-500" /> ולידציה — {automation.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-1">
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="bg-slate-50 px-3 py-2 text-xs font-bold border-b">בדיקות מקדימות</div>
            {checks.map((c, i) => (
              <div key={i} className={`flex items-center justify-between px-3 py-2 text-xs border-b border-slate-100 last:border-0 ${!c.ok ? 'bg-red-50' : ''}`}>
                <div className="flex items-center gap-2">
                  {c.ok ? <CheckCircle2 className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-red-500" />}
                  <span className={!c.ok ? 'text-red-700 font-semibold' : 'text-slate-700'}>{c.label}</span>
                </div>
                <span className="text-slate-400 font-mono">{c.detail}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            {[
              ['טריגר', meta.label],
              ['נתיב', 'Queue → Worker → Green API'],
              ['Idempotency', `...${idempKey.slice(-16)}`],
              ['הסכמה', `${automation.consent_category || ''}_enabled = true`],
              ['Cooldown', `${automation.cooldown_hours}h`],
              ['יעד', automation.target_type === 'all' ? 'כל המתאמנים' : automation.target_phone],
            ].map(([k, v]) => (
              <div key={k} className="bg-slate-50 border border-slate-200 rounded-lg p-2">
                <p className="text-slate-400">{k}</p>
                <p className="font-mono font-semibold text-slate-700 truncate">{v}</p>
              </div>
            ))}
          </div>

          <div className="border border-green-200 rounded-xl overflow-hidden">
            <div className="bg-green-50 px-3 py-2 text-xs font-bold text-green-700 border-b border-green-200 flex items-center gap-1">
              <Eye className="w-3 h-3" /> תצוגה מקדימה
            </div>
            <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed p-3">{preview}</pre>
          </div>

          {links.length > 0 && (
            <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 flex items-start gap-2">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>קישורים בהודעה: {links.join(' | ')}</span>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl p-3 space-y-2">
            <p className="text-xs font-bold">שלח בדיקת WhatsApp</p>
            <div className="flex gap-2">
              <Input value={testPhone} onChange={e => setTestPhone(e.target.value)} dir="ltr"
                className="font-mono text-sm flex-1 h-9" placeholder="0535716559" />
              <Button onClick={handleTest} disabled={testLoading}
                className="text-white bg-teal-500 hover:bg-teal-600 h-9">
                {testLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><Play className="w-4 h-4 ml-1" />שלח</>}
              </Button>
            </div>
            {testResult && (
              <div className={`rounded-lg p-2.5 text-xs border ${testResult.queue_id ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'}`}>
                {testResult.queue_id ? (
                  <>
                    <div className="font-bold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> הודעה נשלחה</div>
                    <div>Queue ID: <span className="font-mono">{testResult.queue_id.slice(-12)}</span></div>
                    <div>Worker: processed={testResult.worker?.processed}, failed={testResult.worker?.failed}</div>
                    {testResult.duplicate && <div className="text-amber-600">⚠️ כפיל חסום (Idempotency)</div>}
                  </>
                ) : (
                  <div className="flex items-center gap-1"><XCircle className="w-3.5 h-3.5" />{testResult.error || 'שגיאה'}</div>
                )}
              </div>
            )}
          </div>

          <div className={`rounded-xl p-3 flex items-center gap-3 border ${allOk ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
            {allOk
              ? <><CheckCircle2 className="w-5 h-5 text-green-600" /><p className="text-sm font-semibold text-green-700">כל הבדיקות עברו — מוכן להפעלה</p></>
              : <><XCircle     className="w-5 h-5 text-red-600"   /><p className="text-sm font-semibold text-red-700">תקן את הבעיות לפני הפעלה</p></>}
          </div>

          <Button variant="outline" onClick={onClose} className="w-full">סגור</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
