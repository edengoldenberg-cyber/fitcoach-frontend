import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Activity, MessageSquare, CheckCircle } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

const INSIGHT_CONFIG = {
  plateau: { icon: TrendingDown, label: 'תקיעות במשקל', color: 'amber' },
  low_compliance: { icon: AlertTriangle, label: 'התמדה נמוכה', color: 'red' },
  rapid_weight_loss: { icon: TrendingDown, label: 'ירידה מהירה', color: 'orange' },
  no_reporting: { icon: MessageSquare, label: 'חוסר דיווח', color: 'red' },
  low_protein: { icon: Activity, label: 'חלבון נמוך', color: 'amber' },
  workout_stagnation: { icon: Activity, label: 'תקיעות באימון', color: 'amber' },
};

export default function CoachInsights() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: insights = [], isLoading } = useQuery({
    queryKey: ['coachInsights', user?.email],
    queryFn: () => base44.entities.CoachInsight.filter({ resolved: false }),
    enabled: !!user?.email,
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const resolveInsightMutation = useMutation({
    mutationFn: (id) => base44.entities.CoachInsight.update(id, { resolved: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['coachInsights'] }),
  });

  const traineeMap = useMemo(() => {
    const map = {};
    trainees.forEach(t => map[t.user_email] = t);
    return map;
  }, [trainees]);

  const groupedInsights = useMemo(() => {
    const groups = {
      high: [],
      medium: [],
      low: []
    };
    insights.forEach(insight => {
      groups[insight.severity || 'medium'].push(insight);
    });
    return groups;
  }, [insights]);

  const severityConfig = {
    high: { label: 'דחוף', color: 'bg-red-100 text-red-700 border-red-300' },
    medium: { label: 'בינוני', color: 'bg-amber-100 text-amber-700 border-amber-300' },
    low: { label: 'נמוך', color: 'bg-blue-100 text-blue-700 border-blue-300' }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-7 h-7 text-amber-500" />
            מה דורש טיפול השבוע
          </h1>
          <p className="text-slate-500 mt-1">תובנות אוטומטיות מהמערכת</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-4 text-center bg-red-50 border-red-200">
            <p className="text-2xl font-bold text-red-700">{groupedInsights.high.length}</p>
            <p className="text-xs text-red-600">דחופים</p>
          </Card>
          <Card className="p-4 text-center bg-amber-50 border-amber-200">
            <p className="text-2xl font-bold text-amber-700">{groupedInsights.medium.length}</p>
            <p className="text-xs text-amber-600">בינוניים</p>
          </Card>
          <Card className="p-4 text-center bg-blue-50 border-blue-200">
            <p className="text-2xl font-bold text-blue-700">{groupedInsights.low.length}</p>
            <p className="text-xs text-blue-600">נמוכים</p>
          </Card>
        </div>

        {isLoading ? (
          <Card className="p-12 text-center">
            <p className="text-slate-500">טוען תובנות...</p>
          </Card>
        ) : insights.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
            <p className="text-slate-700 font-medium">אין תובנות פעילות</p>
            <p className="text-sm text-slate-500 mt-1">כל המתאמנים במצב טוב! 🎉</p>
          </Card>
        ) : (
          <>
            {/* High Priority */}
            {groupedInsights.high.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-red-700 mb-3">🔴 דחופים</h2>
                <div className="space-y-3">
                  {groupedInsights.high.map(insight => {
                    const trainee = traineeMap[insight.trainee_email];
                    const config = INSIGHT_CONFIG[insight.insight_type] || {};
                    const Icon = config.icon || AlertTriangle;
                    return (
                      <Card key={insight.id} className="p-4 border-red-200 bg-red-50">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg bg-red-100`}>
                            <Icon className="w-5 h-5 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Link 
                                to={createPageUrl('TraineeProfile') + `?email=${insight.trainee_email}`}
                                className="font-bold text-slate-800 hover:text-emerald-600"
                              >
                                {trainee?.full_name || insight.trainee_email}
                              </Link>
                              <Badge className="bg-red-100 text-red-700 border-red-300">
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-700">{insight.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {format(new Date(insight.created_date), 'd/M/yyyy HH:mm', { locale: he })}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resolveInsightMutation.mutate(insight.id)}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            סמן כטופל
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Medium Priority */}
            {groupedInsights.medium.length > 0 && (
              <div className="mb-6">
                <h2 className="text-lg font-bold text-amber-700 mb-3">🟠 בינוניים</h2>
                <div className="space-y-3">
                  {groupedInsights.medium.map(insight => {
                    const trainee = traineeMap[insight.trainee_email];
                    const config = INSIGHT_CONFIG[insight.insight_type] || {};
                    const Icon = config.icon || AlertTriangle;
                    return (
                      <Card key={insight.id} className="p-4 border-amber-200 bg-amber-50">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-amber-100">
                            <Icon className="w-5 h-5 text-amber-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Link 
                                to={createPageUrl('TraineeProfile') + `?email=${insight.trainee_email}`}
                                className="font-bold text-slate-800 hover:text-emerald-600"
                              >
                                {trainee?.full_name || insight.trainee_email}
                              </Link>
                              <Badge className="bg-amber-100 text-amber-700 border-amber-300">
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-700">{insight.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {format(new Date(insight.created_date), 'd/M/yyyy HH:mm', { locale: he })}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resolveInsightMutation.mutate(insight.id)}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            סמן כטופל
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Low Priority */}
            {groupedInsights.low.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-blue-700 mb-3">🔵 נמוכים</h2>
                <div className="space-y-3">
                  {groupedInsights.low.map(insight => {
                    const trainee = traineeMap[insight.trainee_email];
                    const config = INSIGHT_CONFIG[insight.insight_type] || {};
                    const Icon = config.icon || AlertTriangle;
                    return (
                      <Card key={insight.id} className="p-4 border-blue-200 bg-blue-50">
                        <div className="flex items-start gap-3">
                          <div className="p-2 rounded-lg bg-blue-100">
                            <Icon className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Link 
                                to={createPageUrl('TraineeProfile') + `?email=${insight.trainee_email}`}
                                className="font-bold text-slate-800 hover:text-emerald-600"
                              >
                                {trainee?.full_name || insight.trainee_email}
                              </Link>
                              <Badge className="bg-blue-100 text-blue-700 border-blue-300">
                                {config.label}
                              </Badge>
                            </div>
                            <p className="text-sm text-slate-700">{insight.message}</p>
                            <p className="text-xs text-slate-400 mt-1">
                              {format(new Date(insight.created_date), 'd/M/yyyy HH:mm', { locale: he })}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => resolveInsightMutation.mutate(insight.id)}
                            className="text-emerald-600 hover:text-emerald-700"
                          >
                            סמן כטופל
                          </Button>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}