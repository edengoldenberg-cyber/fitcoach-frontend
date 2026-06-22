import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Copy, Loader2, CheckCircle, MessageCircle } from 'lucide-react';
import { generateSecureToken } from '@/utils/tokenUtils';

const APP_URL = typeof window !== 'undefined' ? window.location.origin : '';

async function getOrGenerateInviteToken(trainee) {
  let token = trainee.invite_token;
  if (!token || token.length < 5) {
    token = generateSecureToken();
    await base44.entities.Trainee.update(trainee.id, { invite_token: token });
  }
  return token;
}

export default function ResendInviteDialog({ open, onClose, trainee }) {
  const [sendingWA, setSendingWA] = useState(false);
  const [copied, setCopied]       = useState(false);
  const [waResult, setWaResult]   = useState(null);
  const queryClient = useQueryClient();

  // ── WhatsApp (primary) ─────────────────────────────────────────────────────
  const handleSendWhatsApp = async () => {
    if (!trainee?.phone) {
      toast.error('למתאמן אין מספר טלפון — לא ניתן לשלוח וואטסאפ');
      return;
    }
    setSendingWA(true);
    setWaResult(null);
    try {
      const res = await Promise.race([
        base44.functions.invoke('resendTraineeWhatsAppInvite', { trainee_id: trainee.id }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
      ]);
      const result = res?.data ?? res;
      setWaResult(result);
      if (result?.sent) {
        toast.success('ההזמנה נשלחה בוואטסאפ 💬');
        queryClient.invalidateQueries(['trainee']);
      } else {
        toast.error('שליחת וואטסאפ נכשלה — העתק קישור ידנית');
      }
    } catch (err) {
      toast.error('שגיאה: ' + err.message);
      setWaResult({ sent: false, error: err.message });
    } finally {
      setSendingWA(false);
    }
  };

  // ── Copy link ──────────────────────────────────────────────────────────────
  const handleCopyLink = async () => {
    try {
      let link = waResult?.invite_link;
      if (!link) {
        const token = await getOrGenerateInviteToken(trainee);
        link = `${APP_URL}/AccessLink?token=${token}`;
      }
      await navigator.clipboard.writeText(link);
      toast.success('קישור הועתק!');
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) { toast.error('שגיאה: ' + err.message); }
  };

  // ── Copy WhatsApp message text ─────────────────────────────────────────────
  const handleCopyMessage = async () => {
    try {
      let link = waResult?.invite_link;
      if (!link) {
        const token = await getOrGenerateInviteToken(trainee);
        link = `${APP_URL}/AccessLink?token=${token}`;
      }
      const firstName = trainee?.full_name?.split(' ')[0] || '';
      const msg =
        `שלום ${firstName} 👋\n` +
        `הוזמנת לאפליקציית FitCoach Pro של Shape Studio.\n\n` +
        `להתחברות והגדרת החשבון:\n${link}\n\n` +
        `אם הקישור לא נפתח, העתק/י אותו לדפדפן.`;
      await navigator.clipboard.writeText(msg);
      toast.success('הודעת וואטסאפ הועתקה!');
    } catch (err) { toast.error('שגיאה: ' + err.message); }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>שלח הזמנת וואטסאפ</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Trainee info */}
          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="text-slate-600">מתאמן: <span className="font-semibold text-slate-800">{trainee?.full_name}</span></p>
            {trainee?.phone ? (
              <p className="text-slate-600 mt-0.5">טלפון: <span className="font-mono text-slate-800">{trainee.phone}</span></p>
            ) : (
              <p className="text-red-600 mt-0.5 text-xs">⚠️ אין מספר טלפון — לא ניתן לשלוח וואטסאפ</p>
            )}
          </div>

          {/* Result banner */}
          {waResult && (
            <div className={`rounded-lg p-3 text-sm ${waResult.sent ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {waResult.sent ? (
                <>
                  <p className="text-green-800 font-medium">✅ נשלח לבדיקה — בדוק שהמתאמן קיבל</p>
                  <p className="text-green-700 text-xs mt-1">אם לא קיבל תוך דקה, השתמש בכפתורי ההעתקה למטה</p>
                  {waResult.whatsapp_id && <p className="text-green-600 text-xs mt-0.5 font-mono">ID: {waResult.whatsapp_id}</p>}
                </>
              ) : (
                <>
                  <p className="text-red-800 font-medium">
                    {waResult.not_on_whatsapp ? '⚠️ המספר לא רשום בוואטסאפ' : '❌ שליחה נכשלה'}
                  </p>
                  {waResult.error && <p className="text-red-700 text-xs mt-1">{waResult.error}</p>}
                  <p className="text-red-700 text-xs mt-1 font-medium">השתמש/י בכפתורי ההעתקה למטה לשליחה ידנית</p>
                </>
              )}
            </div>
          )}

          {/* PRIMARY: Send WhatsApp */}
          <Button
            data-testid="resend-whatsapp-btn"
            onClick={handleSendWhatsApp}
            disabled={sendingWA || !trainee?.phone}
            className="w-full h-12 text-base font-semibold"
            style={{ backgroundColor: '#25D366', color: 'white' }}
          >
            {sendingWA
              ? <><Loader2 className="w-5 h-5 ml-2 animate-spin" />שולח וואטסאפ...</>
              : <><MessageCircle className="w-5 h-5 ml-2" />שלח הזמנת וואטסאפ</>}
          </Button>

          {/* Fallback: copy */}
          <div className="grid grid-cols-2 gap-2">
            <Button onClick={handleCopyLink} variant="outline" size="sm" className="w-full">
              {copied
                ? <><CheckCircle className="w-4 h-4 ml-1 text-green-600" />הועתק!</>
                : <><Copy className="w-4 h-4 ml-1" />העתק קישור</>}
            </Button>
            <Button onClick={handleCopyMessage} variant="outline" size="sm" className="w-full">
              <Copy className="w-4 h-4 ml-1" />העתק הודעה
            </Button>
          </div>

          <p className="text-xs text-slate-400 text-center">שולח דרך Green API ישירות לטלפון המתאמן</p>
        </div>

        <DialogFooter>
          <Button onClick={onClose} variant="ghost" className="w-full">סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
