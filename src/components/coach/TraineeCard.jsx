import React from 'react';
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Utensils, Dumbbell, ChevronLeft, CheckSquare, Square, Trash2, BookOpen } from "lucide-react";
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import SendLoginLinkButton from './SendLoginLinkButton';

function getStatusColor(percentage) {
  if (percentage >= 80) return 'bg-emerald-500';
  if (percentage >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getStatusBadge(percentage) {
  if (percentage >= 80) return { label: 'מצוין', className: 'bg-emerald-100 text-emerald-700' };
  if (percentage >= 50) return { label: 'חלקי', className: 'bg-amber-100 text-amber-700' };
  return { label: 'חסר', className: 'bg-red-100 text-red-700' };
}

export default function TraineeCard({ trainee, stats, selectMode, selected, onSelect, onDelete }) {
  const initials = trainee.full_name?.split(' ').map(n => n[0]).join('') || '?';
  const queryClient = useQueryClient();
  
  const avgStatus = Math.round((stats?.nutrition + stats?.water + stats?.workout) / 3);
  const badge = getStatusBadge(avgStatus);

  const resetOnboardingMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Trainee.update(trainee.id, {
        onboarding_status: 'pending',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
    },
  });

  return (
    <Card className={`border transition-all ${selected ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center gap-3 p-3">
        {/* Checkbox in select mode */}
        {selectMode && (
          <button onClick={onSelect} className="flex-shrink-0 p-1 min-h-0 min-w-0">
            {selected
              ? <CheckSquare className="w-5 h-5 text-red-500" />
              : <Square className="w-5 h-5 text-slate-300" />}
          </button>
        )}

        <Link
          to={selectMode ? '#' : createPageUrl('TraineeProfile') + `?email=${trainee.user_email}`}
          onClick={selectMode ? onSelect : undefined}
          className="flex items-center gap-3 flex-1 min-w-0 hover:opacity-80 transition-opacity"
        >
          <Avatar className="w-11 h-11 border-2 border-slate-200 flex-shrink-0">
            <AvatarImage src={trainee.profile_image} />
            <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white font-bold text-sm">
              {initials}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <h3 className="font-bold text-slate-800 truncate text-sm">{trainee.full_name}</h3>
              <Badge className={`${badge.className} text-[10px] px-1.5 py-0`}>{badge.label}</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Utensils className="w-3 h-3 text-emerald-500" />
              <span>{stats?.mealsCount || 0} ארוחות · {stats?.calories || 0}/{stats?.targetCalories || 0} קל׳</span>
              <span>·</span>
              <span>חל׳ {stats?.protein || 0}g</span>
              <Dumbbell className={`w-3 h-3 mr-auto ${stats?.workout ? 'text-orange-500' : 'text-slate-300'}`} />
            </div>
          </div>

          {!selectMode && <ChevronLeft className="w-4 h-4 text-slate-300 flex-shrink-0" />}
        </Link>
      </div>

      {!selectMode && (
        <div className="px-3 pb-3 pt-0 flex gap-2 items-center" onClick={e => e.stopPropagation()}>
          <div className="flex-1">
            <SendLoginLinkButton trainee={trainee} variant="outline" size="sm" showStatus={true} />
          </div>
          <button
            onClick={(e) => { 
              e.stopPropagation(); 
              resetOnboardingMutation.mutate();
            }}
            className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
            title="התחל הדרכה מחדש"
            disabled={resetOnboardingMutation.isPending}
          >
            <BookOpen className="w-4 h-4" />
          </button>
          {onDelete && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(trainee.id); }}
              className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="מחק מתאמן"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>
      )}
    </Card>
  );
}