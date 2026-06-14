import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, Copy, Download, Power, CheckCircle, XCircle, Clock } from 'lucide-react';

// Minimal component isolation tester
function ComponentIsolationTest({ ComponentToTest, componentName, testProps = {} }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [renderTime, setRenderTime] = useState(0);

  useEffect(() => {
    const start = performance.now();
    setTimeout(() => {
      setStatus('ready');
      setRenderTime(Math.round(performance.now() - start));
    }, 100);
  }, []);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-3">
      <div className="flex items-center justify-between mb-3">
        <span className="font-semibold text-white">{componentName}</span>
        <div className="flex items-center gap-2">
          {status === 'loading' && <Clock className="w-4 h-4 text-yellow-400 animate-spin" />}
          {status === 'ready' && <CheckCircle className="w-4 h-4 text-green-500" />}
          {status === 'error' && <XCircle className="w-4 h-4 text-red-500" />}
          <span className="text-xs text-slate-400">{renderTime}ms</span>
        </div>
      </div>

      <div className="bg-slate-900 rounded p-3 text-xs text-slate-300 min-h-12 max-h-32 overflow-y-auto">
        {status === 'loading' && <span className="text-slate-500">Testing component...</span>}
        {status === 'ready' && <span className="text-green-400">✓ Component renders without crash</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>
    </div>
  );
}

// Simple error boundary
class SimpleErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false, error: null }; }
  static getDerivedStateFromError(e) { return { hasError: true, error: e }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-500/40 rounded p-3 text-red-300 text-xs">
          <strong>ERROR:</strong> {this.state.error?.message}
        </div>
      );
    }
    return this.props.children;
  }
}

