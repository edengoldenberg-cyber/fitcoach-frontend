import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Brain, AlertTriangle, CheckCircle2, Zap, Circle } from 'lucide-react';
import { format } from 'date-fns';

const Step = ({ done, label, warning }) => (
  <div className="flex items-center gap-2">
    {warning ? (
      <AlertTriangle className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
    ) : done ? (
      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
    ) : (
      <Circle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />
    )}
    <span className={done || warning ? 'text-slate-700' : 'text-slate-400'}>{label}</span>
  </div>
);

export default function AIDebugPanel({ leadId }) {
  const { data: aiLogs = [], refetch } = useQuery({
    queryKey: ['aiConversationLog', leadId],
    queryFn: () => base44.entities.AIConversationLog.filter({ leadId }),
    enabled: !!leadId,
    refetchInterval: 8000,
  });

  const aiLog = aiLogs[0];

  if (!aiLog) {
    return (
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500 flex items-center gap-2" dir="rtl">
        <Brain className="w-4 h-4 text-slate-400" />
        AI לא הופעל עדיין עבור שיחה זו
      </div>
    );
  }

  const statusConfig = {
    AI_ACTIVE:    { cls: 'bg-green-100 text-green-800 border-green-300',    label: '✅ AI פעיל' },
    AI_ESCALATED: { cls: 'bg-orange-100 text-orange-800 border-orange-300', label: '⚠️ הועבר לאדם' },
    HUMAN_REVIEW: { cls: 'bg-red-100 text-red-800 border-red-300',          label: '🔴 סקירה אנושית' },
  };
  const sc = statusConfig[aiLog.ai_status] || { cls: 'bg-slate-100 text-slate-700', label: aiLog.ai_status };
  const isEscalated = aiLog.ai_status === 'AI_ESCALATED' || !!aiLog.escalation_reason;

  return (
    <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-3 text-xs" dir="rtl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 font-bold text-purple-800">
          <Brain className="w-4 h-4" />
          AI Debug Panel
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="text-purple-500 hover:text-purple-700 text-[10px]">↻ רענן</button>
          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold border ${sc.cls}`}>
            {sc.label}
          </span>
        </div>
      </div>

      {/* Pipeline checklist */}
      <div className="bg-white/70 rounded-lg p-2.5 border border-purple-100 space-y-1.5">
        <div className="font-semibold text-purple-700 mb-2 text-[11px] uppercase tracking-wide">🔁 Pipeline Execution</div>
        <Step done={!!aiLog.last_user_message} label="הודעת לקוח התקבלה (inbound detected)" />
        <Step done={true} label="AI Automation הופעלה" />
        <Step done={true} label="aiConversationAgent הופעל" />
        <Step done={!!aiLog.brain_config_id} label={`AI Brain נטען${aiLog.brain_config_id ? ' ✓' : ''}`} />
        <Step done={!!aiLog.last_ai_reply} label="תגובה LLM נוצרה" />
        <Step done={!!aiLog.send_status} label={`נשלח ב-WhatsApp (${aiLog.send_status || 'pending'})`} />
        <Step done={!!aiLog.last_ai_reply} label="תגובה נשמרה לשיחה" />
        <Step
          done={isEscalated}
          warning={isEscalated}
          label={isEscalated ? `הסלמה הופעלה: ${aiLog.escalation_reason || 'כן'}` : 'הסלמה (לא נדרשת)'}
        />
      </div>

      {aiLog.last_prompt_summary && (
        <div className="text-slate-600 bg-white/60 rounded-lg p-2 border border-purple-100">
          <span className="font-medium text-purple-700">Brain: </span>
          {aiLog.last_prompt_summary}
        </div>
      )}

      {aiLog.last_user_message && (
        <div className="bg-white rounded-lg p-2.5 border border-slate-200">
          <div className="font-medium text-slate-600 mb-1">💬 הודעה אחרונה מהלקוח:</div>
          <div className="text-slate-700 leading-relaxed">{aiLog.last_user_message}</div>
        </div>
      )}

      {aiLog.last_ai_reply && (
        <div className="bg-white rounded-lg p-2.5 border border-purple-200">
          <div className="font-medium text-purple-700 mb-1">🤖 תגובת AI:</div>
          <div className="text-slate-700 leading-relaxed">{aiLog.last_ai_reply}</div>
        </div>
      )}

      <div className="flex items-center justify-between text-slate-500 pt-1 border-t border-purple-100">
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>שליחה: <span className="font-medium">{aiLog.send_status || '—'}</span></span>
        </div>
        {aiLog.processed_at && (
          <span>{format(new Date(aiLog.processed_at), 'HH:mm dd/MM/yy')}</span>
        )}
      </div>

      {aiLog.escalation_reason && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-2 flex items-start gap-2 text-orange-700">
          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span><strong>הסלמה:</strong> {aiLog.escalation_reason}</span>
        </div>
      )}

      {aiLog.error_message && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-2 text-red-700">
          ❌ שגיאה: {aiLog.error_message}
        </div>
      )}
    </div>
  );
}