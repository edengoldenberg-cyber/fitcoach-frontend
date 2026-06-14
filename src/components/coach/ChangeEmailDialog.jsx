import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { Loader2, Mail, AlertTriangle, CheckCircle } from "lucide-react";

export default function ChangeEmailDialog({ open, onClose, trainee, onSuccess }) {
  const [newEmail, setNewEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleChangeEmail = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setError('נא להזין כתובת מייל תקינה');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const me = await base44.auth.me();
      if (!me || me.email !== trainee.coach_email) {
        setError('אין הרשאה לשינוי מייל של מתאמן זה');
        setLoading(false);
        return;
      }
    } catch {
      setError('שגיאת אימות. נסה שוב.');
      setLoading(false);
      return;
    }

    try {
      // Delegate to the changeTraineeEmail backend function which:
      // 1. Re-verifies ownership server-side
      // 2. Updates User.email so the trainee can still log in after the change
      // 3. Bulk-updates all activity entities under asServiceRole
      const result = await base44.functions.invoke('changeTraineeEmail', {
        traineeId: trainee.id,
        newEmail: newEmail.toLowerCase().trim(),
      });

      if (!result?.data?.ok) {
        const code = result?.data?.errorCode;
        if (code === 'EMAIL_TAKEN') {
          setError('כתובת המייל הזו כבר רשומה במערכת');
        } else if (code === 'FORBIDDEN') {
          setError('אין הרשאה לשינוי מייל של מתאמן זה');
        } else {
          setError(result?.data?.message || 'שגיאה בעדכון המייל. נסה שוב.');
        }
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Change email error:', err);
      setError('שגיאה בעדכון המייל. נסה שוב.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setNewEmail('');
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-blue-500" />
            שינוי כתובת מייל
          </DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="py-6 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <p className="text-lg font-medium text-slate-800">המייל עודכן בהצלחה!</p>
            <p className="text-sm text-slate-600 mt-2">כל הנתונים הועברו לכתובת החדשה</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-amber-800">
                  <p className="font-medium mb-1">שים לב:</p>
                  <p>המייל הנוכחי: <strong>{trainee.user_email}</strong></p>
                  <p className="mt-2">פעולה זו תעדכן את כתובת המייל בכל הנתונים של המתאמן</p>
                </div>
              </div>
            </div>

            <div>
              <Label>כתובת מייל חדשה</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="example@gmail.com"
                disabled={loading}
              />
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="flex-1"
              >
                ביטול
              </Button>
              <Button
                onClick={handleChangeEmail}
                disabled={loading || !newEmail.trim()}
                className="flex-1 bg-blue-500 hover:bg-blue-600"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מעדכן...
                  </>
                ) : (
                  <>
                    <Mail className="w-4 h-4 ml-2" />
                    עדכן מייל
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}