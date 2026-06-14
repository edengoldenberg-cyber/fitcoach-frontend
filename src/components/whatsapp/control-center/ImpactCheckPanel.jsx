import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, CheckCircle, Loader2, RefreshCw, ShieldAlert, Users, MessageSquare } from 'lucide-react';

export default function ImpactCheckPanel({ killSwitchActive, onImpactLoaded }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);

  if (!killSwitchActive) return null; // Only show when kill switch is ON (about to enable)

  const runCheck = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('preEnableImpactCheck', {});
      setResult(res.data);
      if (onImpactLoaded) onImpactLoaded(res.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const s = result?.summary;
  const isRisky = s && s.immediateQueue > 0;
  const isSafe = s && s.immediateQueue === 0;

  return (
    <div className="mt-4 rounded-xl border border-slate-600 overflow-hidden bg-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-750 border-b border-slate-600">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-bold text-amber-400">בדיקת השפעת הפעלה</span>
          <span className="text-xs text-slate-500 bg-slate-700 px-2 py-0.5 rounded-full">READ ONLY</span>
        </div>
        <button
          onClick={runCheck}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-bold rounded-lg transition-colors min-h-0 min-w-0"
        >
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          {loading ? 'בודק...' : 'בדוק השפעת הפעלה'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="px-4 py-3 text-red-400 text-sm bg-red-900/20">שגיאה: {error}</div>
      )}

      {/* No result yet */}
      {!result && !loading && !error && (
        <div className="px-4 py-3 text-slate-400 text-xs">
          לחץ "בדוק השפעת הפעלה" לפני שתפעיל שליחת WhatsApp
        </div>
      )}

      {/* Results */}
      {result && s && (
        <div className="p-4 space-y-3">
          {/* Main summary */}
          <div className={`rounded-lg p-3 border ${
            isRisky ? 'bg-red-900/30 border-red-500' : 'bg-green-900/30 border-green-600'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              {isRisky
                ? <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                : <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
              }
              <span className={`font-bold text-sm ${isRisky ? 'text-red-300' : 'text-green-300'}`}>
                {isRisky
                  ? `⚠️ אם תפעיל עכשיו: ${s.immediateQueue} הודעות יישלחו מיד`
                  : '✅ אין הודעות מיידיות לשליחה'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className={`text-center p-2 rounded-lg ${isRisky ? 'bg-red-900/40' : 'bg-slate-700'}`}>
                <div className={`text-lg font-bold ${isRisky ? 'text-red-300' : 'text-white'}`}>{s.immediateQueue}</div>
                <div className="text-slate-400">מיידי</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-700">
                <div className="text-lg font-bold text-amber-300">{s.estimatedNextHour}</div>
                <div className="text-slate-400">בשעה הקרובה</div>
              </div>
              <div className="text-center p-2 rounded-lg bg-slate-700">
                <div className="text-lg font-bold text-slate-300">{s.estimatedToday}</div>
                <div className="text-slate-400">היום</div>
              </div>
            </div>
          </div>

          {/* Queue snapshot */}
          {(s.pendingQueue > 0 || s.failedQueue > 0) && (
            <div className="rounded-lg bg-slate-700 p-3 text-xs space-y-1">
              <div className="text-slate-300 font-bold mb-1.5">📦 תור הודעות:</div>
              <div className="flex gap-3">
                {s.pendingQueue > 0 && <span className="text-yellow-400">⏳ ממתין: {s.pendingQueue}</span>}
                {s.sendingQueue > 0 && <span className="text-blue-400">📤 שולח: {s.sendingQueue}</span>}
                {s.failedQueue > 0 && <span className="text-red-400">❌ נכשל: {s.failedQueue}</span>}
              </div>
              {result.queueSnapshot?.sampleQueued?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {result.queueSnapshot.sampleQueued.map((m, i) => (
                    <div key={i} className="text-slate-400">→ {m.name} ({m.to}) — {m.template}</div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trainee stats */}
          <div className="rounded-lg bg-slate-700 p-3 text-xs">
            <div className="flex items-center gap-1.5 mb-2">
              <Users className="w-3 h-3 text-slate-300" />
              <span className="text-slate-300 font-bold">סטטיסטיקות מתאמנים:</span>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-slate-400">
              <span>✅ WA מופעל: <strong className="text-green-400">{result.traineeStats?.waEnabled}</strong></span>
              <span>⏭️ WA מבוטל: <strong className="text-slate-300">{s.waDisabledSkipped}</strong></span>
              <span>⚠️ לא פעיל: <strong className="text-amber-400">{s.nonActiveSkipped}</strong></span>
              <span>🎯 יעדים ייחודיים: <strong className="text-white">{s.totalAutomationTargets}</strong></span>
            </div>
          </div>

          {/* Automation risks */}
          <div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="w-full flex items-center justify-between text-xs text-slate-400 hover:text-slate-200 px-1 py-1 transition-colors min-h-0 min-w-0"
            >
              <span className="flex items-center gap-1.5">
                <MessageSquare className="w-3 h-3" />
                פירוט אוטומציות ({result.automationRisks?.length})
              </span>
              <span>{expanded ? '▲' : '▼'}</span>
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                {result.automationRisks?.map((risk, i) => (
                  <div key={i} className={`rounded-lg p-2.5 text-xs border ${
                    risk.wouldSend > 0 ? 'bg-amber-900/20 border-amber-700' : 'bg-slate-700 border-slate-600'
                  }`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-slate-200">{risk.label}</span>
                      <span className={`font-bold ${risk.wouldSend > 0 ? 'text-amber-400' : 'text-green-400'}`}>
                        {risk.wouldSend > 0 ? `⚠️ ${risk.wouldSend} הודעות` : '✅ 0'}
                      </span>
                    </div>
                    <div className="text-slate-400 mb-1">{risk.reason}</div>
                    {risk.sample?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {risk.sample.map((s, j) => (
                          <span key={j} className="bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded text-[10px]">
                            {s.name} ({s.phone})
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Blockers */}
          {s.blockers?.length > 0 && (
            <div className="rounded-lg bg-red-900/30 border border-red-600 p-3 text-xs space-y-1">
              <div className="text-red-300 font-bold mb-1">🚫 חסמים לפני הפעלה:</div>
              {s.blockers.map((b, i) => <div key={i} className="text-red-400">• {b}</div>)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}