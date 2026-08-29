import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Bell, MessageCircle, Dumbbell, Utensils, Droplets, Scale, Brain, Megaphone, Trophy, Smartphone, CheckCircle2, AlertCircle, BellOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { usePushSubscription } from '@/hooks/usePushSubscription';

// ─── PushStatusSection ──────────────────────────────────────────────────────
// Full push registration management for trainees.
// Shows real status (browser permission + PushManager subscription + DB record)
// and provides appropriate action without any technical jargon.

function PushStatusSection({ userEmail }) {
  const {
    status, permission, dbSubs,
    subscribe, unsubscribe,
    isSubscribing, isUnsubscribing,
    subscribeError, isChecking,
  } = usePushSubscription(userEmail);

  // iOS Safari: Push requires the app to be installed on the Home Screen.
  // Show clear instructions instead of a broken register button.
  if (status === 'ios_safari') {
    return (
      <Card className="p-4 border bg-blue-50 border-blue-200">
        <div className="flex items-center gap-2 mb-2">
          <Smartphone className="w-4 h-4 text-blue-500" />
          <span className="font-semibold text-slate-800 text-sm">התראות Push</span>
          <span className="text-xs font-medium ml-auto text-blue-700">דרוש התקנה</span>
        </div>
        <p className="text-sm text-slate-700 mb-2">
          יש להוסיף את FitCoach למסך הבית כדי לקבל התראות באייפון:
        </p>
        <ol className="text-xs text-slate-600 space-y-1 list-decimal list-inside">
          <li>לחץ על כפתור השיתוף <strong>⎙</strong> בתחתית Safari</li>
          <li>בחר <strong>"הוסף למסך הבית"</strong></li>
          <li>פתח את FitCoach מהמסך הראשי</li>
          <li>חזור לדף זה והפעל התראות</li>
        </ol>
      </Card>
    );
  }

  if (status === 'unsupported') {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <BellOff className="w-4 h-4 text-slate-400" />
          <span className="font-semibold text-slate-700 text-sm">התראות Push</span>
        </div>
        <p className="text-sm text-slate-500">
          Push אינו נתמך במצב הנוכחי.
        </p>
      </Card>
    );
  }

  const statusConfig = {
    active: {
      icon:  <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
      label: 'פעילות ✓',
      color: 'text-emerald-700',
      bg:    'bg-emerald-50 border-emerald-200',
      desc:  `המכשיר הזה רשום לקבלת התראות (${dbSubs.length} רישום${dbSubs.length > 1 ? 'ים' : ''})`,
    },
    not_synced: {
      icon:  <AlertCircle className="w-4 h-4 text-amber-500" />,
      label: 'לא מסונכרן',
      color: 'text-amber-700',
      bg:    'bg-amber-50 border-amber-200',
      desc:  'הדפדפן מאפשר התראות אך המכשיר לא רשום בשרת. לחץ "רשום את המכשיר".',
    },
    no_registration: {
      icon:  <AlertCircle className="w-4 h-4 text-orange-500" />,
      label: 'לא רשום',
      color: 'text-orange-700',
      bg:    'bg-orange-50 border-orange-200',
      desc:  'ההרשאה ניתנה אך המכשיר לא רשום. לחץ "רשום את המכשיר".',
    },
    no_permission: {
      icon:  <Bell className="w-4 h-4 text-blue-500" />,
      label: 'לא הופעלו',
      color: 'text-blue-700',
      bg:    'bg-blue-50 border-blue-200',
      desc:  'לחץ "הפעל התראות" כדי לקבל התראות בזמן אמת',
    },
    blocked: {
      icon:  <BellOff className="w-4 h-4 text-red-400" />,
      label: 'חסומות בדפדפן',
      color: 'text-red-700',
      bg:    'bg-red-50 border-red-200',
      desc:  null,
    },
  };

  const cfg = statusConfig[status] || statusConfig.no_permission;

  const actionButton = (() => {
    if (isSubscribing) {
      return (
        <Button disabled size="sm" className="gap-1.5">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          מפעיל...
        </Button>
      );
    }
    if (isUnsubscribing) {
      return (
        <Button disabled variant="outline" size="sm">
          מכבה...
        </Button>
      );
    }
    if (status === 'active') {
      return (
        <Button
          variant="outline"
          size="sm"
          onClick={() => unsubscribe()}
          className="text-slate-600"
        >
          כבה התראות
        </Button>
      );
    }
    if (status === 'blocked') return null;
    if (status === 'no_registration' || status === 'not_synced') {
      return (
        <Button
          size="sm"
          onClick={() => subscribe()}
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
        >
          רשום את המכשיר
        </Button>
      );
    }
    // no_permission
    return (
      <Button
        size="sm"
        onClick={() => subscribe()}
        style={{ backgroundColor: '#79DBD6', color: 'white' }}
      >
        הפעל התראות
      </Button>
    );
  })();

  return (
    <Card className={`p-4 border ${cfg.bg}`}>
      <div className="flex items-center gap-2 mb-2">
        {isChecking
          ? <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          : cfg.icon}
        <span className="font-semibold text-slate-800 text-sm">התראות Push</span>
        <span className={`text-xs font-medium ml-auto ${cfg.color}`}>{cfg.label}</span>
      </div>

      {status === 'blocked' ? (
        <div className="text-sm text-red-700 space-y-1">
          <p>ההתראות חסומות בהגדרות המכשיר.</p>
          <p className="text-xs text-red-600">
            <strong>iOS:</strong> הגדרות ← FitCoach ← התראות → אפשר<br />
            <strong>Android:</strong> הגדרות ← אפליקציות ← Chrome ← הרשאות ← התראות → אפשר
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-600 mb-3">{cfg.desc}</p>
      )}

      {subscribeError && (
        <p className="text-xs text-red-600 mb-2">{subscribeError.message}</p>
      )}

      {actionButton && (
        <div className="flex justify-end">{actionButton}</div>
      )}
    </Card>
  );
}

