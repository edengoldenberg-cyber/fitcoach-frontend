import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, X, AlertTriangle } from "lucide-react";

const STEPS = {
  'FETCH_SOURCES': { label: '📥 טוען מאגרים', color: '#3B82F6' },
  'FILTER_CANDIDATES': { label: '🔍 מסנן מוצרים', color: '#8B5CF6' },
  'BUILD_COMBINATIONS': { label: '🏗️ בונה קומבינציות', color: '#F59E0B' },
  'SCORING': { label: '⭐ דירוג תוצאות', color: '#10B981' },
  'COMPLETE': { label: '✅ מסיים', color: '#06B6D4' }
};

export default function MealSuggestionProgress({
  open,
  currentStep = 'FETCH_SOURCES',
  elapsed = 0,
  timeout = 4000,
  error = null,
  onCancel = null
}) {
  const [isWarning, setIsWarning] = useState(false);

  useEffect(() => {
    // Show warning at 70% of timeout
    if (elapsed > timeout * 0.7) {
      setIsWarning(true);
    }
  }, [elapsed, timeout]);

  const progress = (elapsed / timeout) * 100;
  const stepConfig = STEPS[currentStep] || STEPS.FETCH_SOURCES;
  const timeRemaining = Math.max(0, timeout - elapsed);
  const isUrgent = timeRemaining < 1000;

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm p-0" onInteractOutside={(e) => e.preventDefault()}>
        <div className="p-6 space-y-4">
          {/* Header */}
          <div className="text-center">
            <h2 className="font-bold text-lg">מייצר קומבינציות...</h2>
            <p className="text-sm text-slate-600 mt-1">אנא חכה</p>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" style={{ color: stepConfig.color }} />
                <span style={{ color: stepConfig.color }} className="font-medium text-sm">
                  {stepConfig.label}
                </span>
              </div>
              <span className={`text-xs font-mono ${isUrgent ? 'text-red-600 font-bold' : 'text-slate-600'}`}>
                {(elapsed / 1000).toFixed(1)}s / {(timeout / 1000).toFixed(1)}s
              </span>
            </div>

            {/* Timeline Bar */}
            <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all ${
                  isUrgent ? 'bg-red-500' : isWarning ? 'bg-orange-500' : 'bg-teal-500'
                }`}
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>

            {/* Warning at 70% */}
            {isWarning && !isUrgent && (
              <div className="bg-orange-50 border border-orange-200 rounded p-2 flex gap-2">
                <AlertTriangle className="w-4 h-4 text-orange-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-orange-800">הערך זמן מחכה גבוה</p>
              </div>
            )}

            {/* Critical at 100% */}
            {isUrgent && (
              <div className="bg-red-50 border border-red-200 rounded p-2 flex gap-2 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-800">
                  {timeRemaining < 500 ? 'מבצע fallback...' : 'זמן דוק!'}
                </p>
              </div>
            )}
          </div>

          {/* Step Indicators */}
          <div className="grid grid-cols-5 gap-1">
            {Object.entries(STEPS).map(([key, { color }]) => (
              <div
                key={key}
                className={`h-1 rounded-full transition-all ${
                  key === currentStep
                    ? 'opacity-100'
                    : Object.keys(STEPS).indexOf(key) < Object.keys(STEPS).indexOf(currentStep)
                    ? 'opacity-60'
                    : 'opacity-20'
                }`}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Error Display */}
          {error && (
            <Card className="bg-red-50 border-red-200 p-3">
              <p className="text-xs text-red-800 font-medium">{error}</p>
            </Card>
          )}

          {/* Cancel Button */}
          <Button
            onClick={onCancel}
            variant="outline"
            className="w-full border-red-300 text-red-600 hover:bg-red-50"
          >
            <X className="w-4 h-4 mr-2" />
            בטל
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}