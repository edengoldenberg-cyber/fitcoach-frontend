/**
 * CoachAutomations — deprecated page.
 *
 * This page previously used the AutomationRule entity which no longer exists.
 * All automation management has moved to WhatsAppAutomations.
 * Page is kept in the registry to avoid 404 errors on bookmarked URLs.
 */
import React from 'react';
import { Zap, ArrowLeft } from 'lucide-react';

export default function CoachAutomations() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-4">
        <div className="w-12 h-12 rounded-xl bg-teal-50 border border-teal-100 flex items-center justify-center mx-auto">
          <Zap className="w-6 h-6 text-teal-500" />
        </div>
        <h1 className="text-lg font-bold text-slate-800">ניהול אוטומציות</h1>
        <p className="text-sm text-slate-500">
          ניהול האוטומציות עבר לדף החדש.
        </p>
        <a
          href="/WhatsAppAutomations"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-500 hover:bg-teal-600 text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          עבור לניהול אוטומציות
        </a>
      </div>
    </div>
  );
}
