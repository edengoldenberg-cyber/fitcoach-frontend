import React, { useState } from 'react';
import { Eye, ChevronDown, ChevronUp, Loader2, AlertTriangle, Bug } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

export default function LivePreviewSection({ killSwitchActive }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugResult, setDebugResult] = useState(null);
  const [debugExpanded, setDebugExpanded] = useState(false);

  const handleSimulate = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('simulateOutboundMessages', {});
      setResult(res?.data || {});
      setExpanded(true);
    } catch (e) {
      toast.error('שגיאה בסימולציה: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const totalMessages = result?.totalMessages || 0;
  const isDangerous = totalMessages > 10;

  const handleDebugTrace = async (debugMode = false) => {
    setDebugLoading(true);
    setDebugResult(null);
    try {
      const res = await base44.functions.invoke('debugWaterReminderTrace', { debugMode });
      setDebugResult(res?.data || {});
      setDebugExpanded(true);
    } catch (e) {
      toast.error('שגיאת debug: ' + e.message);
    } finally {
      setDebugLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Eye className="w-5 h-5 text-slate-600" />
        <h2 className="font-bold text-slate-800 text-lg">🔍 מה היה נשלח עכשיו</h2>
        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full mr-auto">
          סימולציה בלבד — לא נשלח כלום
        </span>
      </div>

      <p className="text-sm text-slate-500 mb-3">
        הרץ סימולציה כדי לראות בדיוק אילו הודעות היו יוצאות אם ה-Worker היה רץ עכשיו.
        לא נשלחת שום הודעה.
      </p>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={handleSimulate}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
          הרץ סימולציה
        </button>
        <button
          onClick={() => handleDebugTrace(false)}
          disabled={debugLoading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {debugLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
          🔍 Debug Water Trace
        </button>
        <button
          onClick={() => handleDebugTrace(true)}
          disabled={debugLoading}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-colors"
        >
          {debugLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bug className="w-4 h-4" />}
          🧪 Debug (Bypass Time)
        </button>
      </div>

      {/* Debug Trace Result */}
      {debugResult && (
        <div className="mt-4 bg-slate-900 text-slate-100 rounded-xl p-4 text-xs font-mono">
          <div className="flex items-center justify-between mb-3">
            <span className="text-blue-400 font-bold">🔍 Water Reminder Debug Trace</span>
            <button onClick={() => setDebugResult(null)} className="text-slate-500 hover:text-slate-300">✕</button>
          </div>

          {/* System State */}
          <div className="mb-3 p-2 bg-slate-800 rounded-lg">
            <div className="text-yellow-400 font-bold mb-1">📊 System State</div>
            <div className="grid grid-cols-2 gap-1">
              <span className="text-slate-400">Kill Switch:</span>
              <span className={debugResult.system_state?.killSwitchEnabled ? 'text-green-400' : 'text-red-400'}>
                {debugResult.system_state?.killSwitchEnabled ? '✅ ON (sending)' : '🔒 OFF (blocked)'}
              </span>
              <span className="text-slate-400">Time Window:</span>
              <span className={debugResult.system_state?.inTimeWindow ? 'text-green-400' : 'text-red-400'}>
                {debugResult.system_state?.inTimeWindow ? `✅ IN (${debugResult.system_state?.slot})` : `❌ OUT — ${debugResult.system_state?.israelTime}`}
              </span>
              <span className="text-slate-400">Windows:</span>
              <span className="text-slate-300">{debugResult.system_state?.reminder_windows}</span>
              <span className="text-slate-400">Today:</span>
              <span className="text-slate-300">{debugResult.system_state?.todayStr} ({debugResult.system_state?.todayDayName})</span>
            </div>
          </div>

          {/* Diagnosis */}
          <div className={`mb-3 p-2 rounded-lg border ${
            debugResult.summary?.would_send > 0 ? 'bg-green-900 border-green-700 text-green-300' : 'bg-red-900 border-red-700 text-red-300'
          }`}>
            <div className="font-bold mb-1">🎯 {debugResult.diagnosis}</div>
            <div>סה"כ מתאמנים: {debugResult.summary?.total_trainees} | יישלח: {debugResult.summary?.would_send} | חסום: {debugResult.summary?.blocked}</div>
          </div>

          {/* Reason Breakdown */}
          {debugResult.summary?.reason_breakdown && Object.keys(debugResult.summary.reason_breakdown).length > 0 && (
            <div className="mb-3 p-2 bg-slate-800 rounded-lg">
              <div className="text-yellow-400 font-bold mb-1">🚫 סיבות חסימה</div>
              {Object.entries(debugResult.summary.reason_breakdown).map(([reason, count]) => (
                <div key={reason} className="flex justify-between">
                  <span className="text-red-300">{reason}</span>
                  <span className="text-slate-400">{count} מתאמן/ים</span>
                </div>
              ))}
            </div>
          )}

          {/* Would Send List */}
          {debugResult.would_send_list?.length > 0 && (
            <div className="mb-3 p-2 bg-green-900 rounded-lg border border-green-700">
              <div className="text-green-400 font-bold mb-1">✅ יישלח ({debugResult.would_send_list.length})</div>
              {debugResult.would_send_list.map((t, i) => (
                <div key={i} className="text-green-300">→ {t.name || t.email} | {t.phone_normalized} | מים: {t.water_total_ml}/{t.target_water_ml || t.water_target_ml}ml ({t.water_pct}%)</div>
              ))}
            </div>
          )}

          {/* Full trace toggle */}
          <button
            onClick={() => setDebugExpanded(!debugExpanded)}
            className="text-slate-400 hover:text-slate-200 flex items-center gap-1"
          >
            {debugExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {debugExpanded ? 'הסתר' : 'הצג'} טבלת trace מלאה ({debugResult.blocked_list?.length || 0} חסומים)
          </button>

          {debugExpanded && debugResult.blocked_list?.length > 0 && (
            <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {debugResult.blocked_list.map((t, i) => (
                <div key={i} className="flex gap-2 text-slate-400">
                  <span className="text-slate-500 w-4">{i+1}.</span>
                  <span className="text-slate-300 truncate">{t.name || t.email}</span>
                  <span className="text-red-400 ml-auto flex-shrink-0">{t.reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          {/* Summary */}
          <div className={`rounded-xl p-4 border-2 flex items-center justify-between ${
            result.killSwitchActive || result.providerDisabled
              ? 'bg-green-50 border-green-200'
              : isDangerous
                ? 'bg-red-50 border-red-300'
                : totalMessages === 0
                  ? 'bg-green-50 border-green-200'
                  : 'bg-amber-50 border-amber-300'
          }`}>
            <div>
              {result.killSwitchActive && (
                <p className="font-bold text-green-700">🔒 Kill Switch פעיל — 0 הודעות יישלחו</p>
              )}
              {result.providerDisabled && !result.killSwitchActive && (
                <p className="font-bold text-green-700">🔒 ספק מושבת — 0 הודעות יישלחו</p>
              )}
              {!result.killSwitchActive && !result.providerDisabled && (
                <>
                  <p className={`font-bold ${isDangerous ? 'text-red-700' : totalMessages > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                    {totalMessages === 0
                      ? '✅ אין הודעות בתור כרגע'
                      : `${isDangerous ? '⚠️' : '📩'} ${totalMessages} הודעות היו נשלחות`}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {result.totalQueued} בתור · {result.totalFailed} כשלונות
                  </p>
                </>
              )}
            </div>
            {isDangerous && (
              <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0" />
            )}
          </div>

          {/* Expandable list */}
          {totalMessages > 0 && result.list?.length > 0 && (
            <div>
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {expanded ? 'הסתר פירוט' : 'הצג פירוט הודעות'}
              </button>

              {expanded && (
                <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                  {result.list.map((msg, i) => (
                    <div key={msg.id || i} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-800">{msg.trainee_name}</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs text-slate-400">{msg.phone}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                            msg.status === 'failed' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>{msg.status}</span>
                        </div>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mb-1">{msg.template_key}</div>
                      <div className="text-xs text-slate-700 bg-white p-2 rounded-lg border border-slate-100 leading-relaxed" dir="auto">
                        {msg.message_preview}
                      </div>
                      {msg.attempts > 0 && (
                        <div className="text-xs text-slate-400 mt-1">ניסיונות: {msg.attempts}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}