import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

/**
 * Auto-links trainee to auth user on Google login
 * - Normalizes email (lowercase, trim)
 * - Links by user_id first, then by email
 * - Creates trainee if not found (pilot mode)
 * - Handles duplicates
 */
export default function AutoLinkUserOnLogin() {
  const queryClient = useQueryClient();
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allTrainees, isLoading: loadingTrainees } = useQuery({
    queryKey: ['allTraineesForLink'],
    queryFn: async () => {
      // Get all trainees to check for conflicts
      return await base44.entities.Trainee.list();
    },
    enabled: !!user?.email,
  });

  const linkMutation = useMutation({
    mutationFn: async ({ traineeId, userId, normalizedEmail }) => {
      // CRITICAL: Real UPDATE with verification
      await base44.entities.Trainee.update(traineeId, {
        user_id: userId,
        user_email: normalizedEmail,
      });

      // Verify it saved
      await new Promise(resolve => setTimeout(resolve, 300));
      const verified = await base44.entities.Trainee.get(traineeId);
      
      if (verified.user_id !== userId) {
        throw new Error('user_id was not saved correctly');
      }
      
      return verified;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesForLink'] });
      setLinking(false);
      toast.success('חשבון מקושר בהצלחה');
    },
    onError: (error) => {
      console.error('[AutoLink] ❌ Failed to link:', error);
      setError('שגיאה בקישור חשבון. פנה למאמן.');
      setLinking(false);
    },
  });

  const createTraineeMutation = useMutation({
    mutationFn: async ({ userId, email, fullName }) => {
      // Create new trainee (pilot mode)
      return await base44.entities.Trainee.create({
        user_id: userId,
        user_email: email,
        full_name: fullName || 'מתאמן חדש',
        coach_email: 'default@coach.com', // Will need to be assigned by admin
        status: 'pending_coach_approval',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesForLink'] });
      setLinking(false);
      toast.info('נוצר כרטיס מתאמן חדש. ממתין לאישור מאמן.');
    },
    onError: (error) => {
      console.error('[AutoLink] ❌ Failed to create trainee:', error);
      setError('לא ניתן ליצור כרטיס מתאמן. פנה למאמן.');
      setLinking(false);
    },
  });

  useEffect(() => {
    if (!user || !allTrainees || linking || loadingTrainees) return;

    const normalizedEmail = user.email.toLowerCase().trim();
    const userId = user.id || user.user_id;


    // Step 1: Try to find trainee by user_id
    const traineeByUserId = allTrainees.find(t => t.user_id === userId);
    if (traineeByUserId) {
      console.log('[AutoLink] ✅ Trainee already linked by user_id');
      // Ensure email is normalized
      if (traineeByUserId.user_email !== normalizedEmail) {
        console.log('[AutoLink] 🔄 Normalizing email...');
        base44.entities.Trainee.update(traineeByUserId.id, { user_email: normalizedEmail })
          .catch(err => console.error('[AutoLink] Failed to normalize email:', err));
      }
      return;
    }

    // Step 2: Try to find trainee by email (case-insensitive, trimmed)
    const traineesByEmail = allTrainees.filter(t => 
      t.user_email?.toLowerCase().trim() === normalizedEmail
    );

    console.log('[AutoLink] Found', traineesByEmail.length, 'trainees by email');

    if (traineesByEmail.length === 0) {
      // No trainee found - try also by full_name as last resort
      const traineesByName = allTrainees.filter(t => 
        t.full_name?.toLowerCase().trim() === user.full_name?.toLowerCase().trim()
      );
      
      if (traineesByName.length === 1 && !traineesByName[0].user_id) {
        console.log('[AutoLink] 🔗 Found trainee by name, linking...');
        setLinking(true);
        linkMutation.mutate({
          traineeId: traineesByName[0].id,
          userId: userId,
          normalizedEmail,
        });
        return;
      }
      
      console.log('[AutoLink] ⚠️ No trainee record found');
      return;
    }

    if (traineesByEmail.length > 1) {
      // Duplicate emails - cannot auto-link
      console.error('[AutoLink] ⚠️ Duplicate emails found:', traineesByEmail.length);
      setError('קיימת כפילות אימייל במערכת. פנה למאמן לתיקון.');
      base44.entities.CoachAlert.create({
        coach_email: traineesByEmail[0].coach_email,
        trainee_email: normalizedEmail,
        trainee_name: user.full_name || normalizedEmail,
        alert_type: 'declining_metrics',
        severity: 'high',
        title: '⚠️ כפילות אימייל',
        summary: `נמצאו ${traineesByEmail.length} מתאמנים עם אימייל ${normalizedEmail}. נדרש תיקון ידני.`,
        data_snapshot: {
          trainees: traineesByEmail.map(t => ({ id: t.id, name: t.full_name })),
        },
      }).catch(err => console.error('[AutoLink] Failed to create alert:', err));
      return;
    }

    // Single trainee found by email
    const trainee = traineesByEmail[0];
    
    // AUTO-FIX: If user_id is missing, update it now
    if (!trainee.user_id) {

      setLinking(true);
      linkMutation.mutate({
        traineeId: trainee.id,
        userId: userId,
        normalizedEmail,
      });
    } else {
      console.log('[AutoLink] ✅ Trainee already has user_id');
    }

  }, [user, allTrainees, linking, loadingTrainees]);

  // Show error message if needed
  if (error) {
    return (
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 max-w-md" dir="rtl">
        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-4 shadow-lg">
          <p className="text-red-800 font-medium mb-2">⚠️ בעיית קישור חשבון</p>
          <p className="text-red-700 text-sm mb-3">{error}</p>
          <button
            onClick={() => base44.auth.logout()}
            className="w-full bg-red-600 text-white py-2 px-4 rounded hover:bg-red-700"
          >
            התנתק והתחבר מחדש
          </button>
        </div>
      </div>
    );
  }

  if (linking) {
    return (
      <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50" dir="rtl">
        <div className="bg-white border-2 border-blue-500 rounded-lg p-4 shadow-lg">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-3 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            <p className="text-blue-800 font-medium">מקשר חשבון...</p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}