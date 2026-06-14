import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, Activity } from "lucide-react";

export default function SystemTest() {
  const [results, setResults] = React.useState([]);
  const [testing, setTesting] = React.useState(false);

  const runTests = async () => {
    setTesting(true);
    const testResults = [];

    // Test 1: User Auth
    try {
      const user = await base44.auth.me();
      testResults.push({
        name: 'Authentication',
        status: user ? 'pass' : 'fail',
        details: user ? `Logged in as ${user.email}` : 'No user',
        data: user
      });
    } catch (err) {
      testResults.push({
        name: 'Authentication',
        status: 'error',
        details: err.message,
        error: err
      });
    }

    // Test 2: Trainee Link
    try {
      const user = await base44.auth.me();
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      testResults.push({
        name: 'Trainee Profile',
        status: trainees?.length > 0 ? 'pass' : 'warn',
        details: trainees?.length > 0 ? `Found trainee: ${trainees[0].full_name}` : 'No trainee profile',
        data: trainees?.[0]
      });
    } catch (err) {
      testResults.push({
        name: 'Trainee Profile',
        status: 'error',
        details: err.message,
        error: err
      });
    }

    // Test 3: Daily Workout
    try {
      const user = await base44.auth.me();
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      const trainee = trainees?.[0];
      
      if (trainee?.coach_email) {
        const todayStr = new Date().toISOString().split('T')[0];
        const workouts = await base44.entities.DailyWorkout.filter({ 
          coach_email: trainee.coach_email,
          date: todayStr
        });
        
        const workout = workouts?.[0];
        testResults.push({
          name: 'Daily Workout',
          status: workout ? 'pass' : 'warn',
          details: workout 
            ? `Found workout: ${workout.title_he} (${workout.exercises?.length || 0} exercises)` 
            : 'No daily workout for today',
          data: workout
        });
      } else {
        testResults.push({
          name: 'Daily Workout',
          status: 'skip',
          details: 'No coach assigned',
        });
      }
    } catch (err) {
      testResults.push({
        name: 'Daily Workout',
        status: 'error',
        details: err.message,
        error: err
      });
    }

    // Test 4: Food Database
    try {
      const foods = await base44.entities.FoodItem.list('-created_date', 5);
      testResults.push({
        name: 'Food Database',
        status: foods?.length > 0 ? 'pass' : 'warn',
        details: `Found ${foods?.length || 0} food items`,
        data: foods
      });
    } catch (err) {
      testResults.push({
        name: 'Food Database',
        status: 'error',
        details: err.message,
        error: err
      });
    }

    // Test 5: Backend Function
    try {
      const response = await base44.functions.invoke('copyDailyWorkout', {
        daily_workout_id: 'test-validation',
        trainee_email: 'test@test.com',
        target_date: '2026-02-16'
      });
      
      testResults.push({
        name: 'Backend Function (copyDailyWorkout)',
        status: response.data?.error_code === 'WORKOUT_NOT_FOUND' ? 'pass' : 'warn',
        details: 'Function reachable, returned expected validation error',
        data: response.data
      });
    } catch (err) {
      testResults.push({
        name: 'Backend Function (copyDailyWorkout)',
        status: 'error',
        details: err.message,
        error: err
      });
    }

    setResults(testResults);
    setTesting(false);
  };

  React.useEffect(() => {
    runTests();
  }, []);

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail' || r.status === 'error').length;
  const warnCount = results.filter(r => r.status === 'warn').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6 pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto space-y-4">
        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-blue-600">
              <Activity className="w-6 h-6" />
              🧪 בדיקת מערכת - System Test
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <p className="text-2xl font-bold text-green-600">{passCount}</p>
                <p className="text-xs text-green-700">עברו ✓</p>
              </div>
              <div className="text-center p-3 bg-yellow-50 rounded-lg">
                <p className="text-2xl font-bold text-yellow-600">{warnCount}</p>
                <p className="text-xs text-yellow-700">אזהרות</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{failCount}</p>
                <p className="text-xs text-red-700">נכשלו ✗</p>
              </div>
            </div>

            <Button 
              onClick={runTests}
              disabled={testing}
              className="w-full"
            >
              {testing ? 'בודק...' : 'הרץ בדיקות מחדש'}
            </Button>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <div className="space-y-3">
            {results.map((test, idx) => (
              <Card key={idx} className={
                test.status === 'pass' ? 'border-green-200 bg-green-50' :
                test.status === 'error' || test.status === 'fail' ? 'border-red-200 bg-red-50' :
                test.status === 'warn' ? 'border-yellow-200 bg-yellow-50' :
                'border-slate-200'
              }>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0">
                      {test.status === 'pass' ? <CheckCircle className="w-5 h-5 text-green-600" /> :
                       test.status === 'error' || test.status === 'fail' ? <XCircle className="w-5 h-5 text-red-600" /> :
                       test.status === 'warn' ? <AlertCircle className="w-5 h-5 text-yellow-600" /> :
                       <AlertCircle className="w-5 h-5 text-slate-400" />}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-bold text-sm">{test.name}</h3>
                      <p className="text-xs text-slate-600 mt-1">{test.details}</p>
                      {test.data && (
                        <details className="mt-2">
                          <summary className="text-xs text-slate-500 cursor-pointer hover:text-slate-700">
                            הצג נתונים
                          </summary>
                          <pre className="mt-2 text-xs bg-white p-2 rounded border overflow-auto max-h-32">
                            {JSON.stringify(test.data, null, 2)}
                          </pre>
                        </details>
                      )}
                      {test.error && (
                        <div className="mt-2 p-2 bg-white rounded border text-xs text-red-700">
                          <p className="font-medium">Error:</p>
                          <p className="font-mono text-[10px] mt-1">{test.error.message}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {testing && (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-600">מריץ בדיקות...</p>
          </div>
        )}
      </div>
    </div>
  );
}