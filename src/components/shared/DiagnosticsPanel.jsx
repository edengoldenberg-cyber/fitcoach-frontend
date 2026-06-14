import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Wrench, Copy, Trash2, RefreshCw, CheckCircle, AlertTriangle, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { getLogs, clearLogs, exportLogsAsText } from '@/components/shared/diagnostics/logger';
import { analyseLogs } from './diagnostics/analyser';
import { toast } from 'sonner';

export default function DiagnosticsPanel({ open, onClose }) {
  const [analysis, setAnalysis] = useState(null);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    if (open) {
      loadLogs();
    }
  }, [open]);

  const loadLogs = () => {
    const allLogs = getLogs({ limit: 200 });
    setLogs(allLogs);
  };

  const handleAnalyze = () => {
    setIsAnalyzing(true);
    setTimeout(() => {
      const result = analyseLogs(logs);
      setAnalysis(result);
      setIsAnalyzing(false);
      toast.success('ניתוח הושלם');
    }, 500);
  };

  const handleCopyReport = () => {
    const report = exportLogsAsText();
    navigator.clipboard.writeText(report);
    toast.success('דוח הועתק ללוח');
  };

  const handleClearLogs = () => {
    if (window.confirm('למחוק את כל הלוגים?')) {
      clearLogs();
      setLogs([]);
      setAnalysis(null);
      toast.success('לוגים נוקו');
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'PASS': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'WARN': return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'FAIL': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getStatusBadge = (status) => {
    const colors = {
      'PASS': 'bg-green-100 text-green-800',
      'WARN': 'bg-yellow-100 text-yellow-800',
      'FAIL': 'bg-red-100 text-red-800'
    };
    return <Badge className={colors[status] || ''}>{status}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            פאנל דיאגנוסטיקה - FitCoach Pro
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Actions */}
          <div className="flex gap-2 flex-wrap">
            <Button onClick={handleAnalyze} disabled={isAnalyzing} className="gap-2">
              <RefreshCw className={`w-4 h-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
              {isAnalyzing ? 'מנתח...' : 'נתח עכשיו'}
            </Button>
            <Button onClick={handleCopyReport} variant="outline" className="gap-2">
              <Copy className="w-4 h-4" />
              העתק דוח (30 לוגים)
            </Button>
            <Button onClick={handleClearLogs} variant="outline" className="gap-2 text-red-600 hover:text-red-700">
              <Trash2 className="w-4 h-4" />
              נקה לוגים
            </Button>
          </div>

          {/* Stats */}
          <Card className="p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{logs.length}</p>
                <p className="text-xs text-slate-500">לוגים כולל</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-600">
                  {logs.filter(l => l.level === 'error').length}
                </p>
                <p className="text-xs text-slate-500">שגיאות</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-yellow-600">
                  {logs.filter(l => l.level === 'warn').length}
                </p>
                <p className="text-xs text-slate-500">אזהרות</p>
              </div>
            </div>
          </Card>

          {/* Analysis Results */}
          {analysis && (
            <div className="space-y-4">
              <Card className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
                <h3 className="font-bold mb-2 flex items-center gap-2">
                  📊 סיכום
                </h3>
                <p className="text-sm mb-2">{analysis.summary}</p>
                <p className="text-sm font-medium text-blue-900">
                  🔍 גורם ראשי משוער: <span className="font-bold">{analysis.probableRootCause}</span>
                </p>
                {analysis.lastAction && (
                  <p className="text-xs text-blue-700 mt-1">
                    פעולה אחרונה: {analysis.lastAction}
                  </p>
                )}
              </Card>

              {/* Checks */}
              <Card className="p-4">
                <h3 className="font-bold mb-3">✅ בדיקות אוטומטיות</h3>
                <div className="space-y-2">
                  {analysis.checks.map((check, idx) => (
                    <div key={idx} className="flex items-start gap-2 p-2 border rounded">
                      {getStatusIcon(check.status)}
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">{check.name}</span>
                          {getStatusBadge(check.status)}
                        </div>
                        <p className="text-xs text-slate-600">{check.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>

              {/* Recommendations */}
              {analysis.recommendations.length > 0 && (
                <Card className="p-4 bg-gradient-to-br from-amber-50 to-amber-100 border-amber-200">
                  <h3 className="font-bold mb-2 flex items-center gap-2">
                    💡 המלצות לפתרון
                  </h3>
                  <ul className="space-y-1 text-sm">
                    {analysis.recommendations.map((rec, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-amber-600">•</span>
                        <span>{rec}</span>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {/* Debug Info */}
              <Card className="p-4 bg-slate-50">
                <h3 className="font-bold mb-2 text-xs text-slate-600">🔧 Debug Info</h3>
                <pre className="text-xs text-slate-600 whitespace-pre-wrap">
                  {JSON.stringify(analysis.debug, null, 2)}
                </pre>
              </Card>
            </div>
          )}

          {/* Logs Viewer */}
          <Card className="p-4">
            <button
              onClick={() => setShowLogs(!showLogs)}
              className="w-full flex items-center justify-between font-bold mb-2"
            >
              <span>📋 רשומות לוג ({logs.length})</span>
              {showLogs ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showLogs && (
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {logs.slice(-50).reverse().map((log, idx) => (
                  <div key={idx} className="text-xs p-2 border rounded bg-white">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={`text-[10px] ${
                        log.level === 'error' ? 'bg-red-100 text-red-800' :
                        log.level === 'warn' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-slate-100 text-slate-800'
                      }`}>
                        {log.level}
                      </Badge>
                      <span className="font-mono text-slate-500">
                        {new Date(log.ts).toLocaleTimeString('he-IL')}
                      </span>
                      <span className="font-bold">{log.action}</span>
                    </div>
                    <div className="text-slate-600">
                      {JSON.stringify(log.payload, null, 2)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Empty State */}
          {logs.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-slate-500">אין לוגים זמינים</p>
              <p className="text-xs text-slate-400 mt-1">
                בצע פעולות במערכת (הצע ארוחה, ייבא מוצרים) כדי לראות לוגים
              </p>
            </Card>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}