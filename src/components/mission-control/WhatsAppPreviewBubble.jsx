import React from 'react';

const SAMPLE_VARS = {
  trainee_name:        'ישראל ישראלי',
  coach_name:          'המאמן שלך',
  trainer_name:        'המאמן שלך',
  class_name:          'אימון כוח',
  class_date:          new Date().toLocaleDateString('he-IL'),
  class_time:          '08:00',
  branch_name:         'סניף תל אביב',
  remaining_sessions:  '5',
  package_expiry_date: new Date(Date.now() + 7 * 86400000).toLocaleDateString('he-IL'),
  absence_count:       '7',
  last_visit_date:     new Date(Date.now() - 7 * 86400000).toLocaleDateString('he-IL'),
  app_link:            'https://fitcoach.app',
  date:                new Date().toLocaleDateString('he-IL'),
};

export function renderPreviewText(template) {
  if (!template) return '';
  return Object.entries(SAMPLE_VARS).reduce(
    (t, [k, v]) => t.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), v),
    template
  );
}

export default function WhatsAppPreviewBubble({ text, className = '' }) {
  const rendered = renderPreviewText(text || '');

  return (
    <div className={`bg-[#e5ddd5] rounded-xl p-4 min-h-[100px] ${className}`} dir="rtl">
      {/* Chat header */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#d0c9c1]">
        <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
          FC
        </div>
        <div>
          <p className="text-xs font-semibold text-slate-800">FitCoach Pro</p>
          <p className="text-[10px] text-slate-500">WhatsApp Business</p>
        </div>
      </div>

      {/* Message bubble */}
      {rendered ? (
        <div className="flex justify-start">
          <div className="bg-white rounded-lg rounded-tl-none shadow-sm px-3 py-2 max-w-[85%]">
            <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed break-words">
              {rendered}
            </p>
            <p className="text-[10px] text-slate-400 text-left mt-1">
              {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })} ✓✓
            </p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-4">הוסף תוכן הודעה לפרויו</p>
      )}

      <p className="text-[10px] text-slate-400 text-center mt-3">
        * תצוגה מקדימה עם נתוני דוגמה
      </p>
    </div>
  );
}
