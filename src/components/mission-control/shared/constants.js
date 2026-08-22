export const TRIGGER_TYPES = [
  { value: 'manual_test',              label: 'בדיקה ידנית',                   category: 'test' },
  { value: 'new_trainee_created',      label: 'מתאמן חדש נוצר',                 category: 'onboarding' },
  { value: 'first_login',             label: 'כניסה ראשונה',                   category: 'onboarding' },
  { value: 'daily_workout_reminder',  label: 'תזכורת אימון יומית',              category: 'reminder' },
  { value: 'meal_log_reminder',       label: 'תזכורת רישום ארוחות',            category: 'reminder' },
  { value: 'water_reminder',          label: 'תזכורת מים',                     category: 'reminder' },
  { value: 'inactive_3days',          label: 'לא פעיל 3 ימים',                  category: 'absence' },
  { value: 'inactive_7days',          label: 'לא פעיל 7 ימים',                  category: 'absence' },
  { value: 'inactive_14days',         label: 'לא פעיל 14 ימים',                 category: 'absence' },
  { value: 'inactive_30days',         label: 'לא פעיל 30 ימים',                 category: 'absence' },
  { value: 'inactive_trainee',        label: 'מתאמן לא פעיל (כללי)',            category: 'absence' },
  { value: 'weekly_summary',          label: 'סיכום שבועי',                    category: 'engagement' },
  { value: 'monthly_summary',         label: 'סיכום חודשי',                    category: 'engagement' },
  { value: 'birthday',                label: 'יום הולדת',                      category: 'engagement' },
  { value: 'membership_expiration',   label: 'מנוי עומד לפוג',                  category: 'membership' },
  { value: 'membership_renewed',      label: 'מנוי חודש',                      category: 'membership' },
  { value: 'membership_frozen',       label: 'מנוי הוקפא',                     category: 'membership' },
  { value: 'returned_after_absence',  label: 'חזר אחרי היעדרות',               category: 'absence' },
  { value: 'attendance_below_avg',    label: 'נוכחות מתחת לממוצע',             category: 'absence' },
  { value: 'custom_scheduled',        label: 'שליחה מתוזמנת מותאמת',           category: 'custom' },
];

export const TRIGGER_COLORS = {
  test:       'bg-slate-100 text-slate-600 border-slate-200',
  onboarding: 'bg-blue-50 text-blue-700 border-blue-200',
  reminder:   'bg-amber-50 text-amber-700 border-amber-200',
  absence:    'bg-red-50 text-red-700 border-red-200',
  engagement: 'bg-purple-50 text-purple-700 border-purple-200',
  membership: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  custom:     'bg-teal-50 text-teal-700 border-teal-200',
};

export const CONSENT_CATEGORIES = [
  { value: 'whatsapp_reminder',   label: 'תזכורות WhatsApp' },
  { value: 'workout_reminder',    label: 'תזכורות אימון' },
  { value: 'nutrition_reminder',  label: 'תזכורות תזונה' },
  { value: 'water_reminder',      label: 'תזכורות מים' },
  { value: 'inactivity_reminder', label: 'תזכורות אי-פעילות' },
];

export const RISK_COLORS = {
  green:  { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  dot: 'bg-green-500'  },
  yellow: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400'  },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-600'    },
};

export const DAYS_SHORT = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

export const VARIABLE_HINTS = [
  { var: '{{trainee_name}}', desc: 'שם המתאמן' },
  { var: '{{coach_name}}',   desc: 'שם המאמן' },
  { var: '{{app_link}}',     desc: 'קישור לאפליקציה' },
  { var: '{{date}}',         desc: 'תאריך היום' },
];

export const EMPTY_FORM = {
  name: '', trigger_type: 'daily_workout_reminder',
  message_template: 'שלום {{trainee_name}},\n\nהודעה מ-FitCoach 💪',
  target_type: 'all', target_phone: '', schedule_config: '',
  consent_category: 'whatsapp_reminder', enabled: false, cooldown_hours: 24,
};
