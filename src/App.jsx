import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import SystemSummaryReport from './pages/SystemSummaryReport';
import WhatsAppDebugDashboard from './pages/WhatsAppDebugDashboard';
import WhatsAppControlPanel from './pages/WhatsAppControlPanel';
import SystemHealthMonitor from './pages/SystemHealthMonitor';
import ReminderAutomations from './pages/ReminderAutomations';
import MealPlanWizard from './pages/MealPlanWizard';
import MyMealPlan from './pages/MyMealPlan';
import CoachMenuManager from './pages/CoachMenuManager';
import TraineeLearningAnalytics from './pages/TraineeLearningAnalytics';
import Recipes from './pages/Recipes';
import RecipeDetail from './pages/RecipeDetail';
import OnboardingScreen from './pages/OnboardingScreen';
import WhatsAppControlCenter from './pages/WhatsAppControlCenter';
import CoachAsTrainee from './pages/CoachAsTrainee';
import AccessLink from './pages/AccessLink';
import SetPassword from './pages/SetPassword';
import LoginWithPassword from './pages/LoginWithPassword';
import ResetPassword from './pages/ResetPassword';
import AuthDiagnostic from './pages/AuthDiagnostic';
import DebugPage from './pages/DebugPage';
import DebugCrashes from './pages/DebugCrashes';
import TraineeQA from './pages/TraineeQA';
import SystemTest from './pages/SystemTest';
import CoachDailyWorkoutBuilder from './pages/CoachDailyWorkoutBuilder';
import MealReminderDebugger from './pages/MealReminderDebugger';
import WhatsAppDebugCenter from './pages/WhatsAppDebugCenter';
import ShapeLeagueHome from './pages/ShapeLeagueHome';
import ShapeLeagueRules from './pages/ShapeLeagueRules';
import ShapeLeagueRewards from './pages/ShapeLeagueRewards';
import ShapeLeagueGroupProfile from './pages/ShapeLeagueGroupProfile';
import CoachShapeLeagueDashboard from './pages/CoachShapeLeagueDashboard';
import CoachShapeLeagueControlCenter from './pages/CoachShapeLeagueControlCenter';
import CoachNotificationControlCenter from './pages/CoachNotificationControlCenter';
import ShapeLeagueTable from './pages/ShapeLeagueTable';
import ShapeLeagueCreateGroup from './pages/ShapeLeagueCreateGroup';
import ShapeLeagueAchievements from './pages/ShapeLeagueAchievements';
import ShapeLeagueDebug from './pages/ShapeLeagueDebug';
import NutritionSyncDebug from './pages/NutritionSyncDebug';
import CoachTraineeSyncDebug from './pages/CoachTraineeSyncDebug';
import OnboardingAnalytics from './pages/OnboardingAnalytics';
import NutritionAIDebugCenter from './pages/NutritionAIDebugCenter';
import AIMealAnalysisFlowReport from './pages/AIMealAnalysisFlowReport';
import DebugFoods from './pages/DebugFoods';
import CanonicalFoodReview from './pages/CanonicalFoodReview';
import AutomationCenter from './pages/AutomationCenter';
import { useLocation, Navigate } from 'react-router-dom';
import React, { useEffect, useMemo, useState } from 'react';
import GoogleLoginScreen from './components/shared/GoogleLoginScreen';
import StartupTraceOverlay, { startupTrace } from './components/shared/StartupTraceOverlay';
import AdminRoute from './components/auth/AdminRoute';
import CoachRoute from './components/auth/CoachRoute';
import StartupDebugOverlay from '@/components/shared/StartupDebugOverlay';

const LoginRedirect = () => {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get('from_url');
    base44.auth.redirectToLogin(fromUrl || window.location.origin + '/');
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center" dir="rtl">
      <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
    </div>
  );
};

const { Pages = {}, Layout, mainPage } = pagesConfig || {};
const mainPageKey = mainPage ?? Object.keys(Pages)?.[0];
const MainPage = mainPageKey && Pages[mainPageKey] ? Pages[mainPageKey] : null;

