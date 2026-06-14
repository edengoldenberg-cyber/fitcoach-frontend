import React from 'react';
import { Code2, Shield } from 'lucide-react';

const FUNCTION_MAP = [
  { name: 'whatsAppQueueWorker', description: 'מעבד הודעות מהתור ושולח ב-GreenAPI', killSwitchProtected: true, sendsDirectly: true, channel: 'greenapi' },
  { name: 'sendWhatsAppMessage', description: 'שליחה ישירה ב-GreenAPI', killSwitchProtected: true, sendsDirectly: true, channel: 'greenapi (direct)' },
  { name: 'enqueueWhatsAppMessage', description: 'מוסיף הודעה לתור', killSwitchProtected: true, sendsDirectly: false, channel: 'queue' },
  { name: 'claimAndQueueOutbound', description: 'שומר claim ויוצר queue record לתשובות AI', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'onTraineeCreated', description: 'ברכות למתאמן חדש', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'reminderMealLog', description: 'תזכורת ארוחות למתאמנים', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'reminderWaterLog', description: 'תזכורת מים למתאמנים', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'workoutMotivationCheck', description: 'עידוד אימונים שבועי', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'nudgeScheduler', description: 'Nudge ללידים ללא תגובה', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
  { name: 'flowTimeoutChecker', description: 'Follow-up לשלבי flow שפג זמנם', killSwitchProtected: true, sendsDirectly: false, channel: 'queue → worker' },
];

export default function FunctionPathMap({ killSwitchActive }) {
  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      <div className="flex items-center gap-2 mb-4">
        <Code2 className="w-5 h-5 text-slate-600" />
        <h2 className="font-bold text-slate-800 text-lg">🗺️ Function Path Map</h2>
        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium ml-auto">
          ✅ כל 10 הפונקציות מוגנות
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium">פונקציה</th>
              <th className="text-right py-2 px-3 text-xs text-slate-500 font-medium hidden md:table-cell">תיאור</th>
              <th className="text-center py-2 px-3 text-xs text-slate-500 font-medium">Kill Switch</th>
              <th className="text-center py-2 px-3 text-xs text-slate-500 font-medium">ערוץ</th>
              <th className="text-center py-2 px-3 text-xs text-slate-500 font-medium">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {FUNCTION_MAP.map((fn) => {
              const isBlocked = killSwitchActive;
              return (
                <tr key={fn.name}>
                  <td className="py-2 px-3">
                    <div className="font-mono text-xs font-medium text-slate-800">{fn.name}</div>
                    {fn.sendsDirectly && (
                      <div className="text-xs text-orange-500 mt-0.5">⚡ שולח ישירות</div>
                    )}
                  </td>
                  <td className="py-2 px-3 hidden md:table-cell text-xs text-slate-500">{fn.description}</td>
                  <td className="py-2 px-3 text-center">
                    <Shield className="w-4 h-4 text-green-500 mx-auto" />
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className="text-xs font-mono bg-slate-100 px-1.5 py-0.5 rounded">{fn.channel}</span>
                  </td>
                  <td className="py-2 px-3 text-center">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      isBlocked
                        ? 'bg-red-100 text-red-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {isBlocked ? '🔒 חסום' : '🟢 פעיל'}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
        ✅ כל 10 הפונקציות קוראות את ה-kill switch מ-<code className="bg-green-100 px-1 rounded">SystemConfig["GLOBAL_WHATSAPP_ENABLED"]</code> — שורת בדיקה אחת משותפת לכולן.
      </div>
    </div>
  );
}