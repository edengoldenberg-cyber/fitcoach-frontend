import React, { useEffect, useState } from 'react';
import { Save, Dumbbell } from 'lucide-react';

export default function WorkoutSessionBar({ exerciseCount = 0, totalVolume = 0, onSave, saving = false }) {
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [startTime]);

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pointer-events-none">
      <div className="max-w-lg mx-auto pointer-events-auto">
        <div className="bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center px-4 py-3 gap-3">
          {/* Timer */}
          <div className="flex items-center gap-1.5 flex-1">
            <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-green-400 font-mono text-base font-bold">{formatTime(elapsed)}</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-4">
            <div className="text-center">
              <div className="text-white font-bold text-sm">{exerciseCount}</div>
              <div className="text-slate-400 text-[10px]">תרגילים</div>
            </div>
            {totalVolume > 0 && (
              <div className="text-center">
                <div className="text-white font-bold text-sm">{Math.round(totalVolume)}</div>
                <div className="text-slate-400 text-[10px]">ק״ג נפח</div>
              </div>
            )}
          </div>

          {/* Save */}
          {onSave && (
            <button
              onClick={onSave}
              disabled={saving}
              className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'שומר...' : 'שמור'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}