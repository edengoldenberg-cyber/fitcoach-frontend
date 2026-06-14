import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, AlertCircle, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function CopyDebugModal({ open, onClose, debugData }) {
  if (!debugData) return null;

  const copyToClipboard = () => {
    const text = JSON.stringify(debugData, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('הועתק ללוח');
  };

  const isSuccess = debugData.response?.ok || debugData.response?.success;
  const statusCode = debugData.response?.status || debugData.statusCode;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isSuccess ? (
              <CheckCircle className="w-5 h-5 text-green-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            Copy Debug Info
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status */}
          <div className={`p-3 rounded-lg ${isSuccess ? 'bg-green-50' : 'bg-red-50'}`}>
            <div className="font-medium">
              Status: {isSuccess ? '✅ Success' : '❌ Failed'}
            </div>
            <div className="text-sm mt-1">
              HTTP Status: {statusCode || 'N/A'}
            </div>
          </div>

          {/* Request Payload */}
          <div className="border rounded-lg p-3">
            <div className="font-medium mb-2 flex items-center gap-2">
              📤 Request Payload
            </div>
            <pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(debugData.payload, null, 2)}
            </pre>
          </div>

          {/* Field Validation */}
          {debugData.validation && (
            <div className="border rounded-lg p-3">
              <div className="font-medium mb-2">🔍 Field Validation</div>
              <div className="space-y-1 text-sm">
                {Object.entries(debugData.validation).map(([field, valid]) => (
                  <div key={field} className="flex items-center gap-2">
                    {valid ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-red-600" />
                    )}
                    <span className={valid ? 'text-green-700' : 'text-red-700'}>
                      {field}: {valid ? 'OK' : 'MISSING'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Response */}
          <div className="border rounded-lg p-3">
            <div className="font-medium mb-2 flex items-center gap-2">
              📥 Server Response
            </div>
            <pre className="bg-slate-50 p-2 rounded text-xs overflow-auto max-h-40">
              {JSON.stringify(debugData.response, null, 2)}
            </pre>
          </div>

          {/* Error Details */}
          {debugData.error && (
            <div className="border border-red-300 bg-red-50 rounded-lg p-3">
              <div className="font-medium mb-2 text-red-800">❌ Error Details</div>
              <div className="text-sm text-red-700 whitespace-pre-wrap">
                {debugData.error}
              </div>
            </div>
          )}

          {/* Timing */}
          {debugData.duration && (
            <div className="text-xs text-slate-500">
              Duration: {debugData.duration}ms
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button onClick={copyToClipboard} variant="outline" className="flex-1">
              <Copy className="w-4 h-4 ml-2" />
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