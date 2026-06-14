/**
 * StartupTraceOverlay
 * Floating real-time startup trace — shows each boot step with status.
 * Only visible during startup. Auto-dismisses when app_ready fires.
 * Force-shows stuck step after global timeout.
 */

import React, { useState, useEffect, useRef } from 'react';

const STEP_KEYS = [
  'auth_loaded',
  'user_loaded',
  'role_detected',
  'trainee_lookup_started',
  'trainee_found',
  'trainee_context_loaded',
  'notifications_loaded',
  'shape_league_loaded',
  'rankings_loaded',
  'group_assignment_checked',
  'app_ready',
];

const STEP_LABELS = {
  auth_loaded: 'אימות נטען',
  user_loaded: 'משתמש נטען',
  role_detected: 'תפקיד זוהה',
  trainee_lookup_started: 'חיפוש מתאמן התחיל',
  trainee_found: 'מתאמן נמצא',
  trainee_context_loaded: 'הקשר מתאמן נטען',
  notifications_loaded: 'התראות נטענו',
  shape_league_loaded: 'Shape League נטעןן',
  rankings_loaded: 'דירוגים נטענו',
  group_assignment_checked: 'שיוך קבוצה נבדק',
  app_ready: 'האפליקציה מוכנה',
};

// Global step registry — updated by anywhere in the app
let _listeners = [];
let _steps = {};

export const startupTrace = {
  set(key, status, detail = '') {
    _steps[key] = { status, detail, ts: Date.now() };
    _listeners.forEach(fn => fn({ ..._steps }));
    // Always log to console too
    const icon = status === 'ok' ? '✅' : status === 'error' ? '❌' : status === 'stuck' ? '⏳' : '▶️';
    console.log(`[STARTUP_TRACE] ${icon} ${key}${detail ? ` — ${detail}` : ''}`);
  },
  ok(key, detail = '') { this.set(key, 'ok', detail); },
  error(key, detail = '') { this.set(key, 'error', detail); },
  running(key, detail = '') { this.set(key, 'running', detail); },
  stuck(key, detail = '') { this.set(key, 'stuck', detail); },
  subscribe(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  },
  getAll() { return { ..._steps }; },
  reset() { _steps = {}; _listeners.forEach(fn => fn({})); },
};

const GLOBAL_TIMEOUT_MS = 8000;

export default function StartupTraceOverlay() {
  const [steps, setSteps] = useState({});
  const [visible, setVisible] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [stuckStep, setStuckStep] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const timerRef = useRef(null);
  const startRef = useRef(Date.now());

  useEffect(() => {
    // Subscribe to step updates
    const unsub = startupTrace.subscribe(newSteps => {
      setSteps(newSteps);

      // Auto-dismiss when app_ready is ok
      if (newSteps['app_ready']?.status === 'ok') {
        setTimeout(() => setDismissed(true), 1500);
      }
    });

    // Global startup timeout
    timerRef.current = setTimeout(() => {
      const current = startupTrace.getAll();
      // Find last running step
      const runningStep = STEP_KEYS.slice().reverse().find(k => current[k]?.status === 'running');
      const lastStep = runningStep || STEP_KEYS.find(k => !current[k]);
      if (!current['app_ready'] || current['app_ready']?.status !== 'ok') {
        setTimedOut(true);
        setStuckStep(lastStep || 'unknown');
        if (lastStep) startupTrace.stuck(lastStep, 'global timeout 8s');
      }
    }, GLOBAL_TIMEOUT_MS);

    return () => {
      unsub();
      clearTimeout(timerRef.current);
    };
  }, []);

  // Don't show after dismiss or if app_ready and all ok
  if (dismissed) return null;

  // Determine if everything succeeded silently
  const allDone = steps['app_ready']?.status === 'ok';

  // Count completed steps
  const completedCount = STEP_KEYS.filter(k => steps[k]?.status === 'ok').length;
  const hasErrors = STEP_KEYS.some(k => steps[k]?.status === 'error' || steps[k]?.status === 'stuck');

  return (
    <div
      dir="rtl"
      style={{
        position: 'fixed',
        bottom: 80,
        right: 12,
        zIndex: 99999,
        maxWidth: 310,
        width: 'calc(100vw - 24px)',
        fontFamily: 'monospace',
        fontSize: 11,
      }}
    >
      {/* Header */}
      <div style={{
        background: timedOut ? '#7f1d1d' : hasErrors ? '#431407' : '#0f172a',
        color: timedOut ? '#fca5a5' : hasErrors ? '#fb923c' : '#94a3b8',
        padding: '6px 10px',
        borderRadius: '10px 10px 0 0',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid #1e293b',
      }}>
        <span style={{ fontWeight: 'bold', letterSpacing: '0.5px' }}>
          {timedOut ? '⏳ STARTUP BLOCKED' : allDone ? '✅ STARTUP COMPLETE' : '▶ STARTUP TRACE'}
        </span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 10, opacity: 0.6 }}>{completedCount}/{STEP_KEYS.length}</span>
          <button
            onClick={() => setDismissed(true)}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, padding: '0 2px', minHeight: 0, minWidth: 0 }}
          >✕</button>
        </div>
      </div>

      {/* Steps */}
      <div style={{
        background: '#0f172a',
        border: '1px solid #1e293b',
        borderTop: 'none',
        borderRadius: '0 0 10px 10px',
        padding: '6px 0',
        maxHeight: 260,
        overflowY: 'auto',
      }}>
        {STEP_KEYS.map((key) => {
          const s = steps[key];
          const status = s?.status || 'pending';
          const detail = s?.detail || '';

          const icon = status === 'ok' ? '✓' :
                       status === 'error' ? '✗' :
                       status === 'stuck' ? '⏳' :
                       status === 'running' ? '▶' : '·';

          const color = status === 'ok' ? '#4ade80' :
                        status === 'error' ? '#f87171' :
                        status === 'stuck' ? '#fb923c' :
                        status === 'running' ? '#38bdf8' : '#475569';

          const isRunning = status === 'running';

          return (
            <div
              key={key}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: 6,
                padding: '3px 10px',
                background: isRunning ? 'rgba(56,189,248,0.06)' : 'transparent',
                borderLeft: isRunning ? '2px solid #38bdf8' : '2px solid transparent',
              }}
            >
              <span style={{
                color,
                fontWeight: 'bold',
                width: 12,
                flexShrink: 0,
                animation: isRunning ? 'pulse 1s infinite' : 'none',
              }}>{icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ color, fontSize: 10.5 }}>{STEP_LABELS[key] || key}</span>
                {detail && (
                  <div style={{ color: '#475569', fontSize: 9, marginTop: 1, wordBreak: 'break-all' }}>
                    {detail}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Timeout banner */}
        {timedOut && stuckStep && (
          <div style={{
            margin: '6px 8px 4px',
            background: '#7f1d1d',
            border: '1px solid #ef4444',
            borderRadius: 6,
            padding: '5px 8px',
            color: '#fca5a5',
            fontSize: 10,
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: 2 }}>Startup blocked at:</div>
            <div style={{ color: '#f87171' }}>[{stuckStep}]</div>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: 6,
                background: '#ef4444',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '3px 10px',
                cursor: 'pointer',
                fontSize: 10,
                minHeight: 0,
                minWidth: 0,
                width: '100%',
              }}
            >
              🔄 רענן
            </button>
          </div>
        )}
      </div>

      {/* Pulse animation */}
      <style>{`
        @keyframes startup-pulse { 0%,100% { opacity:1 } 50% { opacity:0.3 } }
        [data-running] { animation: startup-pulse 1s infinite; }
      `}</style>
    </div>
  );
}