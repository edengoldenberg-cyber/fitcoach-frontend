import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Mail, LogOut } from 'lucide-react';
import { createPageUrl } from '@/utils';

export default function PendingApproval() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['traineeProfile', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0];
    },
    enabled: !!user?.email,
  });

  const handleLogout = async () => {
    await base44.auth.logout(createPageUrl('Login'));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="w-full max-w-md p-8 text-center">
        {/* Icon */}
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock className="w-10 h-10 text-amber-600" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-slate-800 mb-3">
          ממתין לאישור מאמן
        </h1>

        {/* Description */}
        <p className="text-slate-600 mb-6">
          החשבון שלך נוצר בהצלחה והוא ממתין לאישור המאמן שלך.
        </p>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 text-right">
          <div className="flex items-start gap-3">
            <Mail className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-blue-800 font-medium mb-1">
                מה עכשיו?
              </p>
              <p className="text-xs text-blue-700">
                • יצרת קשר עם המאמן שלך ובקש/י ממנו לאשר את החשבון<br />
                • לאחר האישור, תוכל/י להתחבר ולהתחיל להשתמש במערכת<br />
                • תקבל/י הודעה כשהחשבון יאושר
              </p>
            </div>
          </div>
        </div>

        {/* User Info */}
        {user && (
          <div className="bg-slate-50 rounded-lg p-3 mb-6 text-right">
            <p className="text-xs text-slate-500 mb-1">מחובר/ת כ:</p>
            <p className="text-sm font-medium text-slate-800">{user.email}</p>
            {trainee?.full_name && (
              <p className="text-sm text-slate-600">{trainee.full_name}</p>
            )}
          </div>
        )}

        {/* Logout Button */}
        <Button
          onClick={handleLogout}
          variant="outline"
          className="w-full"
        >
          <LogOut className="w-4 h-4 ml-2" />
          התנתק
        </Button>

        {/* Support Text */}
        <p className="text-xs text-slate-500 mt-6">
          יש בעיה? צור/י קשר עם המאמן שלך
        </p>
      </Card>
    </div>
  );
}