import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link as LinkIcon, Copy, Trash2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { createPageUrl } from '@/utils';

export default function PersonalAccessLinkManager({ trainee }) {
  const queryClient = useQueryClient();

  const { data: links = [] } = useQuery({
    queryKey: ['personalAccessLinks', trainee.user_email],
    queryFn: async () => {
      const result = await base44.entities.PersonalAccessLink.filter({
        trainee_email: trainee.user_email
      });
      return result.sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    },
    enabled: !!trainee.user_email
  });

  const activeLink = links.find(link => 
    !link.used_at && 
    !link.revoked_at && 
    new Date(link.expires_at) > new Date()
  );

  const generateTokenMutation = useMutation({
    mutationFn: async () => {
      // Find user
      const users = await base44.entities.User.filter({ email: trainee.user_email });
      if (users.length === 0) {
        throw new Error('משתמש לא נמצא');
      }
      const user = users[0];

      // Revoke existing active links
      if (activeLink) {
        await base44.entities.PersonalAccessLink.update(activeLink.id, {
          revoked_at: new Date().toISOString()
        });
      }

      // Generate random token (32 chars)
      const token = Array.from(crypto.getRandomValues(new Uint8Array(24)))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Hash token for storage
      const encoder = new TextEncoder();
      const data = encoder.encode(token);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const tokenHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      // Create link (expires in 7 days)
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7);

      const coach = await base44.auth.me();
      
      const newLink = await base44.entities.PersonalAccessLink.create({
        trainee_user_id: user.id,
        trainee_email: trainee.user_email,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        created_by_coach_email: coach.email
      });

      return { link: newLink, token };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalAccessLinks'] });
      toast.success('קישור חדש נוצר בהצלחה');
    },
    onError: (error) => {
      toast.error(error.message || 'שגיאה ביצירת קישור');
    }
  });

  const revokeLinkMutation = useMutation({
    mutationFn: async (linkId) => {
      await base44.entities.PersonalAccessLink.update(linkId, {
        revoked_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personalAccessLinks'] });
      toast.success('הקישור בוטל');
    },
    onError: () => {
      toast.error('שגיאה בביטול הקישור');
    }
  });

  const handleCopyLink = () => {
    if (!activeLink) {
      toast.error('אין קישור פעיל. צור קישור חדש.');
      return;
    }

    // We need to reconstruct the original token from the hash
    // Since we can't reverse the hash, we'll store it temporarily in state
    // For now, show instructions to generate a new one
    toast.error('יש ליצור קישור חדש כדי להעתיק אותו');
  };

  const handleGenerateAndCopy = async () => {
    try {
      const result = await generateTokenMutation.mutateAsync();
      const appUrl = window.location.origin;
      const accessUrl = `${appUrl}${createPageUrl('AccessLink')}?token=${result.token}`;
      
      const message = `היי ${trainee.full_name.split(' ')[0]} 👋
זה הקישור האישי שלך ל-FIT COACH PRO:

${accessUrl}

בלחיצה תתבקש/י להגדיר סיסמה ואז תוכל/י להתחבר רגיל.

הקישור תקף למשך 7 ימים.`;

      navigator.clipboard.writeText(message);
      toast.success('הקישור נוצר והועתק ללוח!');
    } catch (err) {
      console.error('Generate and copy error:', err);
    }
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <LinkIcon className="w-5 h-5" style={{ color: '#79DBD6' }} />
          קישור כניסה אישי
        </h3>
      </div>

      {activeLink ? (
        <div className="space-y-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-start gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-green-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">קישור פעיל</p>
                <p className="text-xs text-green-700 mt-1">
                  תוקף עד: {format(new Date(activeLink.expires_at), 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleGenerateAndCopy}
              className="flex-1"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Copy className="w-4 h-4 ml-2" />
              צור והעתק קישור חדש
            </Button>
            <Button
              variant="outline"
              onClick={() => revokeLinkMutation.mutate(activeLink.id)}
              disabled={revokeLinkMutation.isPending}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">אין קישור פעיל</p>
                <p className="text-xs text-amber-700 mt-1">
                  צור קישור התחברות חד-פעמי למתאמן זה
                </p>
              </div>
            </div>
          </div>

          <Button
            onClick={handleGenerateAndCopy}
            disabled={generateTokenMutation.isPending}
            className="w-full"
            style={{ backgroundColor: '#79DBD6' }}
          >
            <LinkIcon className="w-4 h-4 ml-2" />
            {generateTokenMutation.isPending ? 'יוצר קישור...' : 'צור קישור התחברות'}
          </Button>
        </div>
      )}

      <div className="mt-4 pt-4 border-t">
        <p className="text-xs text-slate-600">
          💡 הקישור מאפשר למתאמן להיכנס בלי אימות מייל, להגדיר סיסמה ולהתחבר רגיל מאותו רגע.
        </p>
      </div>
    </Card>
  );
}