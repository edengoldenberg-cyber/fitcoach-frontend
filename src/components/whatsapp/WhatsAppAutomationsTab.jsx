/**
 * WhatsAppAutomationsTab — deprecated.
 *
 * This tab used the WhatsAppAutomationRule entity which no longer exists.
 * Full automation management is at /WhatsAppAutomations.
 */
import React from 'react';
import { Zap, ExternalLink } from 'lucide-react';

export default function WhatsAppAutomationsTab({ coachEmail }) {
  return (
    <div className="p-6 space-y-4" dir="rtl">
      <div className="bg-teal-50 border border-teal-200 rounded-xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-teal-500 flex items-center justify-center flex-shrink-0">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="font-bold text-teal-900 text-sm">ניהול אוטומציות עבר לדף ייעודי</p>
          <p className="text-xs text-teal-700 mt-1">
            כל האוטומציות, ניהול מחזור החיים, ההיסטוריה והצגה מקדימה זמינים בלוח האוטומציות המלא.
          </p>
          <a
            href="/WhatsAppAutomations"
            className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-teal-500 hover:bg-teal-600 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            עבור ללוח האוטומציות
          </a>
        </div>
      </div>
    </div>
  );
}
