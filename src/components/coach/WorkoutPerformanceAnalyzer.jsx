import React, { useMemo } from 'react';
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, TrendingDown, Activity } from "lucide-react";

export default function WorkoutPerformanceAnalyzer({ workouts = [] }) {
  const insights = useMemo(() => {
    if (workouts.length < 3) return [];
    
    const findings = [];
    const sortedWorkouts = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // 1. זיהוי RPE גבוה עם הערות כאב
    const highRPEWithPain = sortedWorkouts.filter(w => {
      const hasHighRPE = w.rpe >= 8;
      const hasPainNotes = w.exercises?.some(ex => 
        ex.notes?.toLowerCase().includes('כאב') || 
        ex.notes?.toLowerCase().includes('כואב')
      ) || w.notes?.toLowerCase().includes('כאב');
      return hasHighRPE && hasPainNotes;
    });

    if (highRPEWithPain.length >= 2) {
      findings.push({
        type: 'high_rpe_pain',
        severity: 'high',
        message: `${highRPEWithPain.length} אימונים אחרונים עם RPE גבוה + דיווח כאב`,
        details: highRPEWithPain.slice(0, 3).map(w => ({
          date: w.date,
          rpe: w.rpe,
          painNotes: w.exercises?.filter(ex => ex.notes?.includes('כאב')).map(ex => ex.exercise_name)
        }))
      });
    }

    // 2. זיהוי ירידה בביצועים לאחר RPE גבוה
    for (let i = 0; i < sortedWorkouts.length - 2; i++) {
      const current = sortedWorkouts[i];
      const prev = sortedWorkouts[i + 1];
      
      if (!current.exercises || !prev.exercises) continue;
      
      // בדיקה האם היה RPE גבוה באימון הקודם
      if (prev.rpe >= 8) {
        // השוואת תרגילים משותפים
        const prevExercises = prev.exercises;
        const currentExercises = current.exercises;
        
        let performanceDrops = 0;
        prevExercises.forEach(prevEx => {
          const currentEx = currentExercises.find(ex => ex.exercise_name === prevEx.exercise_name);
          if (currentEx && prevEx.sets?.length > 0 && currentEx.sets?.length > 0) {
            const prevMaxWeight = Math.max(...prevEx.sets.map(s => s.weight || 0));
            const currentMaxWeight = Math.max(...currentEx.sets.map(s => s.weight || 0));
            
            if (currentMaxWeight < prevMaxWeight * 0.9) { // ירידה של 10%+
              performanceDrops++;
            }
          }
        });
        
        if (performanceDrops >= 2) {
          findings.push({
            type: 'performance_drop_after_high_rpe',
            severity: 'medium',
            message: `ירידה בביצועים לאחר RPE גבוה (${prev.rpe})`,
            details: {
              highRPEDate: prev.date,
              currentDate: current.date,
              affectedExercises: performanceDrops
            }
          });
        }
      }
    }

    // 3. זיהוי דיווח קושי בטכניקה
    const techniqueIssues = sortedWorkouts.filter(w => 
      w.exercises?.some(ex => 
        ex.notes?.toLowerCase().includes('טכניקה') ||
        ex.notes?.toLowerCase().includes('קושי') ||
        ex.notes?.toLowerCase().includes('לא יצא')
      )
    );

    if (techniqueIssues.length >= 2) {
      findings.push({
        type: 'technique_issues',
        severity: 'low',
        message: `${techniqueIssues.length} אימונים עם דיווח קושי בטכניקה`,
        details: techniqueIssues.slice(0, 3).map(w => ({
          date: w.date,
          exercises: w.exercises?.filter(ex => 
            ex.notes?.includes('טכניקה') || ex.notes?.includes('קושי')
          ).map(ex => ex.exercise_name)
        }))
      });
    }

    // 4. זיהוי תקיעות עם RPE גבוה מתמשך
    const recentHighRPE = sortedWorkouts.slice(0, 4).filter(w => w.rpe >= 8);
    if (recentHighRPE.length >= 3) {
      findings.push({
        type: 'chronic_high_rpe',
        severity: 'high',
        message: `${recentHighRPE.length}/4 אימונים אחרונים עם RPE גבוה - אזהרת עייפות`,
        details: recentHighRPE.map(w => ({ date: w.date, rpe: w.rpe }))
      });
    }

    return findings;
  }, [workouts]);

  const severityConfig = {
    high: { color: 'bg-red-100 text-red-700 border-red-300', icon: AlertTriangle },
    medium: { color: 'bg-amber-100 text-amber-700 border-amber-300', icon: TrendingDown },
    low: { color: 'bg-blue-100 text-blue-700 border-blue-300', icon: Activity }
  };

  if (insights.length === 0) return null;

  return (
    <Card className="p-4 bg-white border shadow-sm">
      <h3 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
        <Activity className="w-5 h-5" style={{ color: '#79DBD6' }} />
        ניתוח ביצועים אוטומטי
      </h3>
      <div className="space-y-3">
        {insights.map((insight, idx) => {
          const config = severityConfig[insight.severity];
          const Icon = config.icon;
          
          return (
            <div key={idx} className={`p-3 rounded-lg border-2 ${config.color}`}>
              <div className="flex items-start gap-2">
                <Icon className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">{insight.message}</p>
                  {insight.details && (
                    <div className="mt-2 text-xs opacity-75">
                      {Array.isArray(insight.details) ? (
                        <ul className="list-disc list-inside space-y-1">
                          {insight.details.map((d, i) => (
                            <li key={i}>{d.date}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>{JSON.stringify(insight.details, null, 2)}</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}