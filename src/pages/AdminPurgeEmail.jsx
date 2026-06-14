import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AlertCircle, CheckCircle2, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function AdminPurgeEmail() {
  const { data: user, isLoading: loadingUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const [email, setEmail] = useState('');
  const [log, setLog] = useState([]);
  const [isComplete, setIsComplete] = useState(false);

  // In-component guard (defense-in-depth; primary gate is AdminRoute in App.jsx)
  if (loadingUser) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!user || user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  const addLog = (message, type = 'info') => {
    setLog(prev => [...prev, { message, type, timestamp: new Date().toISOString() }]);
  };

  const purgeEmailMutation = useMutation({
    mutationFn: async (emailToPurge) => {
      // Double-check role inside the mutation — prevents any client-side bypass
      const currentUser = await base44.auth.me();
      if (!currentUser || currentUser.role !== 'admin') {
        throw new Error('גישה נדחתה: פעולה זו מותרת למנהלים בלבד');
      }
      setLog([]);
      setIsComplete(false);
      addLog(`🚀 מתחיל מחיקה לצמיתות של: ${emailToPurge}`, 'info');

      const timestamp = Date.now();
      const randomSuffix = Math.random().toString(36).substring(7);
      const aliasEmail = `deleted_${timestamp}_${randomSuffix}@purged.fitcoach.local`;

      // Step 1: Find and delete all Trainee records
      try {
        const trainees = await base44.entities.Trainee.filter({ user_email: emailToPurge });
        addLog(`✓ נמצאו ${trainees.length} רשומות Trainee`, 'success');
        
        for (const trainee of trainees) {
          await base44.entities.Trainee.delete(trainee.id);
          addLog(`  → מחק Trainee: ${trainee.id}`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת Trainee: ${e.message}`, 'warning');
      }

      // Step 2: Find and delete/alias User records
      try {
        const users = await base44.entities.User.filter({ email: emailToPurge });
        addLog(`✓ נמצאו ${users.length} רשומות User`, 'success');
        
        for (const user of users) {
          try {
            // Try to update to alias email
            await base44.entities.User.update(user.id, {
              email: aliasEmail,
              full_name: `[PURGED_${timestamp}] ${user.full_name || ''}`
            });
            addLog(`  → עדכן User ${user.id} ל-alias: ${aliasEmail}`, 'success');
          } catch (updateErr) {
            addLog(`  ⚠ לא ניתן לעדכן User ${user.id}: ${updateErr.message}`, 'warning');
            // Try to delete if update fails
            try {
              await base44.entities.User.delete(user.id);
              addLog(`  → מחק User: ${user.id}`, 'success');
            } catch (delErr) {
              addLog(`  ✗ נכשל במחיקת User ${user.id}: ${delErr.message}`, 'error');
            }
          }
        }
      } catch (e) {
        addLog(`⚠ שגיאה בטיפול ב-User: ${e.message}`, 'warning');
      }

      // Step 3: Clean up related data
      try {
        // MealEntry
        const meals = await base44.entities.MealEntry.filter({ trainee_email: emailToPurge });
        if (meals.length > 0) {
          addLog(`✓ נמצאו ${meals.length} רשומות MealEntry`, 'info');
          for (const meal of meals) {
            await base44.entities.MealEntry.delete(meal.id);
          }
          addLog(`  → מחק ${meals.length} MealEntry`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת MealEntry: ${e.message}`, 'warning');
      }

      try {
        // WaterEntry
        const water = await base44.entities.WaterEntry.filter({ trainee_email: emailToPurge });
        if (water.length > 0) {
          addLog(`✓ נמצאו ${water.length} רשומות WaterEntry`, 'info');
          for (const w of water) {
            await base44.entities.WaterEntry.delete(w.id);
          }
          addLog(`  → מחק ${water.length} WaterEntry`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת WaterEntry: ${e.message}`, 'warning');
      }

      try {
        // WorkoutSession
        const workouts = await base44.entities.WorkoutSession.filter({ trainee_email: emailToPurge });
        if (workouts.length > 0) {
          addLog(`✓ נמצאו ${workouts.length} רשומות WorkoutSession`, 'info');
          for (const w of workouts) {
            await base44.entities.WorkoutSession.delete(w.id);
          }
          addLog(`  → מחק ${workouts.length} WorkoutSession`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת WorkoutSession: ${e.message}`, 'warning');
      }

      try {
        // MetricsEntry
        const metrics = await base44.entities.MetricsEntry.filter({ trainee_email: emailToPurge });
        if (metrics.length > 0) {
          addLog(`✓ נמצאו ${metrics.length} רשומות MetricsEntry`, 'info');
          for (const m of metrics) {
            await base44.entities.MetricsEntry.delete(m.id);
          }
          addLog(`  → מחק ${metrics.length} MetricsEntry`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת MetricsEntry: ${e.message}`, 'warning');
      }

      try {
        // NotificationReceipt
        const receipts = await base44.entities.NotificationReceipt.filter({ trainee_email: emailToPurge });
        if (receipts.length > 0) {
          addLog(`✓ נמצאו ${receipts.length} רשומות NotificationReceipt`, 'info');
          for (const r of receipts) {
            await base44.entities.NotificationReceipt.delete(r.id);
          }
          addLog(`  → מחק ${receipts.length} NotificationReceipt`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת NotificationReceipt: ${e.message}`, 'warning');
      }

      try {
        // AIConsultation
        const consultations = await base44.entities.AIConsultation.filter({ trainee_email: emailToPurge });
        if (consultations.length > 0) {
          addLog(`✓ נמצאו ${consultations.length} רשומות AIConsultation`, 'info');
          for (const c of consultations) {
            await base44.entities.AIConsultation.delete(c.id);
          }
          addLog(`  → מחק ${consultations.length} AIConsultation`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת AIConsultation: ${e.message}`, 'warning');
      }

      try {
        // Achievement
        const achievements = await base44.entities.Achievement.filter({ trainee_email: emailToPurge });
        if (achievements.length > 0) {
          addLog(`✓ נמצאו ${achievements.length} רשומות Achievement`, 'info');
          for (const a of achievements) {
            await base44.entities.Achievement.delete(a.id);
          }
          addLog(`  → מחק ${achievements.length} Achievement`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת Achievement: ${e.message}`, 'warning');
      }

      try {
        // OnboardingStatus
        const onboarding = await base44.entities.OnboardingStatus.filter({ trainee_email: emailToPurge });
        if (onboarding.length > 0) {
          addLog(`✓ נמצאו ${onboarding.length} רשומות OnboardingStatus`, 'info');
          for (const o of onboarding) {
            await base44.entities.OnboardingStatus.delete(o.id);
          }
          addLog(`  → מחק ${onboarding.length} OnboardingStatus`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת OnboardingStatus: ${e.message}`, 'warning');
      }

      try {
        // Message
        const messages = await base44.entities.Message.filter({ trainee_email: emailToPurge });
        if (messages.length > 0) {
          addLog(`✓ נמצאו ${messages.length} רשומות Message`, 'info');
          for (const m of messages) {
            await base44.entities.Message.delete(m.id);
          }
          addLog(`  → מחק ${messages.length} Message`, 'success');
        }
      } catch (e) {
        addLog(`⚠ שגיאה במחיקת Message: ${e.message}`, 'warning');
      }

      // Step 4: Verify cleanup
      addLog(`🔍 מאמת ניקוי...`, 'info');
      try {
        const remainingTrainees = await base44.entities.Trainee.filter({ user_email: emailToPurge });
        const remainingUsers = await base44.entities.User.filter({ email: emailToPurge });
        
        if (remainingTrainees.length === 0 && remainingUsers.length === 0) {
          addLog(`✅ האימייל ${emailToPurge} נמחק לצמיתות ושוחרר לרישום מחדש!`, 'success');
          setIsComplete(true);
        } else {
          addLog(`⚠ עדיין נמצאו ${remainingTrainees.length} Trainee ו-${remainingUsers.length} User`, 'warning');
          setIsComplete(false);
        }
      } catch (e) {
        addLog(`⚠ שגיאה באימות: ${e.message}`, 'warning');
      }

      addLog(`✅ תהליך המחיקה הושלם`, 'info');
      return true;
    },
    onSuccess: () => {
      toast.success('מחיקה הושלמה בהצלחה!');
    },
    onError: (error) => {
      addLog(`❌ שגיאה כללית: ${error.message}`, 'error');
      toast.error('שגיאה במחיקה');
    },
  });

  const handlePurge = () => {
    if (!email) {
      toast.error('יש להזין אימייל');
      return;
    }
    
    if (!confirm(`האם אתה בטוח שברצונך למחוק לצמיתות את: ${email}?\n\nפעולה זו בלתי הפיכה!`)) {
      return;
    }

    purgeEmailMutation.mutate(email);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
      <div className="max-w-4xl mx-auto">
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">מחיקה לצמיתות (Purge)</h1>
              <p className="text-sm text-slate-600">מחיקה מלאה של אימייל מכל הטבלאות</p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-800 font-medium mb-2">⚠️ אזהרה: פעולה בלתי הפיכה!</p>
            <p className="text-sm text-red-700">
              מחיקה זו תסיר לצמיתות את כל הנתונים הקשורים לאימייל זה מהמערכת.
              האימייל ישוחרר לרישום מחדש.
            </p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                אימייל למחיקה
              </label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@gmail.com"
                className="text-lg"
                disabled={purgeEmailMutation.isPending}
              />
            </div>

            <Button
              onClick={handlePurge}
              disabled={purgeEmailMutation.isPending || !email}
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              size="lg"
            >
              {purgeEmailMutation.isPending ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  מבצע מחיקה...
                </>
              ) : (
                <>
                  <Trash2 className="w-5 h-5 ml-2" />
                  מחק לצמיתות
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Log Display */}
        {log.length > 0 && (
          <Card className="p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4">לוג פעולות</h2>
            <div className="bg-slate-900 rounded-lg p-4 max-h-[500px] overflow-y-auto">
              {log.map((entry, idx) => (
                <div key={idx} className="mb-2 font-mono text-sm">
                  <span
                    className={
                      entry.type === 'success' ? 'text-green-400' :
                      entry.type === 'error' ? 'text-red-400' :
                      entry.type === 'warning' ? 'text-yellow-400' :
                      'text-slate-300'
                    }
                  >
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>

            {isComplete && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-bold text-green-800">
                    ✅ האימייל {email} נמחק לצמיתות ושוחרר לרישום מחדש!
                  </p>
                  <p className="text-sm text-green-700 mt-1">
                    ניתן כעת ליצור משתמש חדש עם אותו אימייל ללא שגיאות.
                  </p>
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}