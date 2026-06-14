import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, Clock, Zap, Copy, X } from "lucide-react";
import { toast } from 'sonner';

export default function DebugReportModal({ onClose }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    // קרא מ-window.__mealSuggestLastReport
    const lastReport = window.__mealSuggestLastReport;
    if (lastReport) {
      setReport(lastReport);
    }
  }, []);

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
      case 'FALLBACK': return <AlertCircle className="w-5 h-5 text-yellow-600" />;
      case 'ERROR': return <AlertCircle className="w-5 h-5 text-red-600" />;
      default: return null;
    }
  };

  if (!report) {
    return (
      <Dialog open={true} onOpenChange={onClose}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>📊 מצב דיבוג</DialogTitle>
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
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <DialogTitle className="flex items-center gap-2">
              {getStatusIcon()}
              מצב דיבוג
            </DialogTitle>
          </div>
          <DialogClose />
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Summary */}
          <Card className="p-4 bg-gradient-to-br from-slate-50 to-slate-100">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-slate-600 font-medium mb-1">סטטוס</p>
                <Badge className={`bg-${getStatusColor()}-100 text-${getStatusColor()}-800`}>
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

          {/* Error Message (if exists) */}
          {report.errorMessage && (
            <Card className="p-4 bg-red-50 border border-red-200">
              <p className="text-xs text-red-800 font-medium mb-2">⚠️ הודעת שגיאה</p>
              <p className="text-sm text-red-700 font-mono break-words">{report.errorMessage}</p>
            </Card>
          )}

          {/* Last Known Step */}
          <Card className="p-4">
            <p className="text-xs text-slate-600 font-medium mb-2">שלב אחרון</p>
            <p className="text-sm font-mono bg-slate-50 p-2 rounded text-slate-800">
              {report.lastKnownStep || 'N/A'}
            </p>
          </Card>

          {/* Sources Breakdown */}
          {report.sourceCounts && (
            <Card className="p-4">
              <p className="text-xs text-slate-600 font-medium mb-3">מקורות</p>
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
                  <span className="text-slate-700">fallback גלובלי</span>
                  <span className="font-mono font-bold text-slate-900">{report.sourceCounts.globalFallback || 0}</span>
                </div>
              </div>
            </Card>
          )}

          {/* Combinations Found */}
          <Card className="p-4">
            <p className="text-xs text-slate-600 font-medium mb-2">קומבינציות שנמצאו</p>
            <p className="text-2xl font-bold text-slate-900">{report.combinationsFound || 0}</p>
          </Card>

          {/* Detailed Timeline */}
          {report.steps && report.steps.length > 0 && (
            <Card className="p-4">
              <p className="text-xs text-slate-600 font-medium mb-3">ציר זמן</p>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {report.steps.map((step, idx) => (
                  <div key={idx} className="text-xs border-l-2 border-slate-300 pl-3 py-1">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-slate-700">{step.name}</span>
                      <span className="text-slate-500">{step.elapsedMs}ms</span>
                    </div>
                    {step.data && (
                      <p className="text-slate-600 mt-1">
                        {typeof step.data === 'object' ? JSON.stringify(step.data, null, 1) : step.data}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Copy Button */}
          <Button
            onClick={copyToClipboard}
            className="w-full"
            variant="outline"
          >
            <Copy className="w-4 h-4 mr-2" />
            העתק דו"ח JSON
          </Button>

          {/* Close Button */}
          <Button
            onClick={onClose}
            className="w-full"
          >
            סגור
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}