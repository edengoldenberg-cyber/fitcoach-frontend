import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, XCircle, Loader2, AlertCircle, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function CopyProgressModal({ open, onClose, copyReport, isAdmin }) {
  if (!copyReport) return null;

  const { ok, traceId, steps = [], error } = copyReport;
  
  const copyTraceId = () => {
    navigator.clipboard.writeText(traceId);
    toast.success('מזהה הועתק ללוח');
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {ok ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            {ok ? 'העתקת תרגיל' : 'שגיאה בהעתקה'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Trace ID */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 p-2 rounded">
            <span className="font-mono">{traceId}</span>
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-6 w-6"
              onClick={copyTraceId}
            >
              <Copy className="w-3 h-3" />
            </Button>
          </div>

          {/* Steps */}
          <div className="space-y-2">
            {steps.map((step, idx) => {
              const Icon = step.ok === null ? Loader2 : step.ok ? CheckCircle : XCircle;
              const colorClass = step.ok === null 
                ? 'text-blue-500' 
                : step.ok 
                ? 'text-green-600' 
                : 'text-red-600';
              
              return (
                <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 rounded">
                  <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${colorClass} ${step.ok === null ? 'animate-spin' : ''}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{step.label || step.name}</div>
                    {step.details && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        {typeof step.details === 'string' 
                          ? step.details 
                          : JSON.stringify(step.details).slice(0, 100)}
                      </div>
                    )}
                    {step.error && (
                      <div className="text-xs text-red-600 mt-1">
                        ❌ {step.error}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Error Details (Admin Only) */}
          {error && isAdmin && (
            <div className="border border-red-300 bg-red-50 rounded p-3 text-xs">
              <div className="font-medium text-red-800 mb-1">פרטים טכניים:</div>
              <div className="text-red-700 space-y-1">
                <div><strong>שלב:</strong> {error.step}</div>
                <div><strong>קוד:</strong> {error.code || 'N/A'}</div>
                <div><strong>הודעה:</strong> {error.message}</div>
                {error.stack && (
                  <pre className="mt-2 text-[10px] bg-red-100 p-2 rounded overflow-auto max-h-32">
                    {error.stack}
                  </pre>
                )}
              </div>
            </div>
          )}

          {/* Error Summary */}
          {error && !ok && (
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="text-sm font-medium text-red-800 mb-1">
                שגיאה בשלב: {error.step}
              </div>
              <div className="text-sm text-red-700">
                {error.message}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={onClose} className="flex-1">
              {ok ? 'סגור' : 'אישור'}
            </Button>
            {!ok && error && (
              <Button variant="outline" onClick={copyTraceId}>
                העתק מזהה
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}