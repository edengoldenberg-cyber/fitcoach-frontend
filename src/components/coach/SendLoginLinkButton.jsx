import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Link as LinkIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import LoginLinkModal from './LoginLinkModal';
import { generateSecureToken } from '@/utils/tokenUtils';

export default function SendLoginLinkButton({ trainee, variant = "default", size = "default", showStatus = false }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [loginLink, setLoginLink] = useState('');
  const [linkError, setLinkError] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // AccessLink system: no LoginLink queries needed

  const createLoginLinkMutation = useMutation({
    mutationFn: async () => {
      // Get or generate invite_token on Trainee entity (same token AccessLink.jsx reads)
      const trainees = await base44.entities.Trainee.filter({ user_email: trainee.user_email });
      const traineeRecord = trainees[0];
      if (!traineeRecord) throw new Error('מתאמן לא נמצא');

      let token = traineeRecord.invite_token;
      if (!token || token.length < 5) {
        token = generateSecureToken();
        await base44.entities.Trainee.update(traineeRecord.id, {
          invite_token: token,
          invite_sent_at: new Date().toISOString(),
        });
      }

      // Build AccessLink — use current origin so it works in any deployment
      const appUrl = window.location.origin;
      const loginUrl = `${appUrl}/AccessLink?token=${token}`;

      if (!loginUrl.includes('?token=')) throw new Error('URL חסר token — לא ניתן להמשיך');

      console.log('[SendLoginLinkButton] debug', {
        trainee_email: trainee.user_email,
        invite_token_exists: !!token,
        token_masked: token.substring(0, 12) + '***',
        copied_url: loginUrl,
      });

      return loginUrl;
    },
    onSuccess: (url) => {
      setLoginLink(url);
      setLinkError(null);
      setModalOpen(true);
    },
    onError: (error) => {
      console.error('Create login link error:', error);
      // Provide helpful context
      let helpText = error.message || 'שגיאה באישור';
      if (error.message?.includes('משתמש לא נמצא')) {
        helpText = 'המתאמן עדיין לא הוזמן. ניתן לשלוח לו הודעת WhatsApp ישירה או לבקש ממנו להירשם.';
      }
      setLinkError({ ...error, helpText });
      setModalOpen(true);
    }
  });

  const handleCreate = () => {
    if (!trainee.user_email) {
      toast.error('אין אימייל למתאמן');
      return;
    }
    setLinkError(null);
    setLoginLink('');
    createLoginLinkMutation.mutate();
  };

  const handleRetry = () => {
    createLoginLinkMutation.mutate();
  };

  return (
    <>
      <div className="space-y-2">
        <Button
          onClick={handleCreate}
          disabled={createLoginLinkMutation.isPending}
          variant={variant}
          size={size}
          className={variant === "default" ? "bg-blue-500 hover:bg-blue-600" : ""}
        >
          {createLoginLinkMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 ml-2 animate-spin" />
              יוצר קישור...
            </>
          ) : (
            <>
              <LinkIcon className="w-4 h-4 ml-2" />
              צור קישור התחברות
            </>
          )}
        </Button>
        

      </div>

      <LoginLinkModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        loginLink={loginLink}
        trainee={trainee}
        error={linkError}
        onRetry={handleRetry}
      />
    </>
  );
}