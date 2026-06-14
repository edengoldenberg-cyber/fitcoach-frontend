import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Bell, ExternalLink, CheckCircle, Archive, MoreVertical, AlertCircle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '@/utils';

export default function NotificationCenter() {
  const [filterStatus, setFilterStatus] = useState('not_treated');
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
    enabled: !!user,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ['allNotifications'],
    queryFn: () => base44.entities.Notification.list('-created_date', 500),
  });

  const { data: coachAlerts = [] } = useQuery({
    queryKey: ['coachAlerts'],
    queryFn: () => base44.entities.CoachAlert.list('-created_date', 500),
  });

  const markAsTreatedMutation = useMutation({
    mutationFn: (alertId) => base44.entities.CoachAlert.update(alertId, { status: 'treated' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachAlerts'] });
      toast.success('✅ סומן כטופל');
    },
  });

  const archiveAlertMutation = useMutation({
    mutationFn: (alertId) => base44.entities.CoachAlert.update(alertId, { status: 'archived' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachAlerts'] });
      toast.success('✅ הועבר לארכיון');
    },
  });

  // Filter and sort alerts
  const filteredAlerts = useMemo(() => {
    let filtered = coachAlerts;

    if (filterStatus === 'not_treated') {
      filtered = filtered.filter(a => a.status === 'active' || !a.status);
    } else if (filterStatus === 'treated') {
      filtered = filtered.filter(a => a.status === 'treated');
    } else if (filterStatus === 'archived') {
      filtered = filtered.filter(a => a.status === 'archived');
    }

    return filtered.sort((a, b) => 
      new Date(b.created_date) - new Date(a.created_date)
    );
  }, [coachAlerts, filterStatus]);

  const getPriorityColor = (priority) => {
    if (priority === 'urgent') return 'border-l-4 border-red-500';
    if (priority === 'warning') return 'border-l-4 border-orange-500';
    return 'border-l-4 border-blue-500';
  };

  const getPriorityIcon = (priority) => {
    if (priority === 'urgent') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (priority === 'warning') return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Info className="w-4 h-4 text-blue-500" />;
  };

  return (
    <div className="max-w-4xl mx-auto p-4 pb-20" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-7 h-7 text-teal-600" />
        <h1 className="text-2xl font-bold">התראות מאמן</h1>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={() => setFilterStatus('all')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filterStatus === 'all'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          הכל ({coachAlerts.length})
        </button>
        <button
          onClick={() => setFilterStatus('not_treated')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filterStatus === 'not_treated'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          לא טופלו ({coachAlerts.filter(a => a.status === 'active' || !a.status).length})
        </button>
        <button
          onClick={() => setFilterStatus('treated')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filterStatus === 'treated'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          טופלו ({coachAlerts.filter(a => a.status === 'treated').length})
        </button>
        <button
          onClick={() => setFilterStatus('archived')}
          className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
            filterStatus === 'archived'
              ? 'bg-teal-600 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          ארכיון ({coachAlerts.filter(a => a.status === 'archived').length})
        </button>
      </div>

      {/* Alerts List */}
      <div className="space-y-3">
        {filteredAlerts.length === 0 && (
          <Card className="p-8 text-center">
            <CheckCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">אין התראות להצגה</p>
          </Card>
        )}

        {filteredAlerts.map((alert) => {
          const trainee = trainees.find(t => t.user_email === alert.trainee_email);
          
          return (
            <Card key={alert.id} className={`p-4 ${getPriorityColor(alert.priority)}`}>
              {/* Trainee Name */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  {getPriorityIcon(alert.priority)}
                  <h3 className="text-lg font-bold">{trainee?.full_name || alert.trainee_email}</h3>
                </div>
              </div>

              {/* Main Alert Text */}
              <p className="text-slate-700 font-medium mb-3">
                {alert.message || alert.alert_type}
              </p>

              {/* Status Summary */}
              {alert.details && (
                <div className="bg-slate-50 rounded-lg p-3 mb-3 space-y-1">
                  {alert.details.workout_status && (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">אימון:</span> {alert.details.workout_status}
                    </p>
                  )}
                  {alert.details.nutrition_status && (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">תזונה:</span> {alert.details.nutrition_status}
                    </p>
                  )}
                  {alert.details.last_workout_date && (
                    <p className="text-sm text-slate-600">
                      <span className="font-medium">אימון אחרון:</span> {new Date(alert.details.last_workout_date).toLocaleDateString('he')}
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(createPageUrl('TraineeCard360') + `?email=${encodeURIComponent(alert.trainee_email)}`)}
                  className="flex items-center gap-2"
                >
                  <ExternalLink className="w-4 h-4" />
                  פתח מתאמן
                </Button>

                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() => markAsTreatedMutation.mutate(alert.id)}
                    disabled={markAsTreatedMutation.isPending}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 ml-1" />
                    סמן כטופל
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreVertical className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => archiveAlertMutation.mutate(alert.id)}>
                        <Archive className="w-4 h-4 ml-2" />
                        העבר לארכיון
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}