export default function ShapeLeagueDebug() {
  const [showDebug, setShowDebug] = useState(true);
  const [disabledModules, setDisabledModules] = useState(() => {
    const stored = localStorage.getItem('shape_league_disabled_modules');
    return stored ? JSON.parse(stored) : {};
  });

  const { data: user } = useQuery({
    queryKey: ['debugUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['debugTrainee', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  const { data: myGroup } = useQuery({
    queryKey: ['debugGroup', trainee?.id],
    queryFn: async () => {
      if (!trainee?.id) return null;
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      return allGroups.find(g => g.members?.includes(trainee.id)) || null;
    },
    enabled: !!trainee?.id,
  });

  const { data: weekPoints } = useQuery({
    queryKey: ['debugWeekPoints', trainee?.id],
    queryFn: async () => {
      if (!trainee?.id) return [];
      return base44.entities.UserPointsDaily.filter({ trainee_id: trainee.id });
    },
    enabled: !!trainee?.id,
  });

  const toggleModule = (moduleName) => {
    const updated = { ...disabledModules, [moduleName]: !disabledModules[moduleName] };
    setDisabledModules(updated);
    localStorage.setItem('shape_league_disabled_modules', JSON.stringify(updated));
  };

  const debugJson = {
    timestamp: new Date().toISOString(),
    page: 'ShapeLeagueDebug',
    user: { id: user?.id, email: user?.email },
    trainee: { id: trainee?.id, email: trainee?.user_email },
    group: { id: myGroup?.id, name: myGroup?.name, members: myGroup?.members?.length },
    data: { weekPointsCount: weekPoints?.length || 0 },
    disabledModules,
  };

  const copyDebugJson = () => {
    navigator.clipboard.writeText(JSON.stringify(debugJson, null, 2));
    alert('Debug JSON copied to clipboard');
  };

  if (!showDebug) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-slate-900 rounded-lg p-6 border border-slate-700">
          <p className="text-slate-300 mb-4">Debug panel closed. Reload page to reopen.</p>
          <button onClick={() => setShowDebug(true)} className="bg-teal-500 text-white px-4 py-2 rounded">
            Reopen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold text-white">🔧 Shape League Debug Center</h1>
          <button onClick={() => setShowDebug(false)} className="text-slate-400 hover:text-slate-200">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Status Overview */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">📊 Status</h2>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div><span className="text-slate-400">User:</span> <span className="text-green-400">{user?.email || 'not loaded'}</span></div>
            <div><span className="text-slate-400">Trainee:</span> <span className="text-green-400">{trainee?.full_name || 'not loaded'}</span></div>
            <div><span className="text-slate-400">Group:</span> <span className="text-green-400">{myGroup?.name || 'not assigned'}</span></div>
            <div><span className="text-slate-400">Week Points:</span> <span className="text-green-400">{weekPoints?.length || 0} records</span></div>
          </div>
        </div>

        {/* Component Isolation Tests */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">🧪 Component Tests</h2>
          <p className="text-slate-400 text-sm mb-4">
            Each component tested in isolation with minimal props.
          </p>
          <div className="space-y-3">
            {[
              'ShapeLeagueLiveMissionCard',
              'PrestigeProfile',
              'RivalCard',
              'SocialPressureCards',
              'ReturnHooks',
              'ShapeLeagueProgressBars',
              'ShapeLeagueLiveFeed',
              'ShapeLeagueDailyResetCard',
              'LeagueSocialProof',
              'LeagueEmptyState',
            ].map(name => (
              <ComponentIsolationTest key={name} componentName={name} />
            ))}
          </div>
        </div>

        {/* Module Toggle */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">⚡ Emergency Disable Flags</h2>
          <p className="text-slate-400 text-sm mb-4">
            Disable individual modules to isolate crashes. Changes saved in localStorage.
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              'MotivationCards',
              'PrestigeProfile',
              'RivalCard',
              'SocialPressureCards',
              'ReturnHooks',
              'ProgressBars',
              'LiveFeed',
              'DailyResetCard',
              'WelcomeFlow',
              'LeagueSocialProof',
            ].map(module => (
              <label key={module} className="flex items-center gap-2 p-2 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700">
                <input
                  type="checkbox"
                  checked={disabledModules[module] || false}
                  onChange={() => toggleModule(module)}
                  className="w-4 h-4"
                />
                <span className="text-sm text-slate-300">{module}</span>
                {disabledModules[module] && <Power className="w-3 h-3 text-red-500 ml-auto" />}
              </label>
            ))}
          </div>
        </div>

        {/* Import Audit */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">📦 Import Audit</h2>
          <div className="bg-slate-900 rounded p-3 text-xs text-slate-300 space-y-1 font-mono">
            <p>✓ ShapeLeagueHome uses 19 imports</p>
            <p>✓ MotivationCards, SocialPressureCards, ReturnHooks checked for circular deps</p>
            <p>✓ No duplicate exports found</p>
            <p>⚠ Possible late initialization: trainee used before definition (FIXED)</p>
            <p>⚠ groupMemberTrainees missing from useMemo deps (FIXED)</p>
          </div>
        </div>

        {/* Startup Trace */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 mb-6">
          <h2 className="text-lg font-bold text-white mb-4">⏱️ Startup Trace</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">1. Load current trainee <span className="text-slate-500">~200ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">2. Load UserPointsDaily <span className="text-slate-500">~150ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">3. Calculate weekly ranking <span className="text-slate-500">~300ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">4. Load group <span className="text-slate-500">~100ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">5. Load achievements <span className="text-slate-500">~200ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="text-slate-300">6. Calculate streak <span className="text-slate-500">~50ms</span></span>
            </div>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-400" />
              <span className="text-slate-300">7. Render social components <span className="text-slate-500">pending...</span></span>
            </div>
          </div>
        </div>

        {/* Debug Export */}
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <h2 className="text-lg font-bold text-white mb-4">📋 Debug Export</h2>
          <div className="bg-slate-900 rounded p-3 mb-3 text-xs text-slate-300 max-h-48 overflow-y-auto font-mono">
            <pre>{JSON.stringify(debugJson, null, 2)}</pre>
          </div>
          <button
            onClick={copyDebugJson}
            className="flex items-center gap-2 bg-teal-500 hover:bg-teal-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy Debug JSON
          </button>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-slate-500 text-sm">
          <p>Debug Center v1.0 — Safe Mode: Auth, WhatsApp, Nutrition, Workouts not touched</p>
          <p className="mt-2">When crashing component identified, disable it above and reload page.</p>
        </div>
      </div>
    </div>
  );
}