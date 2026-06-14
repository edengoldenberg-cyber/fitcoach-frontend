import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { createPageUrl } from '@/utils';
import { Loader2 } from 'lucide-react';

export default function AuthGuard({ children }) {
  const [isChecking, setIsChecking] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [debugInfo, setDebugInfo] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    let mounted = true;
    let timeoutId;

    const checkAuth = async () => {
      const debug = {
        isAuthenticated: false,
        userEmail: null,
        userRole: null,
        redirectTarget: null,
        lastAuthError: null,
        timestamp: new Date().toISOString()
      };

      try {
        // Check authentication
        const isAuth = await base44.auth.isAuthenticated();
        debug.isAuthenticated = isAuth;
        
        if (!mounted) return;

        if (!isAuth) {
          // Not authenticated
          debug.lastAuthError = 'User not authenticated';
          setDebugInfo(debug);
          setIsAuthenticated(false);
          setIsChecking(false);
          
          // Don't redirect if already on Home or PendingApproval
          const publicPages = [createPageUrl('Home'), createPageUrl('PendingApproval')];
          if (!publicPages.includes(location.pathname)) {
            debug.redirectTarget = 'Home';
            navigate(createPageUrl('Home'), { replace: true });
          }
          return;
        }

        // Get user data
        const user = await base44.auth.me();
        debug.userEmail = user.email;
        debug.userRole = user.role;
        
        if (!mounted) return;

        // Just-in-time trainee linking
        const email = user.email.toLowerCase().trim();
        const traineeProfiles = await base44.entities.Trainee.filter({ user_email: email });
        let traineeProfile = traineeProfiles[0];

        // If trainee profile exists but not linked to user_id, link it now
        if (traineeProfile && !traineeProfile.user_id) {
          await base44.entities.Trainee.update(traineeProfile.id, {
            user_id: user.id,
            last_login_at: new Date().toISOString(),
            first_login_at: traineeProfile.first_login_at || new Date().toISOString()
          });
          // Refresh trainee data
          const updated = await base44.entities.Trainee.filter({ user_email: email });
          traineeProfile = updated[0];
        }

        // Check if user is coach
        const coachTrainees = await base44.entities.Trainee.filter({ coach_email: user.email });
        const isCoach = coachTrainees.length > 0 || user.role === 'admin';

        // If no trainee profile and not a coach, create pending profile
        if (!traineeProfile && !isCoach) {
          traineeProfile = await base44.entities.Trainee.create({
            user_id: user.id,
            user_email: email,
            full_name: user.full_name || email.split('@')[0],
            coach_email: '',
            status: 'pending_coach_approval',
            first_login_at: new Date().toISOString(),
            last_login_at: new Date().toISOString()
          });
        }

        setIsAuthenticated(true);
        setIsChecking(false);
        setDebugInfo(debug);

        // Handle pending approval status
        if (traineeProfile && traineeProfile.status === 'pending_coach_approval') {
          if (location.pathname !== createPageUrl('PendingApproval')) {
            debug.redirectTarget = 'PendingApproval';
            navigate(createPageUrl('PendingApproval'), { replace: true });
          }
          return;
        }

        // Redirect authenticated users from Home page or root
        if (location.pathname === createPageUrl('Home') || location.pathname === '/' || location.pathname === '') {
          if (isCoach) {
            debug.redirectTarget = 'CoachDashboard';
            navigate(createPageUrl('CoachDashboard'), { replace: true });
          } else {
            debug.redirectTarget = 'TraineeHome';
            navigate(createPageUrl('TraineeHome'), { replace: true });
          }
        }

      } catch (error) {
        console.error('Auth check failed:', error);
        debug.lastAuthError = error.message || error.toString();
        setDebugInfo(debug);
        
        if (!mounted) return;

        setIsAuthenticated(false);
        setIsChecking(false);
        
        // Don't redirect from Home or PendingApproval
        const publicPages = [createPageUrl('Home'), createPageUrl('PendingApproval')];
        if (!publicPages.includes(location.pathname)) {
          navigate(createPageUrl('Home'), { replace: true });
        }
      }
    };

    // Reduce timeout to 3 seconds
    timeoutId = setTimeout(() => {
      if (mounted && isChecking) {
        console.warn('Auth check timeout');
        setIsChecking(false);
        setIsAuthenticated(false);
      }
    }, 3000);

    checkAuth();

    return () => {
      mounted = false;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [location.pathname, navigate]);

  // Show loader while checking
  if (isChecking) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-white" dir="rtl">
        <Loader2 className="w-12 h-12 animate-spin mb-4" style={{ color: '#79DBD6' }} />
        <p className="text-slate-600 text-lg font-medium">טוען את FIT COACH PRO...</p>
      </div>
    );
  }

  // Render children with optional debug info
  return (
    <>
      {children}
      {debugInfo && (
        <div 
          className="fixed bottom-20 left-4 bg-slate-900 text-white text-xs p-3 rounded-lg shadow-lg max-w-xs z-50"
          style={{ display: debugInfo.userRole === 'admin' ? 'block' : 'none' }}
        >
          <div className="font-bold mb-2">🔍 Auth Debug (Admin Only)</div>
          <div className="space-y-1">
            <div>Auth: {debugInfo.isAuthenticated ? '✅' : '❌'}</div>
            <div>Email: {debugInfo.userEmail || 'N/A'}</div>
            <div>Role: {debugInfo.userRole || 'N/A'}</div>
            <div>Redirect: {debugInfo.redirectTarget || 'None'}</div>
            {debugInfo.lastAuthError && (
              <div className="text-red-400">Error: {debugInfo.lastAuthError}</div>
            )}
            <div className="text-slate-400 text-[10px] mt-1">
              {new Date(debugInfo.timestamp).toLocaleTimeString('he-IL')}
            </div>
          </div>
        </div>
      )}
    </>
  );
}