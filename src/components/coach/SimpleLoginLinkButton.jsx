import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Link2, Loader2, Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { generateSecureToken } from '@/utils/tokenUtils';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function SimpleLoginLinkButton({ trainee, variant = "outline", size = "default" }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loginLink, setLoginLink] = useState('');
  const [copied, setCopied] = useState(false);

  const createLinkMutation = useMutation({
    mutationFn: async () => {
      // Get or generate invite_token on Trainee entity (same token AccessLink.jsx reads)
      const trainees = await base44.entities.Trainee.filter({ user_email: trainee.user_email });
      const traineeRecord = trainees[0];
      if (!traineeRecord) throw new Error('מתאמן לא נמצא');

      let token = traineeRecord.invite_token;
      if (!token || token.length < 5) {
        token = generateSecureToken();
        await base44.entities.Trainee.update(traineeRecord.id, { invite_token: token });
      }

      // Build AccessLink — use current origin so it works in any deployment
      const appUrl = window.location.origin;
      const fullLink = `${appUrl}/AccessLink?token=${token}`;

      if (!fullLink.includes('?token=')) throw new Error('URL חסר token — לא ניתן להעתיק');

      console.log('[SimpleLoginLinkButton] debug', {
        trainee_email: trainee.user_email,
        invite_token_exists: !!token,
        token_masked: token.substring(0, 12) + '***',
        copied_url: fullLink,
      });

      return fullLink;
    },
    onSuccess: (link) => {
      setLoginLink(link);
      setModalOpen(true);
      toast.success('קישור נוצר בהצלחה!');
    },
    onError: (error) => {
      console.error('Create link error:', error);
      toast.error('שגיאה ביצירת קישור');
    }
  });

  const handleCopy = () => {
    navigator.clipboard.writeText(loginLink);
    toast.success('הקישור הועתק!');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyMessage = () => {
    const message = `היי ${trainee.full_name.split(' ')[0]} 👋

זה הקישור שלך להתחברות ל-FIT COACH PRO:
${loginLink}

פשוט תלחץ/י עליו ותיכנס/י ישירות 💪`;
    
    navigator.clipboard.writeText(message);
    toast.success('ההודעה הועתקה!');
  };

  return (
    <>
      <Button
        onClick={() => createLinkMutation.mutate()}
        disabled={createLinkMutation.isPending}
        variant={variant}
        size={size}
        className="bg-green-500 hover:bg-green-600 text-white"
      >
        {createLinkMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            יוצר קישור...
          </>
        ) : (
          <>
            <Link2 className="w-4 h-4 ml-2" />
            שלח קישור כניסה
          </>
        )}
      </Button>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle>קישור כניסה למתאמן</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800 mb-2 font-medium">
                הקישור מוכן! שלח אותו למתאמן ב-WhatsApp
              </p>
              <div className="bg-white rounded p-2 break-all text-xs text-slate-600">
                {loginLink}
              </div>
            </div>

            <div className="bg-slate-50 rounded-lg p-3 space-y-2 text-xs text-slate-600">
              <p>✓ הקישור בתוקף ל-7 ימים</p>
              <p>✓ המתאמן פשוט לוחץ ונכנס - ללא סיסמה</p>
              <p>✓ קישורים ישנים מבוטלים אוטומטית</p>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleCopy}
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
                variant="outline"
                className="w-full"
              >
                <Copy className="w-4 h-4 ml-2" />
                העתק הודעה מוכנה
              </Button>

              <Button
                variant="outline"
                onClick={() => setModalOpen(false)}
                className="w-full"
              >
                סגור
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}