import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, Loader2, CheckCircle2, AlertCircle, BellOff, Zap } from 'lucide-react';
import { toast } from 'sonner';

/**
 * QuickAlertModal
 *
 * Lets a coach send an immediate push notification to a specific trainee.
 * Uses the backend sendCoachQuickAlert function which:
 *  - Validates trainee ownership server-side (never trusts email from client alone)
 *  - Calls sendPushToTrainee() directly (existing VAPID push infrastructure)
 *  - Returns truthful delivery counts: { sent, failed, removed, has_push_subscription }
 *
 * Delivery result is shown honestly — never "sent" if nothing was actually delivered.
 *
 * Props:
 *   open           – boolean
 *   onClose        – () => void
 *   trainee        – { id, full_name, user_email, visible_modules }
 *   summary        – from coachWeeklySummary (action_item, this_week, etc.) or null
 */

// Preset templates — each has a key, label, and message generator.
// Context-aware: some presets are only relevant when data shows they apply.
const buildPresets = (trainee, summary) => {
  const firstName = trainee?.full_name?.split(' ')[0] || '';
  const presets = [];

  const vm = (() => {
    const raw = trainee?.visible_modules;
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    try { return JSON.parse(raw); } catch { return {}; }
  })();

  const nutritionOn = vm.nutrition !== false;
  const workoutsOn  = vm.workout   !== false;

  // Only show nutrition reminder when nutrition tracking is enabled
  if (nutritionOn) {
    presets.push({
      key:     'no_nutrition',
      label:   '🥗 לא עדכנת תזונה',
      message: `${firstName}, שמתי לב שעוד לא עדכנת תזונה היום. חשוב לי שנמשיך לעקוב 💪`,
    });
  }

  if (workoutsOn) {
    presets.push({
      key:     'no_workout',
      label:   '🏋️ לא התאמנת היום',
      message: `${firstName}, ראיתי שעוד לא רשמת אימון היום. מה השתבש? בואו נסדר את זה 💪`,
    });

    // Only show "workout left this week" if they have a plan and haven't completed it
    const planned   = summary?.this_week?.planned_workouts;
    const completed = summary?.this_week?.workouts_completed;
    if (planned && completed !== null && completed < planned) {
      presets.push({
        key:     'workout_remaining',
        label:   '📅 נשאר לך אימון השבוע',
        message: `${firstName}, נשאר לך עוד אימון השבוע! זה הזמן להשלים את היעד 🏆`,
      });
    }
  }

  presets.push({
    key:     'weigh_in',
    label:   '⚖️ תזכורת לשקילה',
    message: `${firstName}, הגיע הזמן לשקילה! זה עוזר לנו לעקוב אחרי ההתקדמות שלך 📊`,
  });

  presets.push({
    key:     'encouragement',
    label:   '💪 עידוד כללי',
    message: `${firstName}, אתה עושה עבודה מדהימה! המשך כך, אני גאה בך 🌟`,
  });

  presets.push({
    key:     'custom',
    label:   '✉️ הודעה אישית',
    message: '',
  });

  return presets;
};

// Delivery result UI — honest about what actually happened
function DeliveryResult({ result }) {
  if (!result) return null;

  if (result.sent > 0) {
    return (
      <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm">
        <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
        <span>ההתראה נשלחה בהצלחה ל-{result.sent} מכשיר{result.sent > 1 ? 'ים' : ''}</span>
      </div>
    );
  }

  if (!result.has_push_subscription) {
    return (
      <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-sm">
        <BellOff className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">לא נשלח</p>
          <p className="text-xs text-slate-500 mt-0.5">
            ל-{result.trainee_name || 'המתאמן'} אין מכשיר רשום לקבל push notifications.
            אפשר לשלוח הודעת WhatsApp במקום.
          </p>
        </div>
      </div>
    );
  }

  if (result.removed > 0) {
    return (
      <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-sm">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-medium">לא נשלח — subscription לא תקין</p>
          <p className="text-xs opacity-80 mt-0.5">
            המכשיר של המתאמן ביטל את ה-push subscription. ניקינו אותו אוטומטית.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-800 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />
      <span>שליחה נכשלה — אנא נסה שוב</span>
    </div>
  );
}

export default function QuickAlertModal({ open, onClose, trainee, summary }) {
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [customMessage, setCustomMessage]   = useState('');
  const [deliveryResult, setDeliveryResult] = useState(null);

  const presets = trainee ? buildPresets(trainee, summary) : [];

  const handleClose = () => {
    setSelectedPreset(null);
    setCustomMessage('');
    setDeliveryResult(null);
    onClose();
  };

  const handleSelectPreset = (preset) => {
    setSelectedPreset(preset);
    // For custom, keep whatever the coach typed; for others, seed the textarea
    if (preset.key !== 'custom') {
      setCustomMessage(preset.message);
    }
    setDeliveryResult(null);
  };

  const effectiveMessage = customMessage.trim();

  const sendMutation = useMutation({
    mutationFn: () => base44.functions.invoke('sendCoachQuickAlert', {
      trainee_email: trainee.user_email,
      title:         'הודעה מהמאמן שלך',
      message:       effectiveMessage,
    }),
    onSuccess: (data) => {
      const r = data?.result ?? data;
      setDeliveryResult(r);
      if (r?.sent > 0) {
        toast.success(`✅ ההתראה נשלחה ל-${trainee.full_name}`);
      }
    },
    onError: (err) => {
      toast.error(`❌ שגיאה בשליחה: ${err.message}`);
    },
  });

  const canSend = !!effectiveMessage && !sendMutation.isPending && !deliveryResult;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); }}>
      <DialogContent className="max-w-sm" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4 text-amber-500" />
            התראת בזק — {trainee?.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-1">
          {/* Delivery result (shown after send) */}
          {deliveryResult && (
            <DeliveryResult result={deliveryResult} />
          )}

          {/* Preset selection */}
          {!deliveryResult && (
            <>
              <p className="text-xs text-slate-500 font-medium">בחר הודעה מהירה:</p>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.key}
                    onClick={() => handleSelectPreset(p)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-full border transition-colors font-medium
                      ${selectedPreset?.key === p.key
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:border-teal-400 hover:text-teal-700'
                      }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              {/* Message editor — shown once a preset is selected or user clicks custom */}
              {selectedPreset && (
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500 font-medium">הודעה:</p>
                  <Textarea
                    value={customMessage}
                    onChange={(e) => setCustomMessage(e.target.value)}
                    placeholder="כתוב הודעה..."
                    className="min-h-[80px] text-sm resize-none"
                    maxLength={300}
                    dir="rtl"
                  />
                  <p className="text-[10px] text-slate-400 text-left">{customMessage.length}/300</p>
                </div>
              )}
            </>
          )}

          {/* CTA */}
          <div className="flex gap-2 pt-1">
            {deliveryResult ? (
              <Button variant="outline" size="sm" onClick={handleClose} className="flex-1">
                סגור
              </Button>
            ) : (
              <>
                <Button variant="outline" size="sm" onClick={handleClose} className="flex-shrink-0">
                  ביטול
                </Button>
                <Button
                  size="sm"
                  onClick={() => sendMutation.mutate()}
                  disabled={!canSend}
                  className="flex-1 bg-teal-600 hover:bg-teal-700 gap-1.5"
                >
                  {sendMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  שלח עכשיו
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
