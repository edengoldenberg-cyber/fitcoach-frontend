import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Trash2, RefreshCw, Ghost } from 'lucide-react';
import { toast } from 'sonner';

export default function CleanupGhostUsers() {
  const [scanning, setScanning] = useState(false);
  const [ghostUsers, setGhostUsers] = useState([]);
  const queryClient = useQueryClient();

  const scanForGhosts = async () => {
    setScanning(true);
    try {
      // Get all users
      const allUsers = await base44.entities.User.list();
      
      // Get all trainees
      const allTrainees = await base44.entities.Trainee.list();
      
      const ghosts = [];
      
      for (const user of allUsers) {
        // Check if user has a trainee record
        const hasTrainee = allTrainees.some(t => t.user_email === user.email);
        
        // Check if created recently (less than 1 hour ago) but incomplete
        const createdAt = new Date(user.created_date);
        const hoursSinceCreation = (new Date() - createdAt) / (1000 * 60 * 60);
        
        // Ghost criteria:
        // 1. No trainee record AND created more than 1 hour ago
        // 2. OR email contains "deleted_" or "@deleted"
        // 3. OR role is missing/invalid
        const isGhost = (
          (!hasTrainee && hoursSinceCreation > 1) ||
          user.email?.includes('deleted_') ||
          user.email?.includes('@deleted') ||
          user.email?.includes('@purged') ||
          (!user.role || !['user', 'admin'].includes(user.role))
        );
        
        if (isGhost) {
          ghosts.push({
            ...user,
            reason: 
              user.email?.includes('deleted_') || user.email?.includes('@deleted') ? 'אימייל מחוק' :
              !user.role ? 'חסר role' :
              !hasTrainee ? 'אין רשומת מתאמן' :
              'אחר'
          });
        }
      }
      
      setGhostUsers(ghosts);
      toast.success(`נמצאו ${ghosts.length} משתמשים תקועים`);
    } catch (e) {
      toast.error('שגיאה בסריקה: ' + e.message);
    } finally {
      setScanning(false);
    }
  };

  const cleanupMutation = useMutation({
    mutationFn: async (userId) => {
      await base44.entities.User.delete(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success('המשתמש נמחק');
      scanForGhosts(); // Rescan
    },
    onError: (e) => {
      toast.error('שגיאה במחיקה: ' + e.message);
    },
  });

  const cleanupAllMutation = useMutation({
    mutationFn: async () => {
      for (const ghost of ghostUsers) {
        try {
          await base44.entities.User.delete(ghost.id);
        } catch (e) {
          console.error('Failed to delete:', ghost.email, e);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success(`נמחקו ${ghostUsers.length} משתמשים`);
      setGhostUsers([]);
    },
  });

  return (
    <Card className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Ghost className="w-6 h-6 text-slate-500" />
          <div>
            <h2 className="text-lg font-bold text-slate-800">ניקוי משתמשים תקועים</h2>
            <p className="text-sm text-slate-600">מוחק משתמשים ללא רשומת מתאמן תקינה</p>
          </div>
        </div>
        <Button
          onClick={scanForGhosts}
          disabled={scanning}
          variant="outline"
        >
          <RefreshCw className={`w-4 h-4 ml-2 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'סורק...' : 'סרוק מחדש'}
        </Button>
      </div>

      {ghostUsers.length === 0 ? (
        <div className="text-center py-8 text-slate-500">
          <Ghost className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p>לא נמצאו משתמשים תקועים</p>
          {!scanning && (
            <Button onClick={scanForGhosts} variant="outline" size="sm" className="mt-3">
              התחל סריקה
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex items-center justify-between">
            <Badge variant="outline" className="text-orange-700 bg-orange-50">
              נמצאו {ghostUsers.length} משתמשים
            </Badge>
            <Button
              onClick={() => {
                if (confirm(`למחוק ${ghostUsers.length} משתמשים?`)) {
                  cleanupAllMutation.mutate();
                }
              }}
              disabled={cleanupAllMutation.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              size="sm"
            >
              <Trash2 className="w-4 h-4 ml-2" />
              מחק הכל
            </Button>
          </div>

          <div className="space-y-2">
            {ghostUsers.map(ghost => (
              <div key={ghost.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-slate-800">{ghost.email}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="outline" className="text-xs">{ghost.reason}</Badge>
                    <span className="text-xs text-slate-500">
                      נוצר: {new Date(ghost.created_date).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (confirm(`למחוק ${ghost.email}?`)) {
                      cleanupMutation.mutate(ghost.id);
                    }
                  }}
                  className="text-red-600"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}