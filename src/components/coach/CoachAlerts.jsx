import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, TrendingDown, Trophy, X, Check, ExternalLink } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { Link } from 'react-router-dom';

export default function CoachAlerts({ coachEmail }) {
  const [filter, setFilter] = useState('open'); // open, done, archived
  const queryClient = useQueryClient();

  const { data: allAlerts = [], isLoading } = useQuery({
    queryKey: ['coachAlerts', coachEmail],
    queryFn: () => base44.entities.CoachAlert.filter({ 
      coach_email: coachEmail
    }),
    enabled: !!coachEmail,
    refetchInterval: 60000,
  });

  const markAsDoneMutation = useMutation({
    mutationFn: (alertId) => base44.entities.CoachAlert.update(alertId, { 
      status: 'done',
      resolved_at: new Date().toISOString(),
      resolved_by: coachEmail,
      is_read: true
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coachAlerts'] }),
  });

  const archiveMutation = useMutation({
    mutationFn: (alertId) => base44.entities.CoachAlert.update(alertId, { 
      status: 'archived',
      resolved_at: new Date().toISOString(),
      resolved_by: coachEmail
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coachAlerts'] }),
  });

  const bulkArchiveDoneMutation = useMutation({
    mutationFn: async () => {
      const doneAlerts = allAlerts.filter(a => a.status === 'done');
      await Promise.all(
        doneAlerts.map(alert => 
          base44.entities.CoachAlert.update(alert.id, { status: 'archived' })
        )
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coachAlerts'] }),
  });

  const filteredAlerts = allAlerts.filter(alert => {
    const alertStatus = alert.status || 'open';
    if (filter === 'open') return alertStatus === 'open';
    if (filter === 'done') return alertStatus === 'done';
    if (filter === 'archived') return alertStatus === 'archived';
    return true;
  }).sort((a, b) => new Date(b.created_date) - new Date(a.created_date));

  const openCount = allAlerts.filter(a => (a.status || 'open') === 'open').length;
  const doneCount = allAlerts.filter(a => a.status === 'done').length;
  const archivedCount = allAlerts.filter(a => a.status === 'archived').length;

  const getAlertIcon = (type) => {
    if (type === 'inactive_3_days') return <AlertTriangle className="w-5 h-5 text-red-500" />;
    if (type === 'declining_metrics') return <TrendingDown className="w-5 h-5 text-orange-500" />;
    if (type === 'excellent_performance') return <Trophy className="w-5 h-5 text-yellow-500" />;
    return null;
  };

  const getAlertColor = (type) => {
    if (type === 'inactive_3_days') return 'border-red-200 bg-red-50';
    if (type === 'declining_metrics') return 'border-orange-200 bg-orange-50';
    if (type === 'excellent_performance') return 'border-yellow-200 bg-yellow-50';
    return 'border-slate-200 bg-slate-50';
  };

  if (isLoading) {
    return (
      <Card className="p-6">
        <p className="text-center text-slate-500">טוען התראות...</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with filters */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-800">התראות מערכת</h3>
          {openCount > 0 && (
            <p className="text-sm text-slate-600">{openCount} פתוחות</p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={filter === 'open' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('open')}
            className={filter === 'open' ? 'bg-blue-600' : ''}
          >
            פתוחות ({openCount})
          </Button>
          <Button
            variant={filter === 'done' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('done')}
            className={filter === 'done' ? 'bg-green-600' : ''}
          >
            טופלו ({doneCount})
          </Button>
          <Button
            variant={filter === 'archived' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('archived')}
            className={filter === 'archived' ? 'bg-slate-600' : ''}
          >
            ארכיון ({archivedCount})
          </Button>
          {doneCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => bulkArchiveDoneMutation.mutate()}
              disabled={bulkArchiveDoneMutation.isPending}
              className="text-slate-600 hover:bg-slate-100"
            >
              נקה טופלו
            </Button>
          )}
        </div>
      </div>

      {/* Alerts list */}
      <div className="space-y-3">
        {filteredAlerts.map(alert => (
          <Card 
            key={alert.id} 
            className={`p-4 border-2 transition-all ${getAlertColor(alert.alert_type)} ${
              !alert.is_read ? 'shadow-md' : 'opacity-75'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-1">
                {getAlertIcon(alert.alert_type)}
              </div>
              
              <div className="flex-1">
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-bold text-slate-800">{alert.title}</h4>
                  {!alert.is_read && (
                    <span className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded-full">
                      חדש
                    </span>
                  )}
                </div>
                
                <p className="text-sm text-slate-700 mb-3">{alert.summary}</p>
                
                {alert.data_snapshot && (
                  <div className="text-xs text-slate-600 bg-white/70 p-2 rounded mb-3">
                    <strong>נתונים:</strong>{' '}
                    {JSON.stringify(alert.data_snapshot, null, 2)
                      .replace(/[{}]/g, '')
                      .replace(/"/g, '')
                      .replace(/,/g, ', ')}
                  </div>
                )}

                <div className="flex gap-2 flex-wrap">
                  <Link to={createPageUrl('TraineeProfile') + `?email=${alert.trainee_email}`}>
                    <Button size="sm" variant="outline" className="gap-1">
                      <ExternalLink className="w-3 h-3" />
                      פרופיל
                    </Button>
                  </Link>
                  
                  {alert.status !== 'done' && alert.status !== 'archived' && (
                    <Button
                      size="sm"
                      onClick={() => markAsDoneMutation.mutate(alert.id)}
                      className="gap-1 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Check className="w-3 h-3" />
                      ✅ טופל
                    </Button>
                  )}
                  
                  {alert.status !== 'archived' && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => archiveMutation.mutate(alert.id)}
                      className="gap-1 text-slate-500 hover:text-slate-700"
                    >
                      🗄 ארכב
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Card>
        ))}

        {filteredAlerts.length === 0 && (
          <Card className="p-8">
            <p className="text-center text-slate-500">
              {filter === 'all' ? 'אין התראות' : 'אין התראות בקטגוריה זו'}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}