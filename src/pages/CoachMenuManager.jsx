import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

const MENU_ITEMS_CONFIG = [
  { category: 'ניהול מתאמנים', items: [
    { page: 'CoachDashboard', label: 'פאנל מתאמנים' },
  ]},
  { category: 'אימונים', items: [
    { page: 'CoachDailyWorkout', label: 'אימון קבוצתי' },
    { page: 'CoachGroupWorkouts', label: 'ניהול אימוני סטודיו' },
    { page: 'CoachWorkouts', label: 'אימונים' },
    { page: 'OnlineTrainingCoach', label: 'אימון אונליין V2' },
  ]},
  { category: 'תזונה', items: [
    { page: 'CoachNutrition', label: 'מעקב תזונה' },
    { page: 'FoodDatabase', label: 'מאגר מזון' },
    { page: 'SuggestFavoritesManager', label: '✨ מאכלים מועדפים' },
    { page: 'CoachRecommendedFoods', label: '👨‍🏫 מומלצים מהמאמן' },
    { page: 'TemplateManager', label: '📋 ניהול טמפלטים' },
    { page: 'PendingFoods', label: 'הצעות מוצרים' },

  ]},
  { category: 'תקשורת', items: [
    { page: 'MessagingCenter', label: 'הודעות' },
    { page: 'NotificationCenter', label: 'התראות' },
  ]},


  { category: 'System', items: [
    { page: 'CoachSettings', label: 'הגדרות' },
    { page: 'ReminderAutomations', label: '🔔 תזכורות אוטומטיות' },
  ]},
];

export default function CoachMenuManager() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['coachSettings', user?.email],
    queryFn: () => base44.entities.CoachSettings.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
    select: (data) => data[0] || null,
  });

  const [visibility, setVisibility] = useState({});

  useEffect(() => {
    if (settings?.menu_visibility) {
      setVisibility(settings.menu_visibility);
    } else {
      // defaults
      const defaults = {};
      MENU_ITEMS_CONFIG.forEach(cat => cat.items.forEach(item => {
        defaults[item.page] = true;
      }));
      setVisibility(defaults);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (newVisibility) => {
      if (settings?.id) {
        await base44.entities.CoachSettings.update(settings.id, { menu_visibility: newVisibility });
      } else {
        await base44.entities.CoachSettings.create({ coach_email: user.email, menu_visibility: newVisibility });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachSettings'] });
      toast.success('ההגדרות נשמרו');
    },
  });

  const toggle = (page) => {
    const updated = { ...visibility, [page]: !visibility[page] };
    setVisibility(updated);
    saveMutation.mutate(updated);
  };

  if (isLoading) return <div className="p-6 text-center text-slate-500">טוען...</div>;

  return (
    <div className="max-w-lg mx-auto p-4 pb-24" dir="rtl">
      <h1 className="text-2xl font-bold text-slate-800 mb-1">ניהול תפריט מאמן</h1>
      <p className="text-slate-500 text-sm mb-6">בחר אילו פריטים יוצגו בתפריט המאמן שלך</p>

      <div className="space-y-6">
        {MENU_ITEMS_CONFIG.map((cat) => (
          <div key={cat.category}>
            <h2 className="text-xs font-bold text-slate-400 uppercase mb-2 px-1">{cat.category}</h2>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-50">
              {cat.items.map((item) => (
                <div key={item.page} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <Switch
                    checked={visibility[item.page] !== false}
                    onCheckedChange={() => toggle(item.page)}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}