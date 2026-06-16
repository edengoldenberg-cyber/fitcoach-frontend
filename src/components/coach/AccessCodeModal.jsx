import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Copy, Check, AlertCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';

export default function AccessCodeModal({ 
  open, 
  onClose, 
  accessCode, 
  expiresAt,
  trainee, 
  error, 
  onRetry 
}) {
  const [copied, setCopied] = useState(false);
  const [copiedMessage, setCopiedMessage] = useState(false);

  const handleCopyCode = () => {
    if (accessCode) {
      navigator.clipboard.writeText(accessCode);
      toast.success('הקוד הועתק ללוח');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopyMessage = () => {
    if (accessCode && trainee && expiresAt) {
      const expiryFormatted = format(new Date(expiresAt), 'dd/MM/yyyy בשעה HH:mm', { locale: he });
      const message = `היי ${trainee.full_name.split(' ')[0]} 👋
זה קוד גישה ל-FIT COACH PRO: ${accessCode}
בתוקף עד ${expiryFormatted}. אחרי הכניסה תתבקש/י לקבוע סיסמה.`;
      
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
          <DialogTitle className="text-xl">קוד גישה למתאמן</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            שלח את הקוד למתאמן להתחברות ראשונית
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-800">לא הצלחנו ליצור קוד גישה</p>
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
            {/* Code Display */}
            <div className="bg-gradient-to-br from-teal-50 to-cyan-50 rounded-xl p-6 text-center border-2 border-teal-200">
              <p className="text-sm text-slate-600 mb-2">קוד הגישה</p>
              <div className="text-5xl font-bold tracking-widest" style={{ color: '#79DBD6' }}>
                {accessCode || '------'}
              </div>
            </div>

            {/* Info */}
            {expiresAt && (
              <div className="bg-slate-50 rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span>חד-פעמי: כן</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-600">
                  <Clock className="w-3.5 h-3.5" />
                  <span>בתוקף עד: {format(new Date(expiresAt), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCopyCode}
                disabled={!accessCode}
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
                    העתק קוד
                  </>
                )}
              </Button>

              <Button
                onClick={handleCopyMessage}
                disabled={!accessCode}
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