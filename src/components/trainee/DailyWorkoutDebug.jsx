import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle2, XCircle, Info, Copy } from 'lucide-react';
import { format } from 'date-fns';

export default function DailyWorkoutDebug({ user, trainee }) {
  const [showDebug, setShowDebug] = useState(false);
  const [debugResult, setDebugResult] = useState(null);
  
  const isCoachOrAdmin = user?.role === 'admin' || user?.role === 'coach';
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const checkDailyWorkout = async () => {
    try {
      const result = {
        status: 'CHECKING',
        todayDate: todayStr,
        trainee_user_id: trainee?.user_id || user?.id,
        trainee_email: trainee?.user_email || user?.email,
        coach_email: trainee?.coach_email,
        group_id: trainee?.group_id,
        timestamp: new Date().toISOString()
      };

      // Step 1: Find daily workout for today
      let dailyWorkout = null;
      let searchMethod = '';

      // Try by coach_email
      if (trainee?.coach_email) {
        const workouts = await base44.entities.DailyWorkout.filter({
          coach_email: trainee.coach_email,
          date: todayStr,
          status: 'published'
        });
        if (workouts.length > 0) {
          dailyWorkout = workouts[0];
          searchMethod = 'coach_email';
        }
      }

      // Fallback: any published workout for today
      if (!dailyWorkout) {
        const workouts = await base44.entities.DailyWorkout.filter({
          date: todayStr,
          status: 'published'
        });
        if (workouts.length > 0) {
          dailyWorkout = workouts[0];
          searchMethod = 'general';
        }
      }

      if (!dailyWorkout) {
        result.status = 'NOT_FOUND';
        result.message = 'אין אימון יומי מפורסם להיום';
        result.searchMethod = searchMethod;
        setDebugResult(result);
        return result;
      }

      result.dailyWorkoutId = dailyWorkout.id;
      result.title = dailyWorkout.title_he;
      result.description = dailyWorkout.description_he;
      result.publishedAt = dailyWorkout.published_at;
      result.status = dailyWorkout.status;
      result.searchMethod = searchMethod;

      // Step 2: Check exercises JSON
      const exercisesJson = dailyWorkout.exercises;

      if (!exercisesJson || !Array.isArray(exercisesJson) || exercisesJson.length === 0) {
        result.status = 'NO_EXERCISES';
        result.message = 'האימון מפורסם אבל אין בו תרגילים';
        result.exercisesCount = 0;
        result.setsCount = 0;
        setDebugResult(result);
        return result;
      }

      result.exercisesCount = exercisesJson.length;
      result.setsCount = exercisesJson.reduce((sum, ex) => sum + (ex.sets || 0), 0);
      result.status = 'OK';
      result.message = `נמצא אימון: ${result.exercisesCount} תרגילים, ${result.setsCount} סטים. אפשר להעתיק.`;
      
      setDebugResult(result);
      return result;

    } catch (error) {
      const errorResult = {
        status: 'ERROR',
        todayDate: todayStr,
        trainee_user_id: trainee?.user_id || user?.id,
        message: translateError(error),
        errorCode: error.code,
        errorMessage: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      };
      
      setDebugResult(errorResult);
      return errorResult;
    }
  };

  const translateError = (error) => {
    const msg = error.message || '';
    
    if (error.code === 429 || msg.includes('429')) {
      return 'עומס מערכת, נסה שוב בעוד 20 שניות';
    }
    
    if (error.code === 400 || msg.includes('400')) {
      return `בקשה לא תקינה: ${msg}`;
    }
    
    if (msg.includes('NOT_FOUND') || msg.includes('not found')) {
      return 'אין אימון יומי מפורסם להיום';
    }
    
    if (msg.includes('NO_LINES') || msg.includes('no exercises')) {
      return 'האימון ריק (אין תרגילים)';
    }
    
    return `שגיאה: ${msg}`;
  };

  const copyDebugReport = () => {
    const report = JSON.stringify(debugResult, null, 2);
    navigator.clipboard.writeText(report).then(() => {
      alert('דוח הדיבאג הועתק ללוח');
    }).catch(() => {
      prompt('העתק את הדוח הבא:', report);
    });
  };

  const getStatusIcon = () => {
    if (!debugResult) return null;
    
    switch (debugResult.status) {
      case 'OK':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'NOT_FOUND':
      case 'NO_EXERCISES':
        return <AlertCircle className="w-5 h-5 text-orange-500" />;
      case 'ERROR':
        return <XCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getStatusColor = () => {
    if (!debugResult) return 'border-slate-200';
    
    switch (debugResult.status) {
      case 'OK':
        return 'border-green-200 bg-green-50';
      case 'NOT_FOUND':
      case 'NO_EXERCISES':
        return 'border-orange-200 bg-orange-50';
      case 'ERROR':
        return 'border-red-200 bg-red-50';
      default:
        return 'border-blue-200 bg-blue-50';
    }
  };

  return (
    <Card className="border-2 border-slate-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Info className="w-4 h-4" />
          בדיקת אימון יומי
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={checkDailyWorkout}
          variant="outline"
          className="w-full"
        >
          בצע בדיקה
        </Button>

        {debugResult && (
          <div className={`p-4 rounded-lg border-2 ${getStatusColor()}`}>
            <div className="flex items-start gap-2 mb-2">
              {getStatusIcon()}
              <div className="flex-1">
                <p className="font-bold text-sm">{debugResult.message}</p>
                <p className="text-xs text-slate-500 mt-1">תאריך: {debugResult.todayDate}</p>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyDebugReport}
              >
                <Copy className="w-3 h-3" />
              </Button>
            </div>

            <div className="mt-3 space-y-1 text-xs">
              {debugResult.dailyWorkoutId && (
                <div className="flex justify-between">
                  <span className="text-slate-500">מזהה אימון:</span>
                  <span className="font-mono">{debugResult.dailyWorkoutId.slice(0, 8)}...</span>
                </div>
              )}
              {debugResult.title && (
                <div className="flex justify-between">
                  <span className="text-slate-500">כותרת:</span>
                  <span>{debugResult.title}</span>
                </div>
              )}
              {debugResult.exercisesCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">תרגילים:</span>
                  <span className="font-bold">{debugResult.exercisesCount}</span>
                </div>
              )}
              {debugResult.setsCount !== undefined && (
                <div className="flex justify-between">
                  <span className="text-slate-500">סטים:</span>
                  <span className="font-bold">{debugResult.setsCount}</span>
                </div>
              )}
              {debugResult.publishedAt && (
                <div className="flex justify-between">
                  <span className="text-slate-500">פורסם בשעה:</span>
                  <span>{new Date(debugResult.publishedAt).toLocaleTimeString('he-IL')}</span>
                </div>
              )}
              {debugResult.searchMethod && (
                <div className="flex justify-between">
                  <span className="text-slate-500">שיטת חיפוש:</span>
                  <span>{debugResult.searchMethod}</span>
                </div>
              )}
            </div>

            {isCoachOrAdmin && (
              <div className="mt-3 pt-3 border-t border-slate-200">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowDebug(!showDebug)}
                  className="text-xs"
                >
                  {showDebug ? 'הסתר' : 'הצג'} דיבאג מלא
                </Button>
                
                {showDebug && (
                  <pre className="mt-2 p-2 bg-slate-900 text-slate-100 rounded text-[10px] overflow-x-auto">
                    {JSON.stringify(debugResult, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}

        {debugResult?.status === 'OK' && (
          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-xs text-green-800 font-medium">
              ✅ האימון תקין וניתן להעתיק
            </p>
          </div>
        )}

        {(debugResult?.status === 'NOT_FOUND' || debugResult?.status === 'NO_EXERCISES') && (
          <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <p className="text-xs text-orange-800 font-medium">
              ⚠️ לא ניתן להעתיק את האימון - יש בעיה בהגדרות
            </p>
          </div>
        )}

        {debugResult?.status === 'ERROR' && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-800 font-medium mb-1">
              ❌ שגיאה בבדיקת האימון
            </p>
            {isCoachOrAdmin && debugResult.stack && (
              <details className="mt-2">
                <summary className="text-xs cursor-pointer text-red-600">Stack Trace</summary>
                <pre className="mt-1 text-[9px] text-red-900 overflow-x-auto">
                  {debugResult.stack}
                </pre>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}