import React, { useState } from 'react';
import { Send, Phone, Eye } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function TestMessageSection({ killSwitchActive }) {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('זוהי הודעת בדיקה מ-FIT COACH PRO 🧪');
  const [showPreview, setShowPreview] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const canSend = !killSwitchActive && phone.trim().length > 8 && message.trim().length > 0;

  const handleSend = async () => {
    if (!canSend) return;
    setIsSending(true);
    try {
      const res = await base44.functions.invoke('testRealWhatsAppDelivery', {
        testPhone: phone.trim(),
        message: message.trim(),
      });
      const d = res?.data || {};
      if (d.ok) {
        toast.success(`✅ הודעה נשלחה! messageId: ${d.result?.messageId || '—'}`);
      } else {
        const errMsg = d.error || d.result?.message || d.result?.error || 'Unknown error';
        toast.error('שגיאה מהפרובידר: ' + errMsg);
        console.error('[TestMessage] full response:', JSON.stringify(d));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setIsSending(false);
      setShowPreview(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Send className="w-5 h-5 text-slate-600" />
        <h2 className="font-bold text-slate-800 text-lg">📨 Test Message</h2>
        {killSwitchActive && (
          <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium mr-auto">
            🔒 חסום — הפעל Kill Switch כדי לשלוח
          </span>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            <Phone className="w-4 h-4 inline ml-1" />
            טלפון (E.164)
          </label>
          <input
            type="text"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+972XXXXXXXXX"
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-teal-400 outline-none font-mono"
            dir="ltr"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">תוכן ההודעה</label>
          <textarea
            value={message}
            onChange={e => setMessage(e.target.value)}
            rows={3}
            className="w-full border-2 border-slate-200 rounded-xl px-4 py-2 text-sm focus:border-teal-400 outline-none resize-none"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setShowPreview(true)}
            disabled={!phone.trim() || !message.trim()}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <Eye className="w-4 h-4" />
            תצוגה מקדימה
          </button>
        </div>

        {showPreview && (
          <div className="p-4 bg-green-50 border-2 border-green-300 rounded-xl space-y-3">
            <div className="font-bold text-green-800 text-sm">👁️ תצוגה מקדימה לפני שליחה:</div>
            <div className="text-xs text-slate-600">
              <strong>אל:</strong> <span className="font-mono">{phone}</span>
            </div>
            <div className="bg-white rounded-lg p-3 text-sm text-slate-800 border border-green-200 whitespace-pre-line">
              {message}
            </div>
            {killSwitchActive && (
              <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                🔒 לא ניתן לשלוח — כבה את Kill Switch תחילה
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={handleSend}
                disabled={isSending || killSwitchActive}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              >
                <Send className="w-4 h-4" />
                {isSending ? 'שולח...' : 'אשר ושלח'}
              </button>
              <button
                onClick={() => setShowPreview(false)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-sm font-medium transition-colors"
              >
                ביטול
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}