import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Copy, CheckCheck, FileText, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

function buildTextReport({ activeBrain, defaultFlow, activeScript, flows, scripts, overrideLeads, snoozeConfigs, warnings }) {
  const now = new Date().toLocaleDateString('he-IL', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const aiEnabled = !!activeBrain;
  const flowEnabled = !!defaultFlow;
  const scriptEnabled = !!activeScript;
  const flowMode = defaultFlow?.flowResponseMode || 'FLOW_ONLY';
  const flowModeLabel = flowMode === 'FLOW_ONLY' ? 'Flow בלבד' : flowMode === 'FLOW_THEN_AI' ? 'Flow ואחר כך AI' : 'AI בלבד';
  const defaultStarter = aiEnabled ? 'AI Brain' : flowEnabled ? 'Sales Flow' : scriptEnabled ? 'Sales Script' : 'Manual (אין אוטומציה)';
  const nudgeEnabled = snoozeConfigs.some(s => s.repeatAllowed);
  const overrideCount = overrideLeads.length;
  const freeText = aiEnabled ? 'AI Brain מטפל בשאלות חופשיות' : 'ללא מנוע — שאלות חופשיות לא נענות';
  const afterFlow = flowMode === 'FLOW_THEN_AI' ? 'AI ממשיך אחרי Flow' : flowMode === 'FLOW_ONLY' ? 'Flow מסתיים — אין המשך' : 'AI בלבד';
  const duringFlow = aiEnabled ? 'AI מטפל בשאלות חופשיות, Flow מטפל בשלבים' : 'Flow בלבד';

  const lines = [
    `══════════════════════════════════════`,
    `  SYSTEM SUMMARY REPORT — ${now}`,
    `══════════════════════════════════════`,
    ``,
    `📌 מדיניות ברירת מחדל`,
    `  Default Starter: ${defaultStarter}`,
    `  During Active Flow: ${duringFlow}`,
    `  Free-text Policy: ${freeText}`,
    `  After Flow: ${afterFlow}`,
    ``,
    `🔵 AI Brain`,
    `  פעיל: ${aiEnabled ? 'כן' : 'לא'}`,
    aiEnabled ? `  Config: ${activeBrain?.businessName || '—'}` : '',
    aiEnabled ? `  מטרה: ${activeBrain?.mainObjective || '—'}` : '',
    ``,
    `🔀 Sales Flow`,
    `  Flows פעילים: ${flows.length}`,
    `  Default Flow: ${defaultFlow?.name || 'אין'}`,
    `  מדיניות: ${flowModeLabel}`,
    ``,
    `📋 Sales Script`,
    `  Scripts פעילים: ${scripts.filter(s => s.is_active && s.script_enabled !== false).length}`,
    `  Script ראשי: ${activeScript?.name || 'אין'}`,
    ``,
    `🔔 Nudge / Follow-up`,
    `  פעיל: ${nudgeEnabled ? 'כן' : 'לא'}`,
    `  Snooze Configs: ${snoozeConfigs.length}`,
    ``,
    `⚡ Lead Overrides`,
    `  לידים עם override: ${overrideCount}`,
    overrideCount > 0 ? `  (לידים אלו אינם יורשים את מדיניות המערכת)` : '',
    ``,
    `✅ מצבים מותרים`,
    `  AI Brain: ${aiEnabled ? 'פעיל' : 'לא פעיל'}`,
    `  Sales Flow: ${flowEnabled ? 'פעיל' : 'לא פעיל'}`,
    `  Sales Script: ${scriptEnabled ? 'פעיל' : 'לא פעיל'}`,
    `  Manual: תמיד מותר`,
    `  Nudge: ${nudgeEnabled ? 'פעיל' : 'לא פעיל'}`,
    ``,
  ];

  if (warnings.length > 0) {
    lines.push(`⚠️ אזהרות מערכת`);
    warnings.forEach(w => lines.push(`  • ${w}`));
    lines.push(``);
  }

  lines.push(`══════════════════════════════════════`);
  return lines.filter(l => l !== null && l !== undefined).join('\n');
}

function Row({ label, value, ok, children }) {
  return (
    <div className="flex items-start justify-between py-2 border-b border-slate-50 last:border-0 gap-3">
      <span className="text-[12px] text-slate-500 flex-shrink-0 w-44">{label}</span>
      <div className="text-right flex-1">
        {children || <span className={`text-[12px] font-semibold ${ok === true ? 'text-green-700' : ok === false ? 'text-slate-400' : 'text-slate-700'}`}>{value}</span>}
      </div>
    </div>
  );
}

function StatusIcon({ ok }) {
  return ok
    ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
    : <XCircle className="w-3.5 h-3.5 text-slate-300 flex-shrink-0" />;
}

export default function SystemSummaryReport() {
  const [copied, setCopied] = useState(false);

  const { data: user } = useQuery({ queryKey: ['ssr-user'], queryFn: () => base44.auth.me() });
  const coachEmail = user?.email;

  const { data: allBrains = [] } = useQuery({
    queryKey: ['ssr-brains', coachEmail],
    queryFn: () => base44.entities.AIBrainConfig.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });
  const activeBrain = allBrains.find(b => b.isActive === true);

  const { data: flows = [] } = useQuery({
    queryKey: ['ssr-flows', coachEmail],
    queryFn: () => base44.entities.SalesConversationFlow.filter({ coach_email: coachEmail, is_active: true }),
    enabled: !!coachEmail,
  });
  const defaultFlow = flows.find(f => f.isDefault) || flows[0];

  const { data: scripts = [] } = useQuery({
    queryKey: ['ssr-scripts', coachEmail],
    queryFn: () => base44.entities.SalesScript.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });
  const activeScripts = scripts.filter(s => s.is_active && s.script_enabled !== false);
  const activeScript = activeScripts.find(s => s.script_type === 'main');

  const { data: snoozeConfigs = [] } = useQuery({
    queryKey: ['ssr-snooze', coachEmail],
    queryFn: () => base44.entities.LeadSnoozeConfig.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
  });

  const { data: overrideLeads = [] } = useQuery({
    queryKey: ['ssr-overrides', coachEmail],
    queryFn: () => base44.entities.Lead.filter({ coach_email: coachEmail }),
    enabled: !!coachEmail,
    select: (leads) => leads.filter(l => !!l.activeResponderOwner),
  });

  const aiEnabled = !!activeBrain;
  const flowEnabled = !!defaultFlow;
  const scriptEnabled = !!activeScript;
  const nudgeEnabled = snoozeConfigs.some(s => s.repeatAllowed);
  const flowMode = defaultFlow?.flowResponseMode || 'FLOW_ONLY';
  const flowModeLabel = flowMode === 'FLOW_ONLY' ? '🔵 Flow בלבד' : flowMode === 'FLOW_THEN_AI' ? '🔀 Flow → AI' : '🧠 AI בלבד';
  const defaultStarter = aiEnabled ? 'AI Brain' : flowEnabled ? 'Sales Flow' : scriptEnabled ? 'Sales Script' : 'Manual';
  const freeTextPolicy = aiEnabled ? 'AI Brain מטפל' : 'לא מטופל';
  const afterFlowPolicy = flowMode === 'FLOW_THEN_AI' ? 'AI ממשיך' : flowMode === 'FLOW_ONLY' ? 'אין המשך' : 'AI בלבד';

  // Compute warnings
  const warnings = [];
  if (!aiEnabled && !flowEnabled && !scriptEnabled) warnings.push('אין מנוע אוטומטי פעיל — כל הלידים במצב Manual');
  if (flowEnabled && flowMode === 'FLOW_THEN_AI' && !aiEnabled) warnings.push('Flow מוגדר ל-FLOW_THEN_AI אך AI Brain לא פעיל');
  if (activeScripts.length > 1) warnings.push(`${activeScripts.length} Scripts פעילים — ייתכן קונפליקט`);
  if (overrideLeads.length > 10) warnings.push(`${overrideLeads.length} לידים עם override — מומלץ לבדוק`);

  const handleCopy = async () => {
    const report = buildTextReport({ activeBrain, defaultFlow, activeScript, flows, scripts, overrideLeads, snoozeConfigs, warnings });
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b px-4 py-4">
        <div className="max-w-2xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-slate-600" />
            <div>
              <h1 className="text-lg font-bold text-slate-800">System Summary Report</h1>
              <p className="text-[12px] text-slate-500">מצב מערכת שיחות — סיכום ניתן לשיתוף</p>
            </div>
          </div>
          <Button onClick={handleCopy} size="sm" variant="outline" className="gap-2 flex-shrink-0">
            {copied ? <CheckCheck className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
            {copied ? 'הועתק!' : 'Copy Report'}
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">

        {/* Warnings */}
        {warnings.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 space-y-1.5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-bold text-amber-700">אזהרות מערכת</span>
            </div>
            {warnings.map((w, i) => (
              <p key={i} className="text-[11px] text-amber-700">• {w}</p>
            ))}
          </div>
        )}

        {/* Default Policy */}
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">📌 מדיניות ברירת מחדל</p>
          <Row label="Default Starter" value={defaultStarter} ok={defaultStarter !== 'Manual'} />
          <Row label="During Active Flow" value={aiEnabled ? 'AI לשאלות, Flow לשלבים' : 'Flow בלבד'} />
          <Row label="Free-text Policy" value={freeTextPolicy} ok={aiEnabled} />
          <Row label="After Flow" value={afterFlowPolicy} />
          <Row label="מדיניות Flow" value={flowModeLabel} />
        </div>

        {/* Engines */}
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">🔧 מנועי שיחה</p>
          {[
            { label: 'AI Brain', ok: aiEnabled, detail: aiEnabled ? activeBrain?.businessName : 'לא פעיל' },
            { label: `Sales Flows (${flows.length} פעילים)`, ok: flowEnabled, detail: defaultFlow?.name || 'אין Default' },
            { label: `Sales Scripts (${activeScripts.length} פעילים)`, ok: scriptEnabled, detail: activeScript?.name || 'אין Script ראשי' },
            { label: 'Nudge / Follow-up', ok: nudgeEnabled, detail: nudgeEnabled ? `${snoozeConfigs.length} configs` : 'לא פעיל' },
          ].map(({ label, ok, detail }) => (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
              <div className="flex items-center gap-2">
                <StatusIcon ok={ok} />
                <span className="text-[12px] text-slate-700">{label}</span>
              </div>
              <span className="text-[11px] text-slate-400">{detail}</span>
            </div>
          ))}
        </div>

        {/* Overrides */}
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">⚡ Lead Overrides</p>
          <Row label="לידים עם override" value={overrideLeads.length.toString()} ok={overrideLeads.length === 0} />
          {overrideLeads.length > 0 && (
            <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
              {overrideLeads.slice(0, 20).map(l => (
                <div key={l.id} className="flex items-center justify-between text-[11px] text-slate-500 border-b border-slate-50 py-0.5">
                  <span>{l.firstName} {l.lastName}</span>
                  <span className="font-mono font-semibold text-amber-600">{l.activeResponderOwner}</span>
                </div>
              ))}
              {overrideLeads.length > 20 && <p className="text-[10px] text-slate-400">ועוד {overrideLeads.length - 20} לידים...</p>}
            </div>
          )}
        </div>

        {/* Allowed Modes */}
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-[11px] font-bold text-slate-500 uppercase mb-2">✅ מצבים מותרים</p>
          {[
            { label: 'AI Brain', ok: aiEnabled },
            { label: 'Sales Flow', ok: flowEnabled },
            { label: 'Sales Script', ok: scriptEnabled },
            { label: 'Manual', ok: true },
            { label: 'Nudge / Follow-up', ok: nudgeEnabled },
          ].map(({ label, ok }) => (
            <div key={label} className="flex items-center gap-2 py-1.5 border-b border-slate-50 last:border-0">
              <StatusIcon ok={ok} />
              <span className="text-[12px] text-slate-700">{label}</span>
              <span className="text-[10px] text-slate-400 mr-auto">{ok ? 'פעיל' : 'לא פעיל'}</span>
            </div>
          ))}
        </div>

        {/* Copy reminder */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center justify-between">
          <p className="text-[11px] text-slate-500">ניתן להעתיק את הדוח לשיתוף חיצוני</p>
          <Button onClick={handleCopy} size="sm" variant="ghost" className="gap-1.5 text-[11px]">
            {copied ? <CheckCheck className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'הועתק' : 'Copy'}
          </Button>
        </div>
      </div>
    </div>
  );
}