import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Settings, MessageCircle, ChevronLeft, Shield, Bell, Wrench, FileText, TestTube2, ScrollText, Bug, Globe, Activity, TrendingUp, Users, Zap, Utensils } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';


// v2 - sections added
export default function CoachSettings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: settings } = useQuery({
    queryKey: ['coachSettings', user?.email],
    queryFn: async () => {
      const result = await base44.entities.CoachSettings.filter({ coach_email: user?.email });
      return result[0];
    },
    enabled: !!user?.email,
  });

  const [formData, setFormData] = useState({
    whatsapp_number: '',
    display_name: '',
    message_templates: {
      invite_followup: "היי {name} 👋 שלחתי לך מייל הזמנה ל־FIT COACH PRO.\nכנס/י למייל ולחץ/י על 'הגדרת סיסמה והתחברות'.\nאם לא מצאת—בדוק/י ספאם ותגיד/י לי.",
      invite_reminder_24h: "היי {name} 👋 רק תזכורת קטנה להתחברות ל־FIT COACH PRO.\nזה לוקח דקה. אם משהו לא עובד – אני כאן."
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        whatsapp_number: settings.whatsapp_number || '',
        display_name: settings.display_name || '',
        message_templates: settings.message_templates || formData.message_templates
      });
    }
  }, [settings]);

  const saveSettingsMutation = useMutation({
    mutationFn: async (data) => {
      if (settings) {
        return base44.entities.CoachSettings.update(settings.id, data);
      } else {
        return base44.entities.CoachSettings.create({
          ...data,
          coach_email: user?.email
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachSettings'] });
      toast.success('ההגדרות נשמרו בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה בשמירת ההגדרות');
    }
  });

  const handleSave = () => {
    saveSettingsMutation.mutate(formData);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        <h1 className="text-3xl font-bold text-slate-800 mb-6 flex items-center gap-3">
          <Settings className="w-8 h-8" style={{ color: '#79DBD6' }} />
          הגדרות מאמן
        </h1>



        {/* תזונה */}
        <Card className="p-6 mt-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Utensils className="w-5 h-5 text-orange-500" />
            תזונה
          </h2>
          <div className="space-y-2">
            <Link
              to={createPageUrl('FoodDatabase')}
              className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Utensils className="w-4 h-4 text-slate-500" />
                <span className="text-sm text-slate-700">מאגר מזון</span>
              </div>
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            </Link>
          </div>
        </Card>

        {/* Conversations */}
        <Card className="p-6 mt-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-500" />
            Conversations
          </h2>
          <div className="space-y-2">
            {[
              { label: '📱 WhatsApp', page: 'WhatsAppManager', icon: MessageCircle },
              { label: '📋 Call Tasks', page: 'CallTasks', icon: Phone },
            ].map(({ label, page, icon: Icon }) => (
              <Link
                key={page}
                to={createPageUrl(page)}
                className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-700">{label}</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </Card>

        {/* Conversation Engines */}
        {/* ניתוח ובקרה */}
        <Card className="p-6 mt-6">
          <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-blue-500" />
            ניתוח ובקרה
          </h2>
          <div className="space-y-2">
            {[
              { label: 'QA', page: 'TraineeQA', icon: Activity },
              { label: 'דוחות', page: 'CoachReports', icon: TrendingUp },
            ].map(({ label, page, icon: Icon }) => (
              <Link
                key={page}
                to={createPageUrl(page)}
                className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4 text-slate-500" />
                  <span className="text-sm text-slate-700">{label}</span>
                </div>
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </Link>
            ))}
          </div>
        </Card>

        {/* Control & Monitoring */}
        {user?.role === 'admin' && (
          <Card className="p-6 mt-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Globe className="w-5 h-5 text-blue-500" />
              Control & Monitoring
            </h2>
            <div className="space-y-2">
              {[
                { label: '🌐 Global Control Center', page: 'SystemControlCenter', icon: Globe },
                { label: '📋 System Summary Report', page: 'SystemSummaryReport', icon: FileText },
                { label: '🩺 System Health Monitor', page: 'SystemHealthMonitor', icon: Activity },
                { label: '📊 Sales Dashboard', page: 'SalesDashboard', icon: TrendingUp },
              ].map(({ label, page, icon: Icon }) => (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Admin Tools */}
        {user?.role === 'admin' && (
          <Card className="p-6 mt-6">
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500" />
              כלי ניהול מערכת (Admin)
            </h2>
            <div className="space-y-2">
              {[
                { label: 'ניהול מערכת', page: 'ManageTrainees', icon: Settings },
                { label: 'ניהול התראות', page: 'SystemNotificationsManager', icon: Bell },
                { label: 'טיפול במערכת', page: 'SystemCare', icon: Wrench },
                { label: 'דוחות מערכת', page: 'SystemAuditLogs', icon: FileText },
                { label: 'Copy Logs', page: 'CopyLogs', icon: ScrollText },
                { label: 'Units Debug', page: 'UnitsDebug', icon: Bug },
              ].map(({ label, page, icon: Icon }) => (
                <Link
                  key={page}
                  to={createPageUrl(page)}
                  className="flex items-center justify-between px-4 py-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-700">{label}</span>
                  </div>
                  <ChevronLeft className="w-4 h-4 text-slate-400" />
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}