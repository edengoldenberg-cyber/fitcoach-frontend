import React from 'react';
import { Wifi, WifiOff, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function GreenAPISection({ providerConfig, onRefresh }) {
  const isConnected = providerConfig?.status === 'connected';
  const isEnabled = providerConfig?.is_enabled;

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Wifi className="w-5 h-5 text-slate-600" />
        <h2 className="font-bold text-slate-800 text-lg">📡 GreenAPI Connection</h2>
      </div>

      {!providerConfig ? (
        <div className="text-slate-500 text-sm bg-slate-50 rounded-lg p-4">
          לא נמצא Provider Config — GreenAPI לא מוגדר
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <InfoCell label="סטטוס" value={
            <span className={`font-bold ${isConnected ? 'text-green-600' : 'text-slate-500'}`}>
              {isConnected ? '🟢 מחובר' : '⚫ לא מחובר'}
            </span>
          } />
          <InfoCell label="מאופשר" value={
            <span className={isEnabled ? 'text-green-600 font-bold' : 'text-slate-400'}>
              {isEnabled ? '✅ כן' : '❌ לא'}
            </span>
          } />
          <InfoCell label="סוג Provider" value={providerConfig.provider_type || '—'} />
          <InfoCell label="Instance ID" value={providerConfig.instance_id || '—'} />
          <InfoCell label="טלפון מחובר" value={providerConfig.phone_number_e164 || '—'} />
          <InfoCell label="בדיקה אחרונה" value={
            providerConfig.last_test_at
              ? format(new Date(providerConfig.last_test_at), 'dd/MM HH:mm')
              : '—'
          } />
          {providerConfig.last_error && (
            <div className="col-span-2 md:col-span-3 bg-red-50 rounded-lg p-3 border border-red-200 flex gap-2">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-xs font-bold text-red-700">שגיאה אחרונה</div>
                <div className="text-xs text-red-600 mt-0.5">{providerConfig.last_error}</div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
        ⚠️ <strong>חיבור/ניתוק GreenAPI</strong> מנוהל דרך הגדרות ה-Provider Config בלבד.
        הפאנל הזה הוא <strong>Read-Only</strong> לגבי מצב החיבור.
        לשינוי — עבור ל-WhatsApp Settings.
      </div>
    </div>
  );
}

function InfoCell({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-slate-800">{value}</div>
    </div>
  );
}