const PREF_GROUPS = [
  {
    label: 'WhatsApp',
    icon: MessageCircle,
    color: 'text-green-600',
    prefs: [
      { key: 'whatsapp_reminders_enabled', label: 'תזכורות WhatsApp כלליות' },
    ],
  },
  {
    label: 'אימונים',
    icon: Dumbbell,
    color: 'text-blue-600',
    prefs: [
      { key: 'workout_reminders_enabled', label: 'תזכורות אימון' },
    ],
  },
  {
    label: 'תזונה',
    icon: Utensils,
    color: 'text-orange-600',
    prefs: [
      { key: 'nutrition_reminders_enabled', label: 'תזכורות רישום ארוחות' },
    ],
  },
  {
    label: 'שתייה',
    icon: Droplets,
    color: 'text-cyan-600',
    prefs: [
      { key: 'water_reminders_enabled', label: 'תזכורות שתיית מים' },
    ],
  },
  {
    label: 'שקילה',
    icon: Scale,
    color: 'text-purple-600',
    prefs: [
      { key: 'weigh_in_reminders_enabled', label: 'תזכורות שקילה שבועית' },
      { key: 'inactivity_reminders_enabled', label: 'תזכורות אחרי חוסר פעילות' },
    ],
  },
  {
    label: 'AI מאמן',
    icon: Brain,
    color: 'text-teal-600',
    prefs: [
      { key: 'ai_followups_enabled', label: 'מעקב AI אוטומטי' },
    ],
  },
  {
    label: 'Shape League',
    icon: Trophy,
    color: 'text-yellow-600',
    prefs: [
      { key: 'league_notifications_enabled', label: 'התראות Shape League' },
    ],
  },
  // Push device registration is handled by PushStatusSection above;
  // only the consent toggle (push_notifications_enabled) remains here.
  {
    label: 'Push',
    icon: Smartphone,
    color: 'text-slate-600',
    prefs: [
      { key: 'push_notifications_enabled', label: 'אפשר שליחת Push מהמאמן ותזכורות' },
    ],
  },
  {
    label: 'שיווק',
    icon: Megaphone,
    color: 'text-red-600',
    prefs: [
      { key: 'marketing_messages_enabled', label: 'הודעות שיווקיות ומבצעים' },
    ],
  },
];

const ALL_PREF_KEYS = PREF_GROUPS.flatMap(g => g.prefs.map(p => p.key));

