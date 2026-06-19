import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { UserPlus } from 'lucide-react';

export default function AddTraineeQuickDialog({ open, onOpenChange, coachEmail }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const createMutation = useMutation({
    mutationFn: async () => {
      const timestamp = Date.now();
      const tempEmail = phone
        ? `temp_${phone.replace(/\D/g, '')}_${timestamp}@temp.local`
        : `temp_${name.replace(/\s/g, '_').toLowerCase()}_${timestamp}@temp.local`;

      // Trainee.user_id is required (FK). Create the User record first.
      let createdUser;
      try {
        createdUser = await base44.entities.User.create({
          email: tempEmail,
          full_name: name,
          role: 'trainee',
        });
      } catch {
        const existing = await base44.entities.User.filter({ email: tempEmail });
        if (!existing.length) throw new Error('Failed to create user account');
        createdUser = existing[0];
      }

      const trainee = await base44.entities.Trainee.create({
        user_id: createdUser.id,
        user_email: tempEmail,
        coach_email: coachEmail,
        full_name: name,
        phone: phone || '',
        status: 'active',
        visible_modules: {
          nutrition: false,
          water: false,
          workouts: true,
          metrics: false,
        },
      });

      return trainee;
    },
    onSuccess: (trainee) => {
      toast.success('מתאמן נוסף בהצלחה ✅');
      queryClient.invalidateQueries({ queryKey: ['coachTrainees'] });
      
      // Call onSuccess callback if provided (to auto-select trainee)
      if (window.onTraineeCreated) {
        window.onTraineeCreated(trainee);
      }
      
      setName('');
      setPhone('');
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('שגיאה: ' + error.message);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            הוסף מתאמן ידנית
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">שם מתאמן *</label>
            <Input
              placeholder="שם מלא"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">טלפון (אופציונלי)</label>
            <Input
              placeholder="05X-XXXXXXX"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          <Button
            className="w-full bg-teal-600 hover:bg-teal-700"
            onClick={() => createMutation.mutate()}
            disabled={!name || createMutation.isPending}
          >
            {createMutation.isPending ? 'שומר...' : 'שמור'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}