import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { AlertCircle, Lock } from 'lucide-react';
import { hashPassword } from '@/utils/passwordHash';

export default function ChangePasswordDialog({ trainee, open, onClose }) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const queryClient = useQueryClient();

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      if (newPassword !== confirmPassword) {
        throw new Error('הסיסמאות לא תואמות');
      }
      
      if (newPassword.length < 8) {
        throw new Error('הסיסמה חייבת להיות לפחות 8 תווים');
      }

      // Find user
      const users = await base44.entities.User.filter({ email: trainee.user_email });
      if (users.length === 0) {
        throw new Error('משתמש לא נמצא');
      }
      const user = users[0];

      // Hash new password (see src/utils/passwordHash.js for migration plan)
      const passwordHash = await hashPassword(newPassword);

      // Write to Credentials — single source of truth for passwords.
      // PhoneCredentials is deprecated: no active login flow reads it.
      const existingCreds = await base44.entities.Credentials.filter({ user_id: user.id });
      if (existingCreds.length > 0) {
        await base44.entities.Credentials.update(existingCreds[0].id, {
          password_hash: passwordHash,
          last_password_change_at: new Date().toISOString(),
        });
      } else {
        await base44.entities.Credentials.create({
          user_id: user.id,
          email: trainee.user_email.toLowerCase(),
          password_hash: passwordHash,
          last_password_change_at: new Date().toISOString(),
        });
      }

      return { password: newPassword };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['traineeDetails'] });
      toast.success('הסיסמה עודכנה בהצלחה');
      
      // Copy to clipboard
      const message = `היי ${trainee.full_name.split(' ')[0]},\nהסיסמה החדשה שלך היא: ${data.password}\nטלפון: ${trainee.phone}`;
      navigator.clipboard.writeText(message);
      toast.success('הסיסמה הועתקה ללוח');
      
      setNewPassword('');
      setConfirmPassword('');
      onClose();
    },
    onError: (error) => {
      toast.error(error.message || 'שגיאה בעדכון הסיסמה');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    changePasswordMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5" />
            שינוי סיסמה למתאמן
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-xs text-amber-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                הסיסמה תועתק אוטומטית ללוח. העבר אותה למתאמן באופן מאובטח (WhatsApp/SMS).
              </span>
            </p>
          </div>

          <div>
            <Label>מתאמן</Label>
            <Input value={trainee.full_name} disabled className="bg-slate-100" />
          </div>

          <div>
            <Label>סיסמה חדשה</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="לפחות 8 תווים"
              required
              minLength={8}
            />
          </div>

          <div>
            <Label>אימות סיסמה</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="הזן שוב את הסיסמה"
              required
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500 mt-1">הסיסמאות לא תואמות</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={changePasswordMutation.isPending || newPassword !== confirmPassword}
              style={{ backgroundColor: '#79DBD6' }}
            >
              {changePasswordMutation.isPending ? 'מעדכן...' : 'שמור והעתק'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}