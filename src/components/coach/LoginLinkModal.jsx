import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function LoginLinkModal({ 
  open, 
  onClose, 
  loginLink, 
  trainee, 
  error, 
  onRetry 
}) {
  const [copied, setCopied] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const handleCopyLink = () => {
    if (loginLink) {
      navigator.clipboard.writeText(loginLink);
      toast.success('הקישור הועתק ללוח');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyMessage = () => {
    if (loginLink && trainee) {
      const message = `היי ${trainee.full_name.split(' ')[0]} 👋
זה קישור התחברות ל-FIT COACH PRO:
${loginLink}
אם הקישור פג תוקף תגיד/י לי ואשלח חדש.`;
      
      navigator.clipboard.writeText(message);
      toast.success('ההודעה הועתקה ללוח');
      setCopiedMessage(true);
      setTimeout(() => setCopiedMessage(false), 2000);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl">קישור התחברות למתאמן</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            הקישור מיועד להתחברות מהירה. העתק ושלח למתאמן.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">לא הצלחנו ליצור קישור כרגע</p>
                <p className="text-xs text-red-600 mt-1">{error.message || 'שגיאה לא מזוהה'}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={onRetry}
                className="flex-1"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                נסה שוב
              </Button>
              <Button
                variant="outline"
                onClick={onClose}
                className="flex-1"
              >
                סגור
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Link Display */}
            <div>
              <label className="text-xs font-medium text-slate-700 mb-2 block">
                קישור להתחברות
              </label>
              <div className="flex gap-2">
                <Input
                  value={loginLink || ''}
                  readOnly
                  className="flex-1 text-sm font-mono"
                  dir="ltr"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={handleCopyLink}
                  disabled={!loginLink}
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-green-600" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Info */}
            {loginLink && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-xs text-slate-600">
                <p>✓ קישור אישי — כניסה ישירה ללא סיסמה</p>
                <p>✓ תקף לזמן ממושך</p>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCopyLink}
                disabled={!loginLink}
                className="w-full"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4 ml-2" />
                    הועתק!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 ml-2" />
                    העתק קישור
                  </>
                )}
              </Button>

              <Button
                onClick={handleCopyMessage}
                disabled={!loginLink}
                variant="outline"
                className="w-full"
              >
                {copiedMessage ? (
                  <>
                    <Check className="w-4 h-4 ml-2" />
                    הודעה הועתקה!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 ml-2" />
                    העתק הודעה מוכנה
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={onClose}
                className="w-full"
              >
                סגור
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}