import React from 'react';
import { CheckCircle2, AlertTriangle, Radio } from 'lucide-react';

/**
 * Top live safety indicator bar:
 * 🟢 Safe — kill switch active, no send possible
 * 🟡 Limited — kill switch active but GreenAPI connected (test-only)
 * 🔴 Live — kill switch off, sending enabled
 */
export default function SafetyStatusBar({ killSwitchActive, providerConnected }) {
  let mode, label, description, bg, icon;

  if (!killSwitchActive) {
    mode = 'live';
    label = '🔴 LIVE — שליחה מאופשרת';
    description = 'Kill switch כבוי — הודעות WhatsApp יכולות לצאת עכשיו';
    bg = 'bg-red-600';
    icon = <Radio className="w-5 h-5 text-white animate-pulse" />;
  } else if (providerConnected) {
    mode = 'limited';
    label = '🟡 מחובר — בלוק פעיל';
    description = 'GreenAPI מחובר אך Kill Switch חוסם — לא ניתן לשלוח';
    bg = 'bg-amber-500';
    icon = <AlertTriangle className="w-5 h-5 text-white" />;
  } else {
    mode = 'safe';
    label = '🟢 SAFE — שליחה חסומה לחלוטין';
    description = 'Kill Switch פעיל, GreenAPI לא מחובר — אפס סיכון לשליחה';
    bg = 'bg-green-600';
    icon = <CheckCircle2 className="w-5 h-5 text-white" />;
  }

  return (
    <div className={`${bg} rounded-2xl p-4 text-white flex items-center gap-4 shadow-md`}>
      {icon}
      <div className="flex-1">
        <div className="font-bold text-lg">{label}</div>
        <div className="text-sm opacity-90">{description}</div>
      </div>
      <div className={`px-4 py-2 rounded-xl font-mono text-sm font-bold ${
        mode === 'live' ? 'bg-red-800' : mode === 'limited' ? 'bg-amber-600' : 'bg-green-800'
      }`}>
        GLOBAL_WHATSAPP_ENABLED = {killSwitchActive ? 'false' : 'true'}
      </div>
    </div>
  );
}