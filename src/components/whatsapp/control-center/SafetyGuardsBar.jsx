import React from 'react';
import { Shield, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

export default function SafetyGuardsBar({ killSwitchActive, queueCounts, providerConfig }) {
  const queueEmpty = queueCounts.total_unsent === 0;
  const canSend = !killSwitchActive;

  const guards = [
    {
      label: 'Kill Switch',
      ok: killSwitchActive,
      value: killSwitchActive ? 'פעיל — שליחה חסומה' : '⚠️ כבוי — שליחה מאופשרת',
    },
    {
      label: 'תור הודעות',
      ok: queueEmpty,
      value: queueEmpty ? `ריק (${queueCounts.total_unsent})` : `${queueCounts.total_unsent} ממתינות`,
    },
    {
      label: 'GreenAPI',
      ok: providerConfig?.status !== 'connected',
      value: providerConfig?.status === 'connected' ? '🟢 מחובר' : '⚫ לא מחובר',
    },
    {
      label: 'האם WhatsApp יכול לצאת עכשיו?',
      ok: !canSend,
      value: canSend ? '⚠️ YES — OUTBOUND ACTIVE' : '✅ NO — SAFE',
      big: true,
    },
  ];

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Shield className="w-5 h-5 text-slate-600" />
        <h2 className="font-bold text-slate-800">🛡️ Safety Guards</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {guards.map((g) => (
          <div
            key={g.label}
            className={`rounded-xl p-3 border-2 ${
              g.ok
                ? 'bg-green-50 border-green-200'
                : 'bg-red-50 border-red-300'
            } ${g.big ? 'col-span-2 md:col-span-1' : ''}`}
          >
            <div className="flex items-center gap-1 mb-1">
              {g.ok
                ? <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                : <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              }
              <span className="text-xs font-bold text-slate-600">{g.label}</span>
            </div>
            <div className={`text-sm font-bold ${g.ok ? 'text-green-700' : 'text-red-700'}`}>
              {g.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}