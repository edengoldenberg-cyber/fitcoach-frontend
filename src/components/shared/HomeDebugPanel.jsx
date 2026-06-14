import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, Copy, XCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

export default function HomeDebugPanel({ correlationId, steps, isAdmin }) {
  const [expanded, setExpanded] = useState(false);

  if (!isAdmin) return null;

  const copyDebugReport = () => {
    const report = {
      correlationId,
      timestamp: new Date().toISOString(),
      steps: steps.map(s => ({
        name: s.name,
        status: s.status,
        ok: s.ok,
        errorCode: s.errorCode,
        errorMessage: s.errorMessage,
        debugData: s.debugData,
        duration_ms: s.duration_ms
      }))
    };
    
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success('דוח דיבוג הועתק ללוח');
  };

  const getStepIcon = (step) => {
    if (step.status === 'pending') return <Clock className="w-4 h-4 text-slate-400" />;
    if (step.status === 'running') return <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />;
    if (step.ok) return <CheckCircle className="w-4 h-4 text-green-600" />;
    return <XCircle className="w-4 h-4 text-red-600" />;
  };

  const failedSteps = steps.filter(s => !s.ok && s.status === 'complete');
  const hasErrors = failedSteps.length > 0;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 max-w-2xl mx-auto" dir="rtl">
      <Card className="border-2 border-amber-400 bg-white shadow-2xl">
        <div 
          onClick={() => setExpanded(!expanded)}
          className="p-4 cursor-pointer flex items-center justify-between hover:bg-slate-50"
        >
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-bold text-slate-800">🔧 Debug Panel (Admin)</p>
              <p className="text-xs text-slate-500">ID: {correlationId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasErrors && (
              <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">
                {failedSteps.length} שגיאות
              </span>
            )}
            {expanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </div>
        </div>

        {expanded && (
          <div className="border-t p-4 space-y-3">
            {steps.map((step, i) => (
              <div 
                key={i}
                className={`p-3 rounded-lg border ${
                  !step.ok && step.status === 'complete' 
                    ? 'bg-red-50 border-red-200' 
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  {getStepIcon(step)}
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{step.name}</p>
                      {step.duration_ms && (
                        <span className="text-xs text-slate-500">{step.duration_ms}ms</span>
                      )}
                    </div>
                    
                    {step.errorCode && (
                      <p className="text-xs text-red-700 mt-1">
                        <span className="font-mono bg-red-100 px-1 rounded">{step.errorCode}</span>
                        {' '}{step.errorMessage}
                      </p>
                    )}
                    
                    {step.debugData && (
                      <details className="mt-2">
                        <summary className="text-xs text-slate-600 cursor-pointer">Debug Data</summary>
                        <pre className="text-xs bg-white p-2 rounded border mt-1 overflow-x-auto">
                          {JSON.stringify(step.debugData, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              </div>
            ))}

            <Button
              onClick={copyDebugReport}
              variant="outline"
              className="w-full"
              size="sm"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Debug Report
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}