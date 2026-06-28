import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Home, Utensils, Dumbbell, Scale, Users, MessageCircle, Activity, Bell, Settings, TrendingUp, LogOut, Menu, X, Sparkles, Star, Wrench, Brain, BookOpen, Zap, Eye, Trophy, FileText } from 'lucide-react';

import PWAInstallPrompt from './components/shared/PWAInstallPrompt';
import PushNotificationSetup from './components/shared/PushNotificationSetup';
import { Button } from '@/components/ui/button';
import ErrorBoundary from './components/shared/ErrorBoundary';
import BootErrorHandler, { initBootErrorHandler } from './components/shared/BootErrorHandler';
import DiagnosticsPanel from './components/shared/DiagnosticsPanel';
import { Toaster } from '@/components/ui/sonner';
import SuperAICoach from './components/trainee/SuperAICoach';
import { format } from 'date-fns';

// Initialize boot error handler
if (typeof window !== 'undefined') {
  initBootErrorHandler();
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname;
  const [showCoachMenu, setShowCoachMenu] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);
  const [showTraineeMore, setShowTraineeMore] = React.useState(false);
  const [showAICoach, setShowAICoach] = React.useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const { data: coachSettingsList } = useQuery({
    queryKey: ['coachSettings', user?.email],
    queryFn: () => base44.entities.CoachSettings.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });
  const coachSettings = coachSettingsList?.[0] || null;
  const menuVisibility = coachSettings?.menu_visibility || {};

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  // Check role from JWT first (immediately available) so the logo is a link before coachTrainees loads
  const isCoachByRole = user?.role === 'admin' || user?.role === 'coach';
  const isCoach = isCoachByRole || (coachTrainees && coachTrainees.length > 0);

  // Module visibility - default all true if not set
  const visibleModules = trainee?.visible_modules || {
    nutrition: true,
    water: true,
    workouts: true,
    metrics: true,
  };

  const handleLogout = async () => {
    try {
      // Clear all stale coach/trainee/impersonation state before logout
      localStorage.removeItem('pending_access_token');
      sessionStorage.removeItem('pending_access_token');
      localStorage.removeItem('coachAsTrainee');
      localStorage.removeItem('impersonation_state');
      localStorage.removeItem('cached_trainee_id');
      sessionStorage.removeItem('coachAsTrainee');
      sessionStorage.removeItem('impersonation_state');
      await base44.auth.logout(window.location.origin);
    } catch (err) {
      console.error('Logout failed:', err);
      window.location.href = window.location.origin;
    }
  };

  const { data: unreadCount = 0 } = useQuery({
    queryKey: ['unreadNotifications', user?.email],
    queryFn: async () => {
      const receipts = await base44.entities.NotificationReceipt.filter({ trainee_email: user?.email });
      return receipts.filter(r => !r.read_at).length;
    },
    enabled: !!user?.email && !isCoach,
  });

  const { data: aiMeals = [] } = useQuery({
    queryKey: ['layoutMeals', user?.email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: user?.email }),
    enabled: !!user?.email && !isCoach && showAICoach,
  });

  const { data: aiWorkouts = [] } = useQuery({
    queryKey: ['layoutWorkouts', user?.email],
    queryFn: () => base44.entities.TraineeWorkout.filter({ user_email: user?.email }),
    enabled: !!user?.email && !isCoach && showAICoach,
  });

  // Filter trainee nav items based on visible modules
  const allTraineeNavItems = [
    { icon: Home, label: 'בית', page: 'TraineeHome', alwaysShow: true },
    { icon: Utensils, label: 'תזונה', page: 'NutritionLog', module: 'nutrition' },
    { icon: Dumbbell, label: 'אימון', page: 'WorkoutLog', module: 'workouts' },
    { icon: Trophy, label: 'ליגה', page: 'ShapeLeagueHome', alwaysShow: true },
    { icon: Bell, label: 'התראות', page: 'TraineeNotifications', badge: unreadCount, alwaysShow: true },
  ];

  const traineeNavItems = allTraineeNavItems.filter(item => 
    item.alwaysShow || (item.module && visibleModules[item.module] !== false)
  );

  const traineeMoreItems = [
    { icon: Scale, label: 'מדדים', page: 'Metrics', module: 'metrics' },
    { icon: Dumbbell, label: 'אונליין', page: 'TraineeOnlineTraining' },
    { icon: BookOpen, label: 'תפריט', page: 'MyMealPlan' },
    { icon: Star, label: 'מתכונים', page: 'Recipes' },
    { icon: Bell, label: 'הגדרות התראות', page: 'AutomationSettings', alwaysShow: true },
  ].filter(item => !item.module || item.alwaysShow || visibleModules[item.module] !== false);

  const coachNavItems = [
    { icon: Home, label: 'בית', page: 'CoachDashboard' },
    { icon: Dumbbell, label: 'אימונים', page: 'CoachDailyWorkout' },
    { icon: TrendingUp, label: 'דוחות', page: 'CoachReports' },
    { icon: Settings, label: 'עוד', page: 'CoachSettings' },
  ];

  const ALL_MENU_ITEMS = [
    { category: 'ניהול מתאמנים', icon: Users, items: [
      { icon: Users, label: 'פאנל מתאמנים', page: 'CoachDashboard' },
    ]},
    { category: 'אימונים', icon: Dumbbell, items: [
      { icon: Users, label: 'אימון קבוצתי', page: 'CoachDailyWorkout' },
      { icon: Users, label: '📋 ניהול אימוני סטודיו', page: 'CoachGroupWorkouts' },
      { icon: Dumbbell, label: 'אימונים', page: 'CoachWorkouts' },
      { icon: Dumbbell, label: '🌐 אימון אונליין V2', page: 'OnlineTrainingCoach' },
    ]},
    { category: 'ניתוח ובקרה', icon: Activity, items: [
      { icon: Activity, label: 'QA', page: 'TraineeQA' },
      { icon: TrendingUp, label: 'דוחות', page: 'CoachReports' },
    ]},
    { category: '💬 WhatsApp', icon: MessageCircle, items: [
      { icon: Zap,           label: '🤖 אוטומציות WhatsApp', page: 'WhatsAppAutomations' },
      { icon: MessageCircle, label: '📱 WhatsApp', page: 'WhatsAppManager' },
    ]},

    { category: '🏆 Shape League', icon: Trophy, items: [
      { icon: Trophy, label: '🏆 Shape League Dashboard', page: 'CoachShapeLeagueDashboard' },
      { icon: Trophy, label: '🏆 ניהול Shape League', page: 'CoachShapeLeagueControlCenter' },
    ]},
    { category: '🧪 דיבוג ובקרה', icon: Wrench, items: [
      { icon: Activity, label: '📊 WhatsApp Debug Center', page: 'WhatsAppDebugCenter' },
      { icon: Brain, label: '🧪 Nutrition AI Debug', page: 'coach/nutrition-ai-debug' },
      { icon: FileText, label: '📄 דוח השוואת AI ארוחות', page: 'AI_MEAL_ANALYSIS_FLOW_COMPARISON_REPORT' },
      { icon: Wrench, label: '🔧 Debug Meal Reminders', page: 'MealReminderDebugger' },
    ]},
    { category: '⚙️ System', icon: Settings, items: [
      { icon: Settings, label: 'הגדרות', page: 'CoachSettings' },
      { icon: Zap, label: '🔔 תזכורות אוטומטיות', page: 'ReminderAutomations' },
      { icon: Settings, label: '⚙️ ניהול תפריט', page: 'CoachMenuManager' },
      { icon: Bell, label: '📩 בקרת התראות', page: 'CoachNotificationControlCenter' },
      { icon: Zap, label: '📱 WhatsApp Control', page: 'WhatsAppControlCenter' },
      { icon: Eye, label: '👁️ ממשק מתאמן', page: 'CoachAsTrainee' },
      { icon: Wrench, label: '🔧 Debug Meal Reminders', page: 'MealReminderDebugger' },
      { icon: Brain, label: '🧪 Nutrition AI Debug', page: 'coach/nutrition-ai-debug' },
      { icon: Activity, label: '📊 WhatsApp Debug Center', page: 'WhatsAppDebugCenter' },
    ]},
  ];

  // Pages that are always hidden from the menu (moved to settings)
  const ALWAYS_HIDDEN_FROM_MENU = [
    'SystemControlCenter', 'SystemSummaryReport', 'SystemHealthMonitor',
    'ManageTrainees', 'SystemNotificationsManager', 'SystemCare', 'SystemAuditLogs',
    'CopyLogs', 'UnitsDebug',
    // Food & messaging (moved to settings)
    'FoodDatabase', 'MessagingCenter', 'NotificationCenter',
    // Analysis
    'TraineeQA', 'CoachReports',
  ];

  // Filter by menu_visibility — if key not set, default to true (show)
  const coachMenuItems = ALL_MENU_ITEMS.map(cat => ({
    ...cat,
    items: cat.items.filter(item => {
      if (ALWAYS_HIDDEN_FROM_MENU.includes(item.page)) return false;
      if (item.adminOnly && user?.role !== 'admin') return false;
      const alwaysVisiblePages = [
        'CoachMenuManager',
        'CoachDashboard',
        'MealReminderDebugger',
        'WhatsAppDebugCenter',
        'coach/nutrition-ai-debug',
        'AI_MEAL_ANALYSIS_FLOW_COMPARISON_REPORT'
      ];
      if (alwaysVisiblePages.includes(item.page)) return true; // always show critical coach/debug pages
      // If no settings saved yet, show everything by default
      if (!coachSettings) return true;
      return menuVisibility[item.page] !== false;
    }),
  })).filter(cat => cat.items.length > 0);

  const navItems = isCoach ? coachNavItems : traineeNavItems;

  // Don't show nav on certain pages
  const hideNav = currentPath.includes('TraineeProfile') || currentPath.includes('AddTrainee');

  return (
    <div className="min-h-screen bg-white" dir="rtl">
      {/* PWA Meta Tags */}
      <meta name="theme-color" content="#79DBD6" />
      <meta name="apple-mobile-web-app-capable" content="yes" />
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      <meta name="apple-mobile-web-app-title" content="FIT COACH" />
      <link rel="manifest" href="/manifest.json" />
      
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          {isCoach ? (
            <Link to={createPageUrl('CoachDashboard')} className="text-xl font-bold" style={{ color: '#79DBD6' }}>
              FIT COACH PRO
            </Link>
          ) : (
            <h2 className="text-xl font-bold" style={{ color: '#79DBD6' }}>
              FIT COACH PRO
            </h2>
          )}
          <div className="flex items-center gap-2">
            {isCoach && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowCoachMenu(!showCoachMenu)}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
              >
                <Menu className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">תפריט מאמן</span>
              </Button>
            )}
            {user && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLogout}
                className="flex items-center gap-2 text-slate-600 hover:text-slate-800"
              >
                <LogOut className="w-4 h-4" />
                <span className="text-sm hidden sm:inline">התנתק</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Trainee More Menu */}
      {!isCoach && showTraineeMore && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowTraineeMore(false)}>
          <div className="fixed right-0 top-0 bottom-0 w-64 bg-white shadow-xl overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center z-10">
              <h3 className="font-bold text-lg">עוד</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowTraineeMore(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="p-2 space-y-1">
              {traineeMoreItems.map(({ label, page, icon: ItemIcon }) => {
                const url = createPageUrl(page);
                return (
                  <Link
                    key={page}
                    to={url}
                    onClick={() => setShowTraineeMore(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-slate-100 transition-colors ${
                      currentPath.includes(page) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-slate-700'
                    }`}
                  >
                    {ItemIcon && <ItemIcon className="w-5 h-5" />}
                    <span className="text-base">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Coach Menu Dropdown */}
      {isCoach && showCoachMenu && (
        <div className="fixed inset-0 z-50 bg-black/50" onClick={() => setShowCoachMenu(false)}>
          <div className="fixed left-0 top-0 bottom-0 w-80 max-w-[88vw] bg-white shadow-xl flex flex-col" onClick={(e) => e.stopPropagation()} dir="rtl">
            <div className="sticky top-0 bg-white p-4 border-b flex justify-between items-center z-10">
              <h3 className="font-bold text-lg">תפריט מאמן</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowCoachMenu(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain p-2 pb-32">
              {coachMenuItems.map((category) => {
                const CategoryIcon = category.icon;
                return (
                  <div key={category.category} className="mb-4">
                    <div className="px-3 py-2 text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                      <CategoryIcon className="w-3 h-3" />
                      {category.category}
                    </div>
                    <div className="space-y-1">
                      {category.items.map(({ label, page, icon: ItemIcon }) => {
                        return (
                          <Link
                            key={page}
                            to={page === 'CoachAsTrainee' ? '/CoachAsTrainee' : page.includes('/') ? `/${page}` : createPageUrl(page)}
                            onClick={() => setShowCoachMenu(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 rounded-lg hover:bg-slate-100 transition-colors ${
                              currentPath.includes(page) ? 'bg-teal-50 text-teal-700 font-medium' : 'text-slate-700'
                            }`}
                          >
                            {ItemIcon && <ItemIcon className="w-4 h-4" />}
                            <span className="text-sm">{label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <ErrorBoundary>
        <BootErrorHandler />
        {children}
      </ErrorBoundary>
      
      <Toaster position="top-center" richColors />
      
      {!isCoach && (
        <>
          <PWAInstallPrompt />
          <PushNotificationSetup />
        </>
      )}
      
      {!hideNav && (
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 safe-area-inset-bottom">
          <div className="max-w-lg mx-auto">
            <div className="flex justify-around items-center h-16">
              {navItems.map(({ icon: Icon, label, page, badge }) => {
                const url = createPageUrl(page);
                const isActive = currentPath === url || currentPath.includes(page);
                const isHomeBtn = page === 'CoachDashboard' && isCoach;
                // When Home is clicked while on CoachDashboard (possibly inside trainee panel),
                // dispatch a custom DOM event so the inline panel closes immediately —
                // this is more reliable than relying on React Router same-URL navigation
                // creating a new location.key.
                const handleNavClick = isHomeBtn
                  ? (e) => {
                      e.preventDefault();
                      window.dispatchEvent(new CustomEvent('fitcoach:closePanels'));
                      navigate(url, { state: { closePanel: true } });
                    }
                  : undefined;
                return (
                  <Link
                    key={page}
                    to={url}
                    onClick={handleNavClick}
                    className="flex flex-col items-center justify-center flex-1 h-full transition-colors relative min-w-0"
                    style={{ color: isActive ? '#79DBD6' : '#94a3b8' }}
                  >
                    <Icon className={`w-5 h-5 mb-1 flex-shrink-0 ${isActive ? 'stroke-[2.5px]' : ''}`} />
                    {badge > 0 && (
                      <span className="absolute top-2 left-1/2 transform translate-x-2 -translate-y-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                    <span className={`text-[10px] sm:text-xs truncate max-w-full px-1 ${isActive ? 'font-medium' : ''}`}>{label}</span>
                  </Link>
                );
              })}
              {!isCoach && (
                <button
                  onClick={() => setShowTraineeMore(true)}
                  className="flex flex-col items-center justify-center flex-1 h-full transition-colors relative min-w-0"
                  style={{ color: '#94a3b8' }}
                >
                  <Menu className="w-5 h-5 mb-1 flex-shrink-0" />
                  <span className="text-[10px] sm:text-xs">עוד</span>
                </button>
              )}
            </div>
          </div>
        </nav>
      )}
      
      {/* Diagnostics FAB — dev mode or admin only */}
      {(import.meta.env.DEV || user?.role === 'admin') && (
        <button
          onClick={() => setShowDiagnostics(true)}
          className="fixed bottom-20 left-4 w-10 h-10 rounded-full shadow-lg flex items-center justify-center z-40 hover:scale-110 transition-transform opacity-40 hover:opacity-100"
          style={{ backgroundColor: '#94a3b8' }}
          title="פתח דיאגנוסטיקה"
        >
          <Wrench className="w-4 h-4 text-white" />
        </button>
      )}

      {/* AI Coach FAB - only for trainees */}
      {!isCoach && (
        <button
          onClick={() => setShowAICoach(true)}
          className="fixed bottom-20 right-4 w-14 h-14 rounded-full shadow-xl flex items-center justify-center z-40 hover:scale-110 transition-transform"
          style={{ background: 'linear-gradient(135deg, #79DBD6, #5BC5C0)' }}
          title="AI Coach - אליאור"
        >
          <Sparkles className="w-6 h-6 text-white" />
        </button>
      )}
      
      <DiagnosticsPanel open={showDiagnostics} onClose={() => setShowDiagnostics(false)} />

      {!isCoach && (
        <SuperAICoach
          open={showAICoach}
          onClose={() => setShowAICoach(false)}
          trainee={trainee}
          meals={aiMeals}
          water={[]}
          workouts={aiWorkouts}
        />
      )}
    </div>
  );
}