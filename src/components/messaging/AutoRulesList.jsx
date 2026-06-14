import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Clock, Users, Zap, Trash2 } from 'lucide-react';

export default function AutoRulesList({ rules, trainees }) {
  const queryClient = useQueryClient();

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, isEnabled }) => 
      base44.entities.AutoMessageRule.update(id, { is_enabled: !isEnabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoRules'] });
      toast.success('סטטוס החוק עודכן');
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.AutoMessageRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['autoRules'] });
      toast.success('החוק נמחק');
    },
  });

  const getFilterLabel = (filterType) => {
    const labels = {
      no_nutrition_today: 'לא מילא אוכל היום',
      no_water_today: 'לא מילא מים היום',
      no_workout_week: 'לא הזין אימון השבוע',
      inactive_2_days: 'לא נכנס 2+ ימים',
      metrics_outlier: 'חריגה במדדים',
      none: 'ללא פילטר',
    };
    return labels[filterType] || filterType;
  };

  if (rules.length === 0) {
    return (
      <div className="text-center py-12">
        <Zap className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">אין חוקים אוטומטיים עדיין</p>
        <p className="text-sm text-slate-400 mt-1">צור חוק חדש כדי לשלוח הודעות אוטומטית</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {rules.map(rule => (
        <Card key={rule.id} className="p-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="font-bold text-slate-800">{rule.name}</h3>
                {rule.is_enabled ? (
                  <Badge className="bg-green-100 text-green-800">פעיל</Badge>
                ) : (
                  <Badge className="bg-slate-200 text-slate-700">כבוי</Badge>
                )}
              </div>
              
              <div className="flex flex-wrap gap-3 text-sm text-slate-600">
                <div className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {rule.schedule_type === 'daily' ? 'יומי' : 'שבועי'} ב-{rule.time_of_day}
                </div>
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  {rule.audience_type === 'all' ? 'כל המתאמנים' :
                   rule.audience_type === 'selected' ? `${rule.selected_trainee_emails?.length || 0} מתאמנים` :
                   getFilterLabel(rule.filter_type)}
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => toggleRuleMutation.mutate({ id: rule.id, isEnabled: rule.is_enabled })}
                className={`w-12 h-6 rounded-full transition-colors ${
                  rule.is_enabled ? 'bg-green-500' : 'bg-slate-300'
                }`}
              >
                <div className={`w-5 h-5 bg-white rounded-full transition-transform ${
                  rule.is_enabled ? 'translate-x-[-26px]' : 'translate-x-[-2px]'
                }`} />
              </button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (confirm('בטוח למחוק חוק זה?')) {
                    deleteRuleMutation.mutate(rule.id);
                  }
                }}
                className="text-red-600"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="bg-slate-50 rounded-lg p-3 text-sm">
            <p className="font-medium text-slate-700 mb-1">{rule.title_template}</p>
            <p className="text-slate-600">{rule.message_template}</p>
            {rule.action_type !== 'none' && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <Badge variant="outline" className="text-xs">
                  CTA: {rule.action_label || rule.action_type}
                </Badge>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}