import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/client';

const AuthContext = createContext();

// TEMP INSTRUMENTATION — remove after iPhone reproduction confirmed
const _ts = () => new Date().toISOString();
const _log = (msg) => console.log(`[STARTUP_DIAG ${_ts()}] ${msg}`);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // ProtectedRoute depends on this
  const [startupTimedOut, setStartupTimedOut] = useState(false);

  useEffect(() => {
    checkAppState();

    // When base44Client exhausts the refresh attempt (JWT expired + refresh failed),
    // it dispatches this event. We redirect to login instead of leaving the user
    // silently stuck inside a broken session (the "Sarah Attias" failure mode).
    const onSessionExpired = () => {
      console.warn('[AuthContext] session_expired event — redirecting to login');
      setUser(null);
      setIsAuthenticated(false);
      try { localStorage.removeItem('fitcoach_token'); } catch { /* */ }
      // Small delay so any in-flight state updates settle before navigation
      setTimeout(() => {
        window.location.href = '/LoginWithPassword';
      }, 100);
    };

    window.addEventListener('fitcoach:session_expired', onSessionExpired);
    return () => window.removeEventListener('fitcoach:session_expired', onSessionExpired);
  }, []);

  useEffect(() => {
    if (!isLoadingAuth && !isLoadingPublicSettings) {
      setStartupTimedOut(false);
      return;
    }
    const timer = setTimeout(() => {
      console.warn('[STARTUP_TIMEOUT] Auth still loading after 6s — forcing resolve');
      setStartupTimedOut(true);
    }, 6000);
    return () => clearTimeout(timer);
  }, [isLoadingAuth, isLoadingPublicSettings]);

  const checkAppState = () => {
    setAuthError(null);
    // Public-settings removed from startup — caused iOS SW fetch freeze.
    _log('public-settings: SKIPPED (removed from startup path)');
    checkUserAuth();
  };

  const checkUserAuth = async () => {
    try {
      _log('STATE isLoadingAuth → true (checkUserAuth start)');
      setIsLoadingAuth(true);
      const authTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(Object.assign(new Error('Auth request timed out'), { status: 0, isTimeout: true })),
          9000
        )
      );
      const currentUser = await Promise.race([base44.auth.me(), authTimeout]);

      // If user was deleted from DB but session exists, auto logout
      if (!currentUser) {
        setUser(null);
        setIsAuthenticated(false);
        _log('STATE isLoadingAuth → false (no current user)');
        setIsLoadingAuth(false);
        await base44.auth.logout();
        return;
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      _log('STATE isLoadingAuth → false (auth success)');
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      _log(`STATE isLoadingAuth → false (error: ${error.message})`);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      const isOnAccessLink = window.location.pathname.includes('AccessLink') ||
                             window.location.search.includes('token=') ||
                             !!localStorage.getItem('pending_access_token');
      if ((error.status === 404 || error.message?.includes('not found')) && !isOnAccessLink) {
        await base44.auth.logout();
        return;
      }
      if (error.status === 401 || error.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Authentication required' });
      }
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);

    // FULL CLEANUP: clear all stale session/coach/trainee state
    try {
      localStorage.removeItem('pending_access_token');
      sessionStorage.removeItem('pending_access_token');
      localStorage.removeItem('coachAsTrainee');
      localStorage.removeItem('impersonation_state');
      localStorage.removeItem('cached_trainee_id');
      sessionStorage.removeItem('coachAsTrainee');
      sessionStorage.removeItem('impersonation_state');
      // Clear any react-query persisted cache keys
      sessionStorage.removeItem('trainee_context');
    } catch (e) {
      // ignore storage errors
    }
    
    if (shouldRedirect) {
      base44.auth.logout(window.location.origin);
    } else {
      base44.auth.logout();
    }
  };

  const navigateToLogin = () => {
    base44.auth.redirectToLogin(window.location.origin + window.location.pathname);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      authChecked,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState,
      checkUserAuth,
      startupTimedOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};