export default function AutomationSettings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email, user?.id],
    queryFn: async () => {
      // Primary: lookup by user_id (most reliable — works even if user_email is null on the record)
      if (user.id) {
        const byId = await base44.entities.Trainee.filter({ user_id: user.id });
        if (byId.length > 0) return byId[0];
      }
      // Fallback: lookup by email
      const byEmail = await base44.entities.Trainee.filter({ user_email: user.email });
      return byEmail[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: prefsRaw, isLoading } = useQuery({
    queryKey: ['notifPrefs', trainee?.id],
    queryFn: async () => {
      // The ownership filter now handles trainee_id OR trainee_email lookup on the backend
      const list = await base44.entities.NotificationPreferences.filter({ trainee_id: trainee.id });
      return list[0] || null;
    },
    enabled: !!trainee?.id,
  });

  const [prefs, setPrefs] = useState({});

  useEffect(() => {
    if (prefsRaw) {
      const picked = {};
      ALL_PREF_KEYS.forEach(k => { picked[k] = prefsRaw[k] === true; });
      setPrefs(picked);
    } else {
      const defaults = {};
      ALL_PREF_KEYS.forEach(k => { defaults[k] = false; });
      setPrefs(defaults);
    }
  }, [prefsRaw]);

  const saveMutation = useMutation({
    mutationFn: async (newPrefs) => {
      return base44.functions.invoke('updateAutomationConsent', {
        trainee_id: trainee.id,
        trainee_email: user.email,
        preferences: newPrefs,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifPrefs'] });
      toast.success('העדפות שמורות');
    },
    onError: () => toast.error('שגיאה בשמירה'),
  });

  // Enabling any specific reminder type implicitly requires the master WhatsApp toggle.
  // Without master=true, canSendAutomation blocks all reminders silently.
  const REMINDER_TYPES_REQUIRING_MASTER = new Set([
    'nutrition_reminders_enabled',
    'water_reminders_enabled',
    'workout_reminders_enabled',
    'weigh_in_reminders_enabled',
  ]);

  const toggle = (key) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    // When a specific reminder type is toggled ON, auto-enable the master WhatsApp toggle.
    // When toggling OFF, or toggling non-reminder keys, leave master unchanged.
    if (REMINDER_TYPES_REQUIRING_MASTER.has(key) && updated[key] === true) {
      updated.whatsapp_reminders_enabled = true;
    }
    setPrefs(updated);
    saveMutation.mutate(updated);
  };

  const enableAll = () => {
    const all = {};
    ALL_PREF_KEYS.forEach(k => { all[k] = true; });
    setPrefs(all);
    saveMutation.mutate(all);
  };

  const disableAll = () => {
    const none = {};
    ALL_PREF_KEYS.forEach(k => { none[k] = false; });
    setPrefs(none);
    saveMutation.mutate(none);
  };

  const activeCount = ALL_PREF_KEYS.filter(k => prefs[k] === true).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Bell className="w-5 h-5" style={{ color: '#79DBD6' }} />
                הגדרות אוטומציות
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">
                {activeCount} מתוך {ALL_PREF_KEYS.length} פעילים
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={disableAll}>כבה הכל</Button>
              <Button size="sm" onClick={enableAll} style={{ backgroundColor: '#79DBD6' }}>הפעל הכל</Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">
        {/* Push device registration — shown before the pref toggles */}
        {user?.email && <PushStatusSection userEmail={user.email} />}

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
          <strong>ברירת מחדל: כל האוטומציות כבויות.</strong>{' '}
          הפעל רק את מה שאתה רוצה לקבל. לא נשלח שום הודעה ללא הסכמה מפורשת שלך.
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          PREF_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            return (
              <Card key={group.label} className="p-4">
                <div className="flex items-center gap-2 mb-3 pb-2 border-b">
                  <GroupIcon className={`w-4 h-4 ${group.color}`} />
                  <span className="font-semibold text-slate-800 text-sm">{group.label}</span>
                </div>
                <div className="space-y-3">
                  {group.prefs.map(({ key, label }) => (
                    <div key={key} className="flex items-center justify-between">
                      <Label className="text-sm text-slate-700 cursor-pointer" htmlFor={key}>
                        {label}
                      </Label>
                      <Switch
                        id={key}
                        checked={prefs[key] === true}
                        onCheckedChange={() => toggle(key)}
                        disabled={saveMutation.isPending}
                      />
                    </div>
                  ))}
                </div>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
