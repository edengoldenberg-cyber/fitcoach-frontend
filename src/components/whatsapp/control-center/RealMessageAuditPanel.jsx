import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { RefreshCw, ChevronDown, ChevronUp, Shield, Clock, MessageSquare } from 'lucide-react';

const AUTOMATION_LABELS = {
  trainee_missing_meal: '🍽️ תזכורת ארוחה',
  trainee_missing_water: '💧 תזכורת מים',
  trainee_missing_workout: '🏋️ תזכורת אימון',
  birthday: '🎂 יום הולדת',
  trial_day1: '🎯 יום ניסיון 1',
  trial_day3: '📋 יום ניסיון 3',
  lead_created: '🆕 ליד חדש',
  trainee_created: '👤 מתאמן חדש',
  broadcast_manual: '📢 שידור ידני',
  custom_schedule: '⏰ לוח זמנים',
  test_message: '🧪 הודעת בדיקה',
  manual: '✋ ידני',
};

function maskPhone(phone) {
  if (!phone) return '—';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 8) return phone;
  return clean.slice(0, 5) + '****' + clean.slice(-3);
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'עכשיו';
  if (mins < 60) return `לפני ${mins} דק'`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `לפני ${hrs} ש'`;
  return `לפני ${Math.floor(hrs / 24)} ימים`;
}

export default function RealMessageAuditPanel({ refreshKey }) {
  const [expanded, setExpanded] = useState(false);

  const { data: sentMessages = [], refetch, isFetching } = useQuery({
    queryKey: ['wcc', 'auditSent', refreshKey],
    queryFn: async () => {
      const all = await base44.entities.WhatsAppMessageQueue.filter({});
      return all
        .filter(m => m.status === 'sent' || m.status === 'provider_unconfirmed')
        .sort((a, b) => new Date(b.updated_date) - new Date(a.updated_date));
    },
  });

  const todayStr = new Date().toISOString().split('T')[0];
  const sentToday = sentMessages.filter(m => (m.updated_date || '').startsWith(todayStr));
  const last5 = sentMessages.slice(0, 5);
  const lastSent = sentMessages[0];

  const hasSentToday = sentToday.length > 0;

  return (
    <div className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition-colors ${
      hasSentToday ? 'border-red-400' : 'border-slate-200'
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Shield className={`w-5 h-5 ${hasSentToday ? 'text-red-500' : 'text-slate-400'}`} />
          <h2 className="font-bold text-slate-800 text-lg">🔍 Real Message Audit</h2>
          {hasSentToday && (
            <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-full animate-pulse">
              {sentToday.length} נשלחו היום
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors min-h-0 min-w-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            רענן
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-sm text-slate-600 transition-colors min-h-0 min-w-0"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            {expanded ? 'כווץ' : 'פרט'}
          </button>
        </div>
      </div>

      {/* KPIs row */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        {/* Sent today */}
        <div className={`rounded-xl border-2 p-4 ${hasSentToday ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-200'}`}>
          <div className="text-xs text-slate-500 mb-1">נשלחו היום</div>
          <div className={`text-3xl font-bold ${hasSentToday ? 'text-red-600' : 'text-green-600'}`}>
            {sentToday.length}
          </div>
        </div>

        {/* Total sent all time */}
        <div className="rounded-xl border-2 bg-slate-50 border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1">סה"כ נשלחו</div>
          <div className="text-3xl font-bold text-slate-700">{sentMessages.length}</div>
        </div>

        {/* Last sent timestamp */}
        <div className="rounded-xl border-2 bg-slate-50 border-slate-200 p-4">
          <div className="text-xs text-slate-500 mb-1 flex items-center gap-1">
            <Clock className="w-3 h-3" /> שולח אחרון
          </div>
          <div className="text-sm font-bold text-slate-700 leading-tight">
            {lastSent ? timeAgo(lastSent.updated_date) : 'אין'}
          </div>
        </div>
      </div>

      {/* Last 5 messages — always visible summary */}
      {last5.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1">
            <MessageSquare className="w-3 h-3" /> 5 הודעות אחרונות שנשלחו
          </div>
          {last5.map((msg) => {
            const sourceLabel = AUTOMATION_LABELS[msg.template_key] ||
              (msg.template_key ? `🔑 ${msg.template_key}` : '❓ לא ידוע');
            const isToday = (msg.updated_date || '').startsWith(todayStr);
            return (
              <div
                key={msg.id}
                className={`rounded-xl border p-3 text-sm transition-colors ${
                  isToday ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'
                }`}
              >
                {/* Row 1: name + phone + time */}
                <div className="flex items-center justify-between mb-1.5 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-slate-800 truncate">{msg.to_name || 'לא ידוע'}</span>
                    <span className="font-mono text-xs text-slate-400 flex-shrink-0">{maskPhone(msg.to_phone_e164)}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {isToday && (
                      <span className="text-[10px] bg-red-100 text-red-700 font-bold px-1.5 py-0.5 rounded-full">
                        היום
                      </span>
                    )}
                    <span className="text-xs text-slate-400">{timeAgo(msg.updated_date)}</span>
                  </div>
                </div>

                {/* Row 2: source automation */}
                <div className="text-xs text-slate-500 mb-1.5">
                  <span className="font-medium">מקור: </span>
                  <span className="bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono text-[10px]">
                    {sourceLabel}
                  </span>
                  {msg.context_type && (
                    <span className="mr-1 text-slate-400">({msg.context_type})</span>
                  )}
                </div>

                {/* Row 3: message preview — only when expanded */}
                {expanded && msg.rendered_text && (
                  <div
                    className="text-xs text-slate-600 bg-white p-2 rounded-lg border border-slate-100 leading-relaxed line-clamp-3 whitespace-pre-wrap"
                    dir="auto"
                  >
                    {msg.rendered_text.slice(0, 200)}
                    {msg.rendered_text.length > 200 ? '…' : ''}
                  </div>
                )}

                {/* Collapsed preview — 1 line only */}
                {!expanded && msg.rendered_text && (
                  <div className="text-xs text-slate-400 truncate" dir="auto">
                    {msg.rendered_text.slice(0, 80)}…
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {last5.length === 0 && (
        <div className="text-center py-6 text-slate-400 text-sm">
          <Shield className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          לא נשלחו הודעות אמיתיות במערכת
        </div>
      )}
    </div>
  );
}