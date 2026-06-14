import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Copy, Mail, Loader2, CheckCircle } from 'lucide-react';
import { generateSecureToken } from '@/utils/tokenUtils';

const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

async function getOrGenerateInviteToken(trainee) {
  let token = trainee.invite_token;
  if (!token || token.length < 5) {
    token = generateSecureToken();
    await base44.entities.Trainee.update(trainee.id, {
      invite_token: token,
      invite_sent_at: new Date().toISOString(),
    });
  }
  return token;
}

export default function ResendInviteDialog({ open, onClose, trainee }) {
  const [sendingEmail, setSendingEmail] = useState(false);
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();

  const updateInviteMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Trainee.update(trainee.id, {
        invite_last_sent_at: new Date().toISOString()
      });
    },
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const handleCopy = async () => {
    try {
      const token = await getOrGenerateInviteToken(trainee);
      const accessLink = `${APP_URL}/AccessLink?token=${token}`;

      if (!accessLink.includes('?token=')) {
        toast.error('שגיאה: URL חסר token');
        return;
      }

      const firstName = trainee.full_name?.split(' ')[0] || '';
      const message = `היי ${firstName} 👋\nהנה הקישור האישי שלך לכניסה ל-FIT COACH PRO:\n${accessLink}`;

      navigator.clipboard.writeText(message);
      toast.success(`✅ הועתק! token: ${token.substring(0, 10)}... | URL מכיל token: כן`);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      updateInviteMutation.mutate();
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
    }
  };

  const handleCopyLinkOnly = async () => {
    try {
      const token = await getOrGenerateInviteToken(trainee);
      const accessLink = `${APP_URL}/AccessLink?token=${token}`;

      if (!accessLink.includes('?token=')) {
        toast.error('שגיאה: URL חסר token');
        return;
      }

      navigator.clipboard.writeText(accessLink);
      toast.success(`✅ קישור הועתק! token קיים: כן | ${accessLink.substring(0, 55)}...`);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
      updateInviteMutation.mutate();
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
    }
  };

  const handleSendEmail = async () => {
    setSendingEmail(true);
    try {
      const token = await getOrGenerateInviteToken(trainee);
      const accessLink = `${APP_URL}/AccessLink?token=${token}`;
      const firstName = trainee.full_name?.split(' ')[0] || '';

      await base44.integrations.Core.SendEmail({
        to: trainee.user_email,
        subject: 'הזמנה להתחבר ל-FIT COACH PRO',
        body: `
<div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #79DBD6;">ברוך הבא ל-FIT COACH PRO</h2>
  <p>היי ${firstName} 👋</p>
  <p>לחץ על הקישור האישי שלך להכנס לאפליקציה:</p>
  <div style="text-align: center; margin: 24px 0;">
    <a href="${accessLink}" style="background: #79DBD6; color: white; padding: 14px 28px; border-radius: 10px; text-decoration: none; font-size: 16px; font-weight: bold;">
      כניסה לאפליקציה →
    </a>
  </div>
  <p style="color: #64748b; font-size: 12px;">או העתק את הקישור: ${accessLink}</p>
  <hr style="margin: 30px 0;">
  <p style="color: #94a3b8; font-size: 12px; text-align: center;">FIT COACH PRO</p>
</div>`
      });

      await updateInviteMutation.mutateAsync();
      toast.success('המייל נשלח בהצלחה!');
      onClose();
    } catch (err) {
      console.error('Email send error:', err);
      toast.error('שגיאה בשליחת המייל: ' + err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שלח הזמנה מחדש</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-slate-600">מתאמן: <span className="font-medium text-slate-800">{trainee.full_name}</span></p>
            <p className="text-sm text-slate-600">אימייל: <span className="font-medium text-slate-800">{trainee.user_email}</span></p>
            {trainee.invite_token && (
              <p className="text-xs text-green-600 mt-1">✓ token קיים: {trainee.invite_token.substring(0, 14)}...</p>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-800">
            הקישור יפנה ישירות לכניסה דרך Google — ללא סיסמה.
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleCopy} variant="outline" className="w-full">
              {copied ? <><CheckCircle className="w-4 h-4 ml-2 text-green-600" />הועתק!</> : <><Copy className="w-4 h-4 ml-2" />העתק הודעה</>}
            </Button>
            <Button onClick={handleCopyLinkOnly} variant="outline" className="w-full border-teal-300 text-teal-700">
              <Copy className="w-4 h-4 ml-2" />
              העתק קישור
            </Button>
          </div>

          <Button
            onClick={handleSendEmail}
            disabled={sendingEmail}
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
            className="w-full"
          >
            {sendingEmail ? (
              <><Loader2 className="w-4 h-4 ml-2 animate-spin" />שולח...</>
            ) : (
              <><Mail className="w-4 h-4 ml-2" />שלח במייל</>
            )}
          </Button>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="ghost" className="w-full">סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}