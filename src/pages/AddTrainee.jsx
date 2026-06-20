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
        } catch (userErr) {
          // User might already exist (e.g. Gmail user already in system) — try to find it
          try {
            const existingUsers = await base44.entities.User.filter({ email: normalizedEmail });
            if (existingUsers.length > 0) {
              createdUserId = existingUsers[0].id;
            } else {
              throw userErr;
            }
          } catch {
            debugInfo.errorCode = 'USER_CREATE_FAILED';
            debugInfo.errorMessageRaw = userErr.message || userErr.toString();
            throw new Error(`שגיאה ביצירת משתמש: ${userErr.message || 'שגיאה לא מזוהה'}`);
          }
        }
        
        // Step 3: Create trainee record
        debugInfo.step = 'CREATE_TRAINEE';
        debugInfo.errorSource = 'DB';
        
        let trainee;
        try {
          const inviteToken = generateSecureToken();
          
          trainee = await base44.entities.Trainee.create({
            user_id: createdUserId,
            user_email: normalizedEmail,
            phone: normalizedPhone,
            full_name: data.full_name,
            gender: data.gender || null,
            height_cm: data.height_cm || null,
            coach_email: user?.email,
            status: 'active',
            invite_token: inviteToken,
          });
          
        } catch (traineeErr) {
          debugInfo.errorCode = 'TRAINEE_CREATE_FAILED';
          debugInfo.errorMessageRaw = traineeErr.message || traineeErr.toString();
          
          // Rollback: Delete the user we just created
          if (createdUserId) {
            try {
              await base44.entities.User.delete(createdUserId);
              console.log('Rolled back user creation');
            } catch (rollbackErr) {
              console.error('Failed to rollback:', rollbackErr);
            }
          }
          
          throw new Error(`שגיאה ביצירת רשומת מתאמן: ${traineeErr.message || 'שגיאה לא מזוהה'}`);
        }

        // Step 4: Create personal access link for non-Gmail users
        debugInfo.step = 'CREATE_ACCESS_LINK';
        
        const appUrl = window.location.origin;
        const accessToken = trainee?.invite_token;
        const loginUrl = accessToken ? `${appUrl}/AccessLink?token=${accessToken}` : `${appUrl}/AccessLink`;
        let personalAccessLink = null;
        const isGmail = normalizedEmail.endsWith('@gmail.com');
        
        if (!isGmail) {
          try {
            const token = generateSecureToken();
            const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
              .then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));
            
            const expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + 30); // Valid for 30 days
            
            await base44.entities.PersonalAccessLink.create({
              trainee_user_id: createdUserId,
              trainee_email: normalizedEmail,
              token_hash: tokenHash,
              expires_at: expiresAt.toISOString(),
              created_by_coach_email: user?.email
            });
            
            personalAccessLink = `${appUrl}/AccessLink?token=${token}`;
            
          } catch (linkErr) {
            console.error('Failed to create personal access link:', linkErr);
          }
        }

        // Step 5: Send invitation email
        debugInfo.step = 'SEND_INVITATION';
        let emailSent = false;
        let emailError = null;
        
        try {
          let emailBody;
          
          if (personalAccessLink) {
            // Non-Gmail users - send personal access link
            emailBody = `היי ${data.full_name.split(' ')[0]},

ברוך הבא ל-FIT COACH PRO! 🎉

${user?.full_name || 'המאמן שלך'} הזמין אותך להצטרף למערכת.

להתחברות, לחץ/י על הקישור הבא:
${personalAccessLink}

ההתחברות תתבצע אוטומטית - לא צריך סיסמה 😊
הקישור בתוקף ל-30 יום.

---
FIT COACH PRO`;
          } else if (isGmail) {
            // Gmail users — send via server-side SMTP with short timeout
            // (base44.users.inviteUser is not available in standalone mode)
            emailBody = `היי ${data.full_name.split(' ')[0]},

ברוך הבא ל-FIT COACH PRO! 🎉

${user?.full_name || 'המאמן שלך'} הזמין אותך להצטרף למערכת.

קיבלת מייל נפרד עם קישור להתחברות דרך Google.

אם לא מצאת את המייל:
1. בדוק בתיקיית "דואר זבל" / "Spam"
2. חפש מייל מאת "FIT COACH PRO"
3. או פנה למאמן שלך לעזרה

התראה אותך בקרוב! 💪

---
FIT COACH PRO`;
          } else {
            // Other email providers - instructions to login manually
            emailBody = `היי ${data.full_name.split(' ')[0]},

ברוך הבא ל-FIT COACH PRO! 🎉

${user?.full_name || 'המאמן שלך'} הזמין אותך להצטרף למערכת.

להתחברות:
1. לחץ/י כאן: ${loginUrl}
2. בחר/י "המשך עם Google"
3. התחבר/י עם: ${normalizedEmail}

זהו! פשוט וקל 😊

---
FIT COACH PRO`;
          }

          if (!emailSent) {
            // Send invitation via server-side SMTP (5s timeout)
            const inviteRes = await Promise.race([
              base44.functions.invoke('sendInviteEmail', {
                to_email: normalizedEmail,
                full_name: data.full_name,
                login_url: personalAccessLink || loginUrl,
              }),
              new Promise((_, rej) => setTimeout(() => rej(new Error('sendInviteEmail timeout')), 5000))
            ]);
            if (inviteRes?.sent) emailSent = true;
          }
          
        } catch (emailErr) {
          debugInfo.errorCode = 'EMAIL_FAILED';
          debugInfo.errorMessageRaw = emailErr.message || emailErr.toString();
          emailError = emailErr.message || 'שגיאה לא ידועה';
          console.error('Failed to send email:', emailErr);
        }

        return { trainee, loginUrl, emailSent, emailError, personalAccessLink };
        
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
      setLoginUrl(result.loginUrl);
      setMagicLinkSent(result.emailSent);
      setPersonalAccessLink(result.personalAccessLink);
      setSuccess(true);
      
      // Only log error if email failed AND no personal link was created
      if (!result.emailSent && !result.personalAccessLink && result.emailError) {
        console.error('Email send failed:', result.emailError);
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
    // Auto-copy personal access link if available (non-Gmail)
    const linkToCopy = personalAccessLink || loginUrl;
    if (linkToCopy) {
      navigator.clipboard.writeText(linkToCopy).catch(() => {});
    }

    const isGmail = formData.user_email.toLowerCase().endsWith('@gmail.com');
    
    const copyMessage = personalAccessLink ? 
      `היי ${formData.full_name.split(' ')[0]} 👋

ברוך הבא ל-FIT COACH PRO! 🎉

להתחברות, לחץ/י על הקישור הזה:
${personalAccessLink}

הקישור יפתח את המערכת ישירות - לא צריך סיסמה או Google 😊

הקישור בתוקף ל-30 יום.
אם יש בעיה - דבר/י איתי.` :
      `היי ${formData.full_name.split(' ')[0]} 👋

ברוך הבא ל-FIT COACH PRO! 🎉

${magicLinkSent ? `שלחתי לך מייל עם קישור להתחברות.` : `להתחברות למערכת:`}

${loginUrl}

הוראות:
1. לחץ/י על הקישור
2. בחר/י "המשך עם Google"
3. התחבר/י עם: ${formData.user_email}

זהו! פשוט וקל 😊

אם יש בעיה - דבר/י איתי.`;

    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
        <Card className="p-8 text-center max-w-md mx-4">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">המתאמן נוסף בהצלחה!</h2>
          
          {personalAccessLink ? (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-purple-800 mb-2 font-medium">
                🔐 קישור אישי נוצר (אין Gmail)
              </p>
              <p className="text-xs text-purple-700 mb-2">
                שלח את הקישור הזה למתאמן ב-WhatsApp:
              </p>
              <div className="bg-white p-2 rounded text-xs break-all border border-purple-200 mb-2">
                {personalAccessLink}
              </div>
              <p className="text-xs text-purple-600">
                ✓ הקישור הועתק אוטומטית
                <br />
                ✓ התחברות ישירה בלי סיסמה
                <br />
                ✓ בתוקף ל-30 יום
              </p>
            </div>
          ) : magicLinkSent ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-800 mb-2">
                ✅ נשלח מייל עם הזמנה ל:
              </p>
              <p className="font-mono text-sm text-blue-900">{formData.user_email}</p>
              <p className="text-xs text-blue-700 mt-2">
                המתאמן צריך ללחוץ על הקישור במייל ולהתחבר עם Google.
              </p>
            </div>
          ) : (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-red-800 mb-2 font-medium">
                ❌ שליחת ההזמנה במייל נכשלה
              </p>
              <p className="text-xs text-red-700 mb-2">
                שלח את הקישור הבא למתאמן ב-WhatsApp:
              </p>
              <div className="bg-white p-2 rounded text-xs break-all border border-red-200">
                {loginUrl}
              </div>
              <p className="text-xs text-red-600 mt-2">
                💡 הקישור הועתק אוטומטית - הדבק אותו ב-WhatsApp
              </p>
            </div>
          )}

          {(personalAccessLink || loginUrl) && (
            <div className="bg-slate-50 border rounded-lg p-3 mb-4">
              <p className="text-xs text-slate-600 mb-2">
                {personalAccessLink ? 'קישור אישי:' : 'קישור להתחברות:'}
              </p>
              <p className="text-xs font-mono text-slate-700 break-all bg-white p-2 rounded border">
                {personalAccessLink || loginUrl}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-full mt-2"
                onClick={() => {
                  navigator.clipboard.writeText(personalAccessLink || loginUrl);
                }}
              >
                העתק קישור
              </Button>
            </div>
          )}

          <Button
            className="w-full mb-2"
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(copyMessage);
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