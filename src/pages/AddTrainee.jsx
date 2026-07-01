import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, UserPlus, Check } from "lucide-react";
import { toast } from 'sonner';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { generateSecureToken } from '@/utils/tokenUtils';
import InviteFollowupModal from '../components/coach/InviteFollowupModal';
import WhatsAppButton from '../components/shared/WhatsAppButton';
import BackButton from '../components/shared/BackButton';

export default function AddTrainee() {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    full_name: '',
    user_email: '',
    phone: '',
    gender: '',
    height_cm: '',
  });
  const [success, setSuccess] = useState(false);
  const [createdTrainee, setCreatedTrainee] = useState(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [personalAccessLink, setPersonalAccessLink] = useState(null);
  const [whatsappSent, setWhatsappSent] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: coachSettings } = useQuery({
    queryKey: ['coachSettings', user?.email],
    queryFn: async () => {
      const result = await base44.entities.CoachSettings.filter({ coach_email: user?.email });
      return result[0];
    },
    enabled: !!user?.email,
  });

  const createTraineeMutation = useMutation({
    mutationFn: async (data) => {
      const debugInfo = {
        step: '',
        errorCode: '',
        errorSource: '',
        errorMessageRaw: ''
      };

      try {
        // Normalize and validate input
        debugInfo.step = 'VALIDATION';
        const normalizedEmail = data.user_email?.trim().toLowerCase() || '';
        let normalizedPhone = data.phone?.replace(/[\s-]/g, '') || '';
        
        // Normalize Israeli phone format
        if (normalizedPhone.startsWith('0')) {
          normalizedPhone = '+972' + normalizedPhone.substring(1);
        } else if (normalizedPhone.startsWith('972')) {
          normalizedPhone = '+' + normalizedPhone;
        } else if (!normalizedPhone.startsWith('+')) {
          normalizedPhone = '+972' + normalizedPhone;
        }
        
        if (!normalizedPhone || !data.full_name || !normalizedEmail) {
          debugInfo.errorCode = 'VALIDATION_FAILED';
          debugInfo.errorSource = 'UI';
          debugInfo.errorMessageRaw = 'חסרים שדות חובה (טלפון, שם, אימייל)';
          throw new Error('חובה למלא: טלפון, שם מלא ואימייל');
        }

        // Step 1: Clean up deleted records
        debugInfo.step = 'CLEANUP';
        try {
          const existingTrainees = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
          const deletedTrainee = existingTrainees.find(t => t.status === 'deleted');
          if (deletedTrainee) {
            await base44.entities.Trainee.delete(deletedTrainee.id);
            
            // Clean up ghost users
            const oldUsers = await base44.entities.User.filter({ email: normalizedEmail });
            for (const oldUser of oldUsers) {
              const timestamp = Date.now();
              const randomSuffix = Math.random().toString(36).substring(7);
              const aliasEmail = `ghost_${timestamp}_${randomSuffix}@cleanup.fitcoach.local`;
              try {
                await base44.entities.User.update(oldUser.id, {
                  email: aliasEmail,
                  full_name: `[GHOST_${timestamp}] ${oldUser.full_name || ''}`
                });
              } catch (updateErr) {
                await base44.entities.User.delete(oldUser.id);
              }
            }
          }
        } catch (cleanupErr) {
          console.warn('Cleanup warning:', cleanupErr);
        }

        let createdUserId = null;
        let userJustCreated = false; // track whether we created the user or reused existing

        // Step 2: Create user record (role=user), or reuse existing
        debugInfo.step = 'CREATE_USER';
        debugInfo.errorSource = 'DB';

        try {
          const newUser = await base44.entities.User.create({
            email: normalizedEmail,
            full_name: data.full_name,
            role: 'user'
          });
          createdUserId = newUser.id;
          userJustCreated = true;
        } catch (userErr) {
          // User already exists — reuse their id (common for re-invited trainees)
          try {
            const existingUsers = await base44.entities.User.filter({ email: normalizedEmail });
            if (existingUsers.length > 0) {
              createdUserId = existingUsers[0].id;
              userJustCreated = false; // reusing, do NOT delete on failure
            } else {
              throw userErr;
            }
          } catch {
            debugInfo.errorCode = 'USER_CREATE_FAILED';
            debugInfo.errorMessageRaw = userErr.message || userErr.toString();
            throw new Error(`שגיאה ביצירת משתמש: ${userErr.message || 'שגיאה לא מזוהה'}`);
          }
        }

        // Step 3: Create OR update trainee record
        // If a non-deleted trainee already exists for this email (re-invite scenario),
        // UPDATE it with a fresh invite_token rather than trying to CREATE a duplicate.
        debugInfo.step = 'CREATE_TRAINEE';
        debugInfo.errorSource = 'DB';

        let trainee;
        try {
          const inviteToken = generateSecureToken();

          // Re-fetch current trainee state (after cleanup ran above)
          const currentTrainees = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
          const existingActive  = currentTrainees.find(t => t.status !== 'deleted');

          if (existingActive) {
            // Re-invite: update the existing trainee with fresh token + current data
            trainee = await base44.entities.Trainee.update(existingActive.id, {
              user_id:       createdUserId,
              user_email:    normalizedEmail,
              phone:         normalizedPhone,
              full_name:     data.full_name,
              coach_email:   user?.email,
              status:        'active',
              invite_token:  inviteToken,
              invite_status: 'pending',
            });
          } else {
            // New trainee: create fresh
            trainee = await base44.entities.Trainee.create({
              user_id:    createdUserId,
              user_email: normalizedEmail,
              phone:      normalizedPhone,
              full_name:  data.full_name,
              gender:     data.gender || null,
              height_cm:  data.height_cm || null,
              coach_email: user?.email,
              status:     'active',
              invite_token: inviteToken,
            });
          }

        } catch (traineeErr) {
          debugInfo.errorCode = 'TRAINEE_CREATE_FAILED';
          debugInfo.errorMessageRaw = traineeErr.message || traineeErr.toString();

          // Rollback: ONLY delete users we actually just created — never delete pre-existing users
          if (userJustCreated && createdUserId) {
            await base44.entities.User.delete(createdUserId).catch(err =>
              console.error('Failed to rollback user creation:', err)
            );
          }

          throw new Error(`שגיאה ביצירת רשומת מתאמן: ${traineeErr.message || 'שגיאה לא מזוהה'}`);
        }

        // Step 4: Build invite link from the invite_token stored on the trainee record.
        // AccessLink.jsx uses a public backend endpoint to validate tokens, so any user
        // (authenticated or not) can open this link.
        debugInfo.step = 'BUILD_INVITE_LINK';
        const appUrl      = window.location.origin;
        const accessToken = trainee?.invite_token;
        const loginUrl    = accessToken ? `${appUrl}/AccessLink?token=${accessToken}` : `${appUrl}/AccessLink`;
        const personalAccessLink = null; // no longer needed — invite_token on Trainee is sufficient

        // Step 5: Enqueue WhatsApp invite via onTraineeCreated (queue-based, idempotent)
        debugInfo.step = 'SEND_WHATSAPP_INVITE';
        let whatsappSent = false;
        let whatsappError = null;

        try {
          const waRes = await Promise.race([
            base44.functions.invoke('onTraineeCreated', { data: trainee }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('WhatsApp invite timeout')), 9000)),
          ]);
          // sent=true means enqueued + worker triggered server-side (delivery guaranteed)
          whatsappSent = !!waRes?.sent || !!(waRes?.queue_id);
          if (!whatsappSent && !waRes?.duplicate) whatsappError = waRes?.error || waRes?.reason || 'לא נשלח';
        } catch (waErr) {
          whatsappError = waErr.message;
          console.error('WhatsApp invite failed (non-blocking):', waErr.message);
        }

        const inviteLink = personalAccessLink || loginUrl;

        // Step 6: Fire-and-forget email fallback (never blocks)
        Promise.race([
          base44.functions.invoke('sendInviteEmail', {
            to_email:  normalizedEmail,
            full_name: data.full_name,
            login_url: inviteLink,
          }),
          new Promise(r => setTimeout(r, 5000)),
        ]).catch(() => {});

        return { trainee, loginUrl, inviteLink, whatsappSent, whatsappError, personalAccessLink };
        
      } catch (error) {
        // Debug logging
        console.error('CREATE_TRAINEE_ERROR:', {
          ...debugInfo,
          originalError: error.message
        });
        
        // User-friendly error or pass through our custom errors
        throw error;
      }
    },
    onSuccess: (result) => {
      setCreatedTrainee(result.trainee);
      setLoginUrl(result.inviteLink || result.loginUrl);
      setWhatsappSent(result.whatsappSent);
      setMagicLinkSent(false);
      setPersonalAccessLink(result.personalAccessLink);
      setSuccess(true);
      if (result.whatsappSent) {
        toast.success('המתאמן נוצר והזמנה נשלחה בוואטסאפ 💬');
      } else {
        toast('המתאמן נוצר. העתק/י את הקישור ושלח/י ידנית.');
      }
    },
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    createTraineeMutation.mutate({
      ...formData,
      height_cm: formData.height_cm ? +formData.height_cm : null,
    });
  };

  if (success) {
    const displayLink = personalAccessLink || loginUrl;
    if (displayLink) navigator.clipboard.writeText(displayLink).catch(() => {});

    const waMessage =
      `שלום ${formData.full_name.split(' ')[0]} 👋\n` +
      `הוזמנת לאפליקציית FitCoach Pro של Shape Studio.\n\n` +
      `להתחברות והגדרת החשבון:\n${displayLink}\n\n` +
      `אם הקישור לא נפתח, העתק/י אותו לדפדפן.`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">המתאמן נוסף בהצלחה!</h2>

          {/* WhatsApp invite status */}
          {whatsappSent ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-800 font-medium">💬 הזמנה נשלחה בוואטסאפ</p>
              <p className="text-xs text-green-700 mt-1">המתאמן קיבל הודעה עם קישור כניסה ישיר.</p>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-amber-800 font-medium mb-1">⚠️ שליחת וואטסאפ נכשלה — שלח/י ידנית</p>
              <p className="text-xs text-amber-700 mb-2">העתק/י את ההודעה הבאה ושלח/י ב-WhatsApp:</p>
              <div className="bg-white p-2 rounded text-xs text-right border border-amber-200 mb-2 whitespace-pre-wrap">
                {waMessage}
              </div>
              <Button size="sm" variant="outline" className="w-full"
                onClick={() => { navigator.clipboard.writeText(waMessage); toast.success('הועתק!'); }}>
                העתק הודעה לוואטסאפ
              </Button>
            </div>
          )}

          {/* Access link always shown */}
          {displayLink && (
            <div className="bg-slate-50 border rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-600 mb-1">קישור כניסה למתאמן:</p>
              <p className="text-xs font-mono text-slate-700 break-all bg-white p-2 rounded border">{displayLink}</p>
              <Button size="sm" variant="outline" className="w-full mt-2"
                onClick={() => { navigator.clipboard.writeText(displayLink); toast.success('הועתק!'); }}>
                העתק קישור
              </Button>
            </div>
          )}


          <Button
            className="w-full mb-2"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(waMessage);
              toast.success('ההודעה הועתקה');
            }}
          >
            העתק הודעה למתאמן
          </Button>

          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              onClick={() => navigate(createPageUrl('CoachDashboard'))}
            >
              רשימת מתאמנים
            </Button>
            <Button
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              onClick={() => navigate(createPageUrl('TraineeProfile') + `?traineeId=${createdTrainee?.id}`)}
            >
              פרופיל המתאמן
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <BackButton fallbackPath={createPageUrl('CoachDashboard')} />
          <h1 className="text-2xl font-bold text-slate-800">הוסף מתאמן חדש</h1>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Info Card */}
          <Card className="p-4 bg-blue-50 border-blue-200 mb-4">
            <div>
              <p className="font-medium text-slate-800">ℹ️ תהליך הוספת מתאמן</p>
              <p className="text-xs text-slate-600 mt-1">
                לאחר מילוי הפרטים, המתאמן יקבל מייל עם קישור להתחברות.
              </p>
              <p className="text-xs text-amber-700 mt-2 font-medium">
                💡 אם אין לו Gmail - תקבל/י קישור אישי לשליחה ב-WhatsApp
              </p>
            </div>
          </Card>

          <Card className="p-6 bg-white border-0 shadow-sm mb-4">
            <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-500" />
              פרטים אישיים
            </h2>
            
            <div className="space-y-4">
              <div>
                <Label>שם מלא *</Label>
                <Input
                  data-testid="trainee-full-name"
                  value={formData.full_name}
                  onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                  placeholder="ישראל ישראלי"
                  required
                />
              </div>
              
              <div>
                <Label>טלפון *</Label>
                <Input
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  placeholder="050-0000000"
                  required
                  dir="ltr"
                  className="text-left"
                />
                <p className="text-xs text-slate-500 mt-1">
                  לתקשורת בלבד (לא להתחברות)
                </p>
              </div>
              
              <div>
               <Label>אימייל *</Label>
               <Input
                 type="email"
                 value={formData.user_email}
                 onChange={(e) => setFormData({...formData, user_email: e.target.value})}
                 placeholder="email@example.com (כל סוג אימייל)"
                 required
               />
               <p className="text-xs text-slate-500 mt-1">
                 אפשר גם אימייל של וואלה/הוטמייל - לא חייב Gmail
               </p>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>מין</Label>
                  <Select value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                    <SelectTrigger>
                      <SelectValue placeholder="בחר" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">זכר</SelectItem>
                      <SelectItem value="female">נקבה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>גובה (ס״מ)</Label>
                  <Input
                    type="number"
                    value={formData.height_cm}
                    onChange={(e) => setFormData({...formData, height_cm: e.target.value})}
                    placeholder="170"
                  />
                </div>
              </div>
            </div>
          </Card>



          <Button 
            type="submit" 
            className="w-full bg-emerald-500 hover:bg-emerald-600 h-12 text-lg"
            disabled={createTraineeMutation.isPending}
          >
            {createTraineeMutation.isPending ? 'יוצר מתאמן ושולח הזמנה...' : 'הוסף מתאמן'}
          </Button>

          {createTraineeMutation.isError && (
            <div className="mt-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="text-red-700 text-sm font-medium mb-1">
                  ❌ {createTraineeMutation.error?.message || 'שגיאה לא מוגדרת'}
                </p>
                {user?.role === 'admin' && (
                  <details className="mt-2">
                    <summary className="text-xs text-red-600 cursor-pointer hover:underline">
                      מידע טכני (Admin)
                    </summary>
                    <pre className="text-xs text-slate-600 mt-2 bg-white p-2 rounded border overflow-auto">
                      {JSON.stringify(createTraineeMutation.error, null, 2)}
                    </pre>
                  </details>
                )}
              </div>
              <p className="text-xs text-slate-500 text-center mt-2">
                אם השגיאה חוזרת, נסה <Link to={createPageUrl('AdminPurgeEmail')} className="text-blue-600 underline">לנקות משתמשים תקועים</Link>
              </p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}