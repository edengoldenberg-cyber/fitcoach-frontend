import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44, createHttpClient } from '@/api/client';
import { appParams } from '@/lib/app-params';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);
  const [authChecked, setAuthChecked] = useState(false); // ProtectedRoute depends on this

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);

      // Attempt to load Base44 public-settings (not available on Railway backend — non-fatal).
      // Only treat a 403 with an explicit reason as a hard gate.
      try {
        const appClient = createHttpClient({
          baseURL: `/api/apps/public`,
          headers: { 'X-App-Id': appParams.appId },
          token: appParams.token,
          interceptResponses: true
        });
        const publicSettings = await appClient.get(`/prod/public-settings/by-id/${appParams.appId}`);
        setAppPublicSettings(publicSettings);
      } catch (appError) {
        if (appError.status === 403 && appError.data?.extra_data?.reason) {
          const reason = appError.data.extra_data.reason;
          const message = appError.message;
          setAuthError(
            reason === 'auth_required'      ? { type: 'auth_required',      message: 'Authentication required' } :
            reason === 'user_not_registered' ? { type: 'user_not_registered', message: 'User not registered for this app' } :
                                              { type: reason, message }
          );
          setIsLoadingPublicSettings(false);
          setIsLoadingAuth(false);
          return; // hard gate — do not proceed
        }
        // 404 / network error on Railway backend — not fatal, continue to auth check
        console.warn('[Auth] public-settings unavailable, skipping:', appError.message);
      }

      setIsLoadingPublicSettings(false);
      await checkUserAuth();
    } catch (error) {
      console.error('Unexpected error in checkAppState:', error);
      setAuthError({
        type: 'unknown',
        message: error.message || 'An unexpected error occurred'
      });
      setIsLoadingPublicSettings(false);
      setIsLoadingAuth(false);
    }
  };

  const checkUserAuth = async () => {
    try {
      // Now check if the user is authenticated
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();

      // If user was deleted from DB but session exists, auto logout
      if (!currentUser) {
        setUser(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        await base44.auth.logout();
        return;
      }

      setUser(currentUser);
      setIsAuthenticated(true);
      setIsLoadingAuth(false);
      setAuthChecked(true);
    } catch (error) {
      console.error('User auth check failed:', error);
      setIsLoadingAuth(false);
      setIsAuthenticated(false);
      setAuthChecked(true);

      // Auto logout if user not found (deleted from DB)
      // BUT: skip auto-logout if we're on an access link flow (token present)
      const isOnAccessLink = window.location.pathname.includes('AccessLink') || 
                             window.location.search.includes('token=') ||
                             !!localStorage.getItem('pending_access_token');
      if ((error.status === 404 || error.message?.includes('not found')) && !isOnAccessLink) {
        await base44.auth.logout();
        return;
      }

      // If user auth fails, it might be an expired token
      if (error.status === 401 || error.status === 403) {
        setAuthError({
          type: 'auth_required',
          message: 'Authentication required'
        });
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