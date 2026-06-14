import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, MessageCircle, X } from 'lucide-react';

export default function InviteFollowupModal({ 
  open, 
  onClose, 
  traineeName, 
  traineePhone, 
  onOpenWhatsApp 
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-emerald-600">
            <Check className="w-6 h-6" />
            הזמנה נשלחה בהצלחה
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-slate-700">
            הזמנה נשלחה למייל של <strong>{traineeName}</strong>
          </p>
          
          {traineePhone ? (
            <>
              <p className="text-slate-600 text-sm">
                רוצה לשלוח גם הודעת וואטסאפ כדי לוודא שהוא יראה את ההזמנה?
              </p>
              
              <div className="space-y-2">
                <Button 
                  onClick={onOpenWhatsApp}
                  className="w-full bg-green-500 hover:bg-green-600 flex items-center gap-2"
                >
                  <MessageCircle className="w-5 h-5" />
                  פתח WhatsApp עם הודעה מוכנה
                </Button>
                
                <Button 
                  onClick={onClose}
                  variant="outline"
                  className="w-full"
                >
                  לא עכשיו
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <p className="text-sm text-amber-800">
                  ⚠️ אין מספר טלפון למתאמן זה
                </p>
                <p className="text-xs text-amber-700 mt-1">
                  לא ניתן לפתוח WhatsApp ללא מספר טלפון
                </p>
              </div>
              
              <Button 
                onClick={onClose}
                className="w-full"
              >
                סגור
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}