// Pages in the auto-route loop that must only be accessible to coaches.
// Without this, any logged-in trainee can navigate to e.g. /CoachDashboard.
const COACH_ONLY_PAGES = new Set([
  'CoachDashboard', 'CoachAutomations', 'CoachDailyAlert', 'CoachDailyWorkout',
  'CoachExternalMembers', 'CoachGroupWorkouts', 'CoachInsights', 'CoachNutrition',
  'CoachRecommendedFoods', 'CoachReports', 'CoachSettings', 'CoachWorkouts',
  'ManageTrainees', 'MessagingCenter', 'MissionControl', 'WhatsAppAutomations',
  'WhatsAppManager', 'CreateDailyPersonal', 'CreateProgram', 'CreateRotationProgram',
  'SendDailyPersonal', 'TemplateManager', 'AddTrainee', 'CopyLogs',
  'TraineeManagement', 'TraineeCard360', 'SuggestFavoritesManager',
]);

const LayoutWrapper = ({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>{children}</Layout>
  : <>{children}</>;

/**
 * PWA/Standalone Mode Detection:
 * - isStandalone: iPhone home-screen app or PWA display-mode: standalone
 * - If "/" opened with no token and no pending token → show GoogleLoginScreen
 * - Stale pending tokens are cleaned on direct "/" entry
 * - After Google login, trainee is found by auth.email and user is linked
 */
const AuthenticatedApp = () => {
  const location = useLocation();
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin, startupTimedOut } = useAuth();
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      startupTrace.running('auth_loaded');
      try {
        const u = await base44.auth.me();
        startupTrace.ok('auth_loaded', u?.email || '');
        startupTrace.running('user_loaded');
        startupTrace.ok('user_loaded', u?.full_name || u?.email || '');
        return u;
      } catch (e) {
        startupTrace.error('auth_loaded', e.message);
        throw e;
      }
    },
  });

  // PRIMARY: Try to find trainee by user_id
  const { data: traineeByUserId, isFetched: isTraineeByUserIdFetched } = useQuery({
    queryKey: ['traineeByUserId', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      startupTrace.running('trainee_lookup_started', 'by user_id');
      try {
        const trainees = await base44.entities.Trainee.filter({ user_id: user.id });
        const found = trainees[0] || null;
        if (found) {
          startupTrace.ok('trainee_lookup_started', 'found by user_id');
          startupTrace.ok('trainee_found', found.id);
        }
        return found;
      } catch (e) {
        startupTrace.error('trainee_lookup_started', e.message);
        return null;
      }
    },
    enabled: !!user?.id,
  });

  // FALLBACK: If trainee not found by user_id, try by email
  const { data: traineeByEmail } = useQuery({
    queryKey: ['traineeByEmail', user?.email, !!traineeByUserId],
    queryFn: async () => {
      if (!user?.email || traineeByUserId) return null;
      startupTrace.running('trainee_lookup_started', 'fallback by email');
      try {
        const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
        const found = trainees[0] || null;
        if (found) {
          startupTrace.ok('trainee_found', 'found by email: ' + found.id);
        } else {
          startupTrace.error('trainee_found', 'not found by email either');
        }
        return found;
      } catch (e) {
        startupTrace.error('trainee_lookup_started', e.message);
        return null;
      }
    },
    enabled: !!user?.email && isTraineeByUserIdFetched && !traineeByUserId,
  });

  // Select trainee (prefer by user_id, fallback to by email)
  const trainee = traineeByUserId || traineeByEmail;

  // Trace: role detection + trainee context
  React.useEffect(() => {
    if (!user) return;
    const role = user.role || 'user';
    startupTrace.ok('role_detected', role);
  }, [user?.id]);

  React.useEffect(() => {
    if (!trainee) return;
    startupTrace.ok('trainee_context_loaded', `status=${trainee.status}`);
    // Mark notifications as loading (will be completed by page)
    startupTrace.running('notifications_loaded');
    // Mark shape league as loading (will be completed by ShapeLeagueHome)
    startupTrace.running('shape_league_loaded');
    // Simulate notifications loaded after short delay (layout loads them)
    const t = setTimeout(() => {
      startupTrace.ok('notifications_loaded', 'layout loaded');
    }, 2000);
    return () => clearTimeout(t);
  }, [trainee?.id]);

  // AUTO-RECOVERY: Link trainee.user_id if found by email but not by user_id
  const [autoLinkPerformed, setAutoLinkPerformed] = useState(false);
  const [loginRecovery, setLoginRecovery] = useState({
    userExists: !!user,
    foundByUserId: !!traineeByUserId,
    foundByEmail: !!traineeByEmail,
    autoLinked: false
  });

  // TEMP INSTRUMENTATION — log every combined state change
  const _appTs = () => new Date().toISOString();
  React.useEffect(() => {
    console.log(`[STARTUP_DIAG ${_appTs()}] APP_STATE isLoadingAuth=${isLoadingAuth} isLoadingPublicSettings=${isLoadingPublicSettings} startupTimedOut=${startupTimedOut}`);
  }, [isLoadingAuth, isLoadingPublicSettings, startupTimedOut]);

  useEffect(() => {
    if (user && traineeByEmail && !traineeByUserId && !autoLinkPerformed) {
      // Auto-link: update trainee.user_id to current user.id
      (async () => {
        try {
          await base44.entities.Trainee.update(traineeByEmail.id, {
            user_id: user.id
          });
          console.log('[LOGIN_RECOVERY] Auto-linked trainee:', {
            traineeId: traineeByEmail.id,
            userId: user.id,
            email: user.email
          });
          setAutoLinkPerformed(true);
          setLoginRecovery(prev => ({ ...prev, autoLinked: true }));
          // Invalidate the user_id query to trigger re-fetch
          queryClientInstance.invalidateQueries({ queryKey: ['traineeByUserId', user.id] });
        } catch (err) {
          console.error('[LOGIN_RECOVERY] Auto-link failed:', err);
        }
      })();
    }
  }, [user, traineeByEmail, traineeByUserId, autoLinkPerformed]);

  // Log LOGIN_RECOVERY state
  useEffect(() => {
    if (user) {
      console.log('[LOGIN_RECOVERY]', {
        userExists: true,
        userId: user.id,
        email: user.email,
        foundByUserId: !!traineeByUserId,
        foundByEmail: !!traineeByEmail,
        autoLinked: autoLinkPerformed,
        traineeId: trainee?.id || null,
        traineeStatus: trainee?.status || null
      });
    }
  }, [user, traineeByUserId, traineeByEmail, autoLinkPerformed, trainee]);

  // Detect PWA/standalone mode (iPhone home screen app)
  const isStandalone = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  }, []);

  // Determine entry mode
  const hasPendingToken = !!(localStorage.getItem('pending_access_token') || sessionStorage.getItem('pending_access_token'));
  const hasTokenInUrl = location.search.includes('token=');
  
  // Clean up stale pending token if user opens "/" directly (PWA/browser with no token in URL)
  useEffect(() => {
    if (location.pathname === '/' && !hasTokenInUrl && hasPendingToken && !user) {
      console.log('[App] Cleaning stale pending token on direct "/" entry');
      localStorage.removeItem('pending_access_token');
      sessionStorage.removeItem('pending_access_token');
    }
  }, [location.pathname, hasTokenInUrl, hasPendingToken, user]);

  // LOGIN_STABILITY: Log final state before rendering — MUST be before any conditional returns
  React.useEffect(() => {
    if (user) {
      console.log('[LOGIN_STABILITY] User ready to enter app:', {
        userId: user.id,
        email: user.email,
        hasTrainee: !!trainee,
        traineeStatus: trainee?.status,
        loginRecovery
      });
    }
  }, [user?.id, trainee?.id]);

  // Fire app_ready once user resolved — MUST be before any conditional returns
  React.useEffect(() => {
    if (!user) return;
    const t = setTimeout(() => {
      const current = startupTrace.getAll();
      if (!current['shape_league_loaded'] || current['shape_league_loaded'].status === 'running') {
        startupTrace.ok('shape_league_loaded', 'passthrough');
      }
      if (!current['rankings_loaded'] || current['rankings_loaded'].status === 'running') {
        startupTrace.ok('rankings_loaded', 'passthrough');
      }
      if (!current['group_assignment_checked'] || current['group_assignment_checked'].status === 'running') {
        startupTrace.ok('group_assignment_checked', 'passthrough');
      }
      startupTrace.ok('app_ready');
    }, 3000);
    return () => clearTimeout(t);
  }, [user?.id, trainee?.id]);

  // Check if we're on a special page that should NOT redirect to login
  const isPublicRoute = ['/AccessLink', '/SetPassword', '/LoginWithPassword', '/AccessCodeLogin', '/ResetPassword', '/login', '/Login', '/MagicLogin'].some(
    p => location.pathname.startsWith(p)
  ) || location.search.includes('token=');

  // Direct entry: no token in URL, no pending token, user not logged in
  const isDirectEntry = !hasPendingToken && !hasTokenInUrl && location.pathname === '/' && !user;

  // Show loading spinner while checking app public settings or auth (with timeout failsafe)
  if ((isLoadingPublicSettings || isLoadingAuth) && !startupTimedOut) {
    return (
      <div className="fixed inset-0 flex items-center justify-center flex-col gap-3">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }

  // FAILSAFE: DIRECT ENTRY → ALWAYS GoogleLoginScreen, NEVER errors
  if (isDirectEntry) {
    localStorage.removeItem('pending_access_token');
    sessionStorage.removeItem('pending_access_token');
    const entryType = isStandalone ? 'PWA_DIRECT_ENTRY' : 'BROWSER_DIRECT_ENTRY';
    console.log(`[App] PWA_DIRECT_ENTRY_FAILSAFE: ${entryType} → GoogleLoginScreen`);
    return <GoogleLoginScreen />;
  }

  // AUTH GUARD: no authenticated user on a protected page → redirect to login
  if (!user && !isPublicRoute) {
    if (authError?.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    }
    // If a token exists but auth is still running after startup timeout, keep spinner
    // to avoid a premature redirect while the /me call is still in-flight.
    if (startupTimedOut && localStorage.getItem('fitcoach_token')) {
      return (
        <div className="fixed inset-0 flex items-center justify-center flex-col gap-3">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
        </div>
      );
    }
    return <Navigate to="/LoginWithPassword" replace />;
  }

  // After Google login: if user is now authenticated and there's a pending access token
  if (user && location.pathname === '/') {
    const pendingToken = localStorage.getItem('pending_access_token');
    if (pendingToken) {
      console.log('[App] 🔑 User authenticated + pending_access_token found → redirecting to AccessLink');
      window.location.replace(`/AccessLink?token=${pendingToken}`);
      return null;
    }
  }

  // Show onboarding screen only on home page if trainee hasn't completed it
  if (trainee && trainee.onboarding_status === 'pending' && location.pathname === '/') {
    return <OnboardingScreen />;
  }

  // Render the main app
   return (
     <>
     {import.meta.env.DEV && <StartupTraceOverlay />}
     <Routes>
       <Route path="/" element={
         !user ? null :
         (user.role === 'admin' || user.role === 'coach') ? (
           <Navigate to="/CoachDashboard" replace />
         ) : MainPage ? (
           <LayoutWrapper currentPageName={mainPageKey}>
             <MainPage />
           </LayoutWrapper>
         ) : (
           <PageNotFound />
         )
       } />
      {Object.entries(Pages).map(([path, Page]) => {
        const inner = (
          <LayoutWrapper currentPageName={path}>
            <Page />
          </LayoutWrapper>
        );
        return (
          <Route
            key={path}
            path={`/${path}`}
            element={COACH_ONLY_PAGES.has(path) ? <CoachRoute>{inner}</CoachRoute> : inner}
          />
        );
      })}
      <Route path="/WhatsAppDebugDashboard" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="WhatsAppDebugDashboard">
            <WhatsAppDebugDashboard />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/WhatsAppControlPanel" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="WhatsAppControlPanel">
            <WhatsAppControlPanel />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/SystemSummaryReport" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="SystemSummaryReport">
            <SystemSummaryReport />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/SystemHealthMonitor" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="SystemHealthMonitor">
            <SystemHealthMonitor />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/ReminderAutomations" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="ReminderAutomations">
            <ReminderAutomations />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/AutomationCenter" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="AutomationCenter">
            <AutomationCenter />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/MealPlanWizard" element={
        <LayoutWrapper currentPageName="MealPlanWizard">
          <MealPlanWizard />
        </LayoutWrapper>
      } />
      <Route path="/MyMealPlan" element={
        <LayoutWrapper currentPageName="MyMealPlan">
          <MyMealPlan />
        </LayoutWrapper>
      } />
      <Route path="/CoachMenuManager" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="CoachMenuManager">
            <CoachMenuManager />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/TraineeLearningAnalytics/:traineeId" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="TraineeLearningAnalytics">
            <TraineeLearningAnalytics />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/Recipes" element={
        <LayoutWrapper currentPageName="Recipes">
          <Recipes />
        </LayoutWrapper>
      } />
      <Route path="/RecipeDetail/:recipeId" element={
        <LayoutWrapper currentPageName="RecipeDetail">
          <RecipeDetail />
        </LayoutWrapper>
      } />
      <Route path="/WhatsAppControlCenter" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="WhatsAppControlCenter">
            <WhatsAppControlCenter />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/CoachAsTrainee" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/nutrition" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/workout" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/water" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/metrics" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/notifications" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/CoachAsTrainee/profile" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/AccessLink" element={<AccessLink />} />
      <Route path="/SetPassword" element={<SetPassword />} />
      <Route path="/LoginWithPassword" element={<LoginWithPassword />} />
      <Route path="/ResetPassword" element={<ResetPassword />} />
      <Route path="/AuthDiagnostic" element={<AuthDiagnostic />} />
      <Route path="/DebugPage" element={<AdminRoute><LayoutWrapper currentPageName="DebugPage"><DebugPage /></LayoutWrapper></AdminRoute>} />
      <Route path="/DebugCrashes" element={<AdminRoute><LayoutWrapper currentPageName="DebugCrashes"><DebugCrashes /></LayoutWrapper></AdminRoute>} />
      <Route path="/TraineeQA" element={<AdminRoute><LayoutWrapper currentPageName="TraineeQA"><TraineeQA /></LayoutWrapper></AdminRoute>} />
      <Route path="/SystemTest" element={<AdminRoute><LayoutWrapper currentPageName="SystemTest"><SystemTest /></LayoutWrapper></AdminRoute>} />
      <Route path="/CoachDailyWorkoutBuilder" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="CoachDailyWorkoutBuilder">
            <CoachDailyWorkoutBuilder />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/MealReminderDebugger" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="MealReminderDebugger">
            <MealReminderDebugger />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/WhatsAppDebugCenter" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="WhatsAppDebugCenter">
            <WhatsAppDebugCenter />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/ShapeLeagueGroupProfile" element={
        <LayoutWrapper currentPageName="ShapeLeagueGroupProfile">
          <ShapeLeagueGroupProfile />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueRewards" element={
        <LayoutWrapper currentPageName="ShapeLeagueRewards">
          <ShapeLeagueRewards />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueRules" element={
        <LayoutWrapper currentPageName="ShapeLeagueRules">
          <ShapeLeagueRules />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueHome" element={
        <LayoutWrapper currentPageName="ShapeLeagueHome">
          <ShapeLeagueHome />
        </LayoutWrapper>
      } />
      <Route path="/CoachShapeLeagueDashboard" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="CoachShapeLeagueDashboard">
            <CoachShapeLeagueDashboard />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/CoachShapeLeagueControlCenter" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="CoachShapeLeagueControlCenter">
            <CoachShapeLeagueControlCenter />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/CoachNotificationControlCenter" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="CoachNotificationControlCenter">
            <CoachNotificationControlCenter />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/CoachAsTrainee/league" element={<CoachRoute><CoachAsTrainee /></CoachRoute>} />
      <Route path="/ShapeLeagueTable" element={
        <LayoutWrapper currentPageName="ShapeLeagueTable">
          <ShapeLeagueTable />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueCreateGroup" element={
        <LayoutWrapper currentPageName="ShapeLeagueCreateGroup">
          <ShapeLeagueCreateGroup />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueAchievements" element={
        <LayoutWrapper currentPageName="ShapeLeagueAchievements">
          <ShapeLeagueAchievements />
        </LayoutWrapper>
      } />
      <Route path="/ShapeLeagueDebug" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="ShapeLeagueDebug">
            <ShapeLeagueDebug />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/NutritionSyncDebug" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="NutritionSyncDebug">
            <NutritionSyncDebug />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/CoachTraineeSyncDebug" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="CoachTraineeSyncDebug">
            <CoachTraineeSyncDebug />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/OnboardingAnalytics" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="OnboardingAnalytics">
            <OnboardingAnalytics />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/coach/nutrition-ai-debug" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="NutritionAIDebugCenter">
            <NutritionAIDebugCenter />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/AI_MEAL_ANALYSIS_FLOW_COMPARISON_REPORT" element={
        <AdminRoute>
          <LayoutWrapper currentPageName="AIMealAnalysisFlowReport">
            <AIMealAnalysisFlowReport />
          </LayoutWrapper>
        </AdminRoute>
      } />
      <Route path="/debug-foods" element={<AdminRoute><DebugFoods /></AdminRoute>} />
      <Route path="/CanonicalFoodReview" element={
        <CoachRoute>
          <LayoutWrapper currentPageName="CanonicalFoodReview">
            <CanonicalFoodReview />
          </LayoutWrapper>
        </CoachRoute>
      } />
      <Route path="/OnboardingScreen" element={<OnboardingScreen />} />
      <Route path="/login" element={<LoginRedirect />} />
      <Route path="/Login" element={<LoginRedirect />} />
      <Route path="/NutritionAI" element={<Navigate to="/NutritionLog" replace />} />
      <Route path="*" element={<PageNotFound />} />
    </Routes>
    </>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <>
            {import.meta.env.DEV && <StartupDebugOverlay />}
            <AuthenticatedApp />
          </>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App