import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import UnitsDebugPanel from '../components/shared/UnitsDebugPanel';
import AccuracyFixPanel from '../components/coach/AccuracyFixPanel';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

/**
 * דף Debug למאמן - מערכת יחידות מידה
 */
export default function UnitsDebug() {
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // רק למאמן/אדמין
  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const isCoach = (coachTrainees && coachTrainees.length > 0) || user?.role === 'admin';

  if (!isCoach) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center">
          <h2 className="text-xl font-bold text-red-600 mb-2">גישה נדחתה</h2>
          <p className="text-slate-600 mb-4">דף זה זמין למאמנים בלבד</p>
          <Button onClick={() => navigate(createPageUrl('TraineeHome'))}>
            חזור לדף הבית
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(-1)}
            className="flex items-center gap-2"
          >
            <ArrowRight className="w-4 h-4" />
            חזור
          </Button>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: '#79DBD6' }}>
              Units Debug Panel
            </h1>
            <p className="text-sm text-slate-600">מקור אמת למערכת יחידות המידה</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="debug" dir="rtl">
          <TabsList className="mb-4">
            <TabsTrigger value="debug">🔬 Truth Panel</TabsTrigger>
            <TabsTrigger value="accuracy">🎯 תיקון דיוק</TabsTrigger>
          </TabsList>
          
          <TabsContent value="debug">
            <UnitsDebugPanel />
          </TabsContent>
          
          <TabsContent value="accuracy">
            <AccuracyFixPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}