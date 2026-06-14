import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Copy, X } from "lucide-react";
import { toast } from 'sonner';
import { getEventReport } from '../shared/UniversalEventLogger';

export default function MealSuggestDebugModal({ open, onClose }) {
  const [report, setReport] = useState(null);
  const [eventLog, setEventLog] = useState(null);

  useEffect(() => {
    if (open) {
      // Try diagnostic report first (from watchdog)
      const lastReport = window.__mealSuggestLastReport;
      if (lastReport) {
        setReport(lastReport);
      }

      // Always get the universal event log
      const eventReport = getEventReport();
      setEventLog(eventReport);
    }
  }, [open]);

  const copyToClipboard = () => {
    if (report) {
      const text = JSON.stringify(report, null, 2);
      navigator.clipboard.writeText(text);
      toast.success('הדו"ח הועתק ✓');
    }
  };

  const getStatusColor = () => {
    if (!report) return 'gray';
    switch (report.exitReason) {
      case 'SUCCESS': return 'green';
      case 'TIMEOUT': return 'orange';
      case 'FALLBACK': return 'yellow';
      case 'ERROR': return 'red';
      default: return 'gray';
    }
  };

  const getStatusIcon = () => {
    if (!report) return null;
    switch (report.exitReason) {
      case 'SUCCESS': return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'TIMEOUT': return <Clock className="w-5 h-5 text-orange-600" />;
      case 'ERROR': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return null;
    }
  };

  if (!report) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-slate-400" />
              📊 מצב דיבוג
            </DialogTitle>
          </DialogHeader>
          <div className="text-center py-8">
            <p className="text-slate-600">אין דו"ח דיאגנוסטיקה זמין</p>
            <p className="text-xs text-slate-400 mt-2">בצע הצעה כדי לראות את הפרטים</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between w-full">
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon()}
              דיבוג הצעת ארוחה
            </DialogTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Summary */}
          <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-600 font-medium mb-1">סטטוס</p>
                <Badge className={
                  report.exitReason === 'SUCCESS' ? 'bg-green-100 text-green-800' :
                  report.exitReason === 'TIMEOUT' ? 'bg-orange-100 text-orange-800' :
                  report.exitReason === 'ERROR' ? 'bg-red-100 text-red-800' :
                  'bg-gray-100 text-gray-800'
                }>
                  {report.exitReason || 'UNKNOWN'}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium mb-1">זמן כולל</p>
                <p className="font-mono text-sm font-bold">{report.elapsedMs || 0}ms</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium mb-1">Run ID</p>
                <p className="font-mono text-xs text-slate-700 break-all">{report.runId || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-600 font-medium mb-1">ניסיונות</p>
                <p className="font-mono text-sm font-bold">{report.attempts || 0}</p>
              </div>
            </div>
          </Card>

          {/* Last Known Step */}
          <Card className="p-4">
            <p className="text-xs text-slate-600 font-medium mb-2">🔍 שלב אחרון</p>
            <p className="text-sm font-mono bg-slate-50 p-2 rounded text-slate-800">
              {report.lastKnownStep || 'N/A'}
            </p>
          </Card>

          {/* Results */}
          <Card className="p-4">
            <p className="text-xs text-slate-600 font-medium mb-3">📊 תוצאות</p>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">קומבינציות שנמצאו</span>
                <span className="font-mono font-bold text-slate-900">{report.combinationsFound || 0}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-700">ניקוד הטוב ביותר</span>
                <span className="font-mono font-bold text-slate-900">{(report.bestScore || 0).toFixed(2)}</span>
              </div>
            </div>
          </Card>

          {/* Sources Breakdown */}
          {report.sourceCounts && (
            <Card className="p-4">
              <p className="text-xs text-slate-600 font-medium mb-3">📦 מקורות</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">מועדפים של המתאמן</span>
                  <span className="font-mono font-bold text-slate-900">{report.sourceCounts.traineeFavorites || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">מומלצים מהמאמן</span>
                  <span className="font-mono font-bold text-slate-900">{report.sourceCounts.coachRecommended || 0}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-700">Fallback גלובלי</span>
                  <span className="font-mono font-bold text-slate-900">{report.sourceCounts.globalFallback || 0}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Event Timeline */}
          {report.events && report.events.length > 0 && (
            <Card className="p-4">
              <p className="text-xs text-slate-600 font-medium mb-3">📅 ציר זמן (Watchdog)</p>
              <div className="space-y-1 max-h-48 overflow-y-auto text-xs font-mono">
                {report.events.map((evt, idx) => (
                  <div key={idx} className="text-slate-700 border-l pl-2 border-slate-300">
                    <span className="text-slate-500">[{evt.elapsed}ms]</span> {evt.event}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Universal Event Log */}
          {eventLog && eventLog.events && eventLog.events.length > 0 && (
            <Card className="p-4 bg-blue-50 border-blue-200">
              <p className="text-xs text-blue-800 font-medium mb-3">⚡ כל האירועים (Universal Logger)</p>
              <div className="grid grid-cols-3 gap-2 mb-3 text-xs">
                <div>
                  <span className="text-blue-600">Total Events:</span>
                  <p className="font-bold text-blue-900">{eventLog.totalEvents}</p>
                </div>
                <div>
                  <span className="text-blue-600">Elapsed:</span>
                  <p className="font-bold text-blue-900">{eventLog.elapsedMs}ms</p>
                </div>
                <div>
                  <span className="text-blue-600">Last Event:</span>
                  <p className="font-bold text-blue-900">{eventLog.lastEventType}</p>
                </div>
              </div>
              <div className="space-y-1 max-h-60 overflow-y-auto text-xs font-mono">
                {eventLog.events.map((evt, idx) => {
                  const isUI = evt.eventType.startsWith('UI_');
                  const isError = evt.eventType.includes('ERROR') || evt.eventType.includes('FAIL');
                  const isMeal = evt.eventType.startsWith('MEAL_');
                  
                  let bgClass = 'bg-white text-slate-700';
                  if (isUI) bgClass = 'bg-pink-100 text-pink-900';
                  if (isMeal) bgClass = 'bg-green-100 text-green-900';
                  if (isError) bgClass = 'bg-red-100 text-red-900';
                  
                  return (
                    <div key={idx} className={`px-2 py-1 rounded border-l-2 border-slate-300 ${bgClass}`}>
                      <span className="text-slate-500">[{evt.elapsed}ms]</span> {evt.eventType}
                      {evt.payload && Object.keys(evt.payload).length > 0 && (
                        <span className="ml-2 text-xs opacity-70">
                          {JSON.stringify(evt.payload).substring(0, 50)}...
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Copy & Close */}
          <div className="flex gap-2">
            <Button onClick={copyToClipboard} variant="outline" className="flex-1">
              <Copy className="w-4 h-4 mr-2" />
              העתק JSON
            </Button>
            <Button onClick={onClose} className="flex-1">
              סגור
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}