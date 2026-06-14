import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Key, Loader2, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { differenceInMinutes } from 'date-fns';
import AccessCodeModal from './AccessCodeModal';

export default function CreateAccessCodeButton({ trainee, variant = "default", size = "default", showStatus = false }) {
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [accessCode, setAccessCode] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [codeError, setCodeError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: codes = [] } = useQuery({
    queryKey: ['accessCodes', trainee.user_email],
    queryFn: async () => {
      const result = await base44.entities.AccessCode.filter({
        trainee_email: trainee.user_email
      });
      return result.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!trainee.user_email
  });

  const lastCode = codes[0];
  const minutesSinceLastCode = lastCode?.created_date 
    ? differenceInMinutes(new Date(), new Date(lastCode.created_date))
    : null;

  const createAccessCodeMutation = useMutation({
    mutationFn: async () => {
      // Find user
      const users = await base44.entities.User.filter({ email: trainee.user_email });
      if (users.length === 0) {
        throw new Error('משתמש לא נמצא');
      }
      const userRecord = users[0];

      // Generate 6-digit code using cryptographic randomness
      const array = new Uint32Array(1);
      crypto.getRandomValues(array);
      const code = (100000 + (array[0] % 900000)).toString();

      // Hash code for storage
      const encoder = new TextEncoder();
      const data = encoder.encode(code);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const codeHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Expires in 24 hours
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 24);

      await base44.entities.AccessCode.create({
        trainee_user_id: userRecord.id,
        trainee_email: trainee.user_email,
        code_hash: codeHash,
        expires_at: expiresAt.toISOString(),
        created_by_coach_email: user.email,
        attempts_count: 0
      });

      return { code, expiresAt: expiresAt.toISOString() };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['accessCodes'] });
      setAccessCode(result.code);
      setExpiresAt(result.expiresAt);
      setCodeError(null);
      setModalOpen(true);
    },
    onError: (error) => {
      console.error('Create access code error:', error);
      setCodeError(error);
      setModalOpen(true);
    }
  });

  const handleCreate = () => {
    if (!trainee.user_email) {
      toast.error('אין אימייל למתאמן');
      return;
    }
    setCodeError(null);
    setAccessCode('');
    setExpiresAt('');
    createAccessCodeMutation.mutate();
  };

  const handleRetry = () => {
    createAccessCodeMutation.mutate();
  };

  return (
    <>
      <div className="space-y-2">
        <Button
          onClick={handleCreate}
          disabled={createAccessCodeMutation.isPending}
          variant={variant}
          size={size}
          className={variant === "default" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
        >
          {createAccessCodeMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              יוצר קוד...
            </>
          ) : (
            <>
              <Key className="w-4 h-4 ml-2" />
              צור קוד גישה
            </>
          )}
        </Button>
        
        {showStatus && lastCode?.created_date && (
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            נוצר לאחרונה: לפני {minutesSinceLastCode} דקות
          </p>
        )}
      </div>

      <AccessCodeModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        accessCode={accessCode}
        expiresAt={expiresAt}
        trainee={trainee}
        error={codeError}
        onRetry={handleRetry}
      />
    </>
  );
}