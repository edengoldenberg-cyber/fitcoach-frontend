import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Copy, AlertCircle, Database, User, Activity } from "lucide-react";

export default function DebugPage() {
  const [lastError, setLastError] = useState(null);
  const [lastApiResponse, setLastApiResponse] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0];
    },
    enabled: !!user?.email,
  });

  const { data: todayWorkout } = useQuery({
    queryKey: ['todayDailyWorkout', trainee?.coach_email],
    queryFn: async () => {
      const todayStr = new Date().toISOString().split('T')[0];
      const workouts = await base44.entities.DailyWorkout.filter({ 
        coach_email: trainee?.coach_email,
        date: todayStr
      });
      return workouts[0];
    },
    enabled: !!trainee?.coach_email,
  });

  const { data: recentLogs = [] } = useQuery({
    queryKey: ['recentAuditLogs'],
    queryFn: () => base44.entities.SystemAuditLog.list('-created_date', 10),
  });

  const copyToClipboard = (data) => {
    const text = JSON.stringify(data, null, 2);
    navigator.clipboard.writeText(text);
    alert('✅ הועתק ללוח');
  };

  const testApiCall = async () => {
    try {
      const response = await base44.entities.DailyWorkout.list('-created_date', 5);
      setLastApiResponse({ success: true, data: response, timestamp: new Date().toISOString() });
    } catch (error) {
      setLastError({ error: error.message, stack: error.stack, timestamp: new Date().toISOString() });
      setLastApiResponse({ success: false, error: error.message, timestamp: new Date().toISOString() });
    }
  };

  const clearLocalStorage = () => {
    if (window.confirm('האם לנקות את ה-Local Storage?')) {
      localStorage.clear();
      alert('✅ Local Storage נוקה');
      window.location.reload();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800 p-6 pb-24" dir="rtl">
      <div className="max-w-4xl mx-auto space-y-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-400">
              <Activity className="w-6 h-6" />
              🛠️ מסך Debug - מצב מפתח
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Button onClick={testApiCall} variant="outline" size="sm">
                בדוק API Call
              </Button>
              <Button onClick={clearLocalStorage} variant="outline" size="sm" className="text-red-400">
                נקה Local Storage
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Current User */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-blue-400">
                <User className="w-5 h-5" />
                Current User
              </CardTitle>
              <Button onClick={() => copyToClipboard(user)} variant="ghost" size="sm">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-green-400 bg-slate-900 p-3 rounded overflow-auto max-h-48">
              {JSON.stringify(user, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Current Trainee */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-purple-400">
                <Database className="w-5 h-5" />
                Current Trainee
              </CardTitle>
              <Button onClick={() => copyToClipboard(trainee)} variant="ghost" size="sm">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-green-400 bg-slate-900 p-3 rounded overflow-auto max-h-48">
              {JSON.stringify(trainee, null, 2)}
            </pre>
          </CardContent>
        </Card>

        {/* Today's Workout State */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-orange-400">
                <Activity className="w-5 h-5" />
                Today's Workout State
              </CardTitle>
              <Button onClick={() => copyToClipboard(todayWorkout)} variant="ghost" size="sm">
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {todayWorkout ? (
              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  <div>ID: {todayWorkout.id}</div>
                  <div>Title: {todayWorkout.title_he}</div>
                  <div>Published: {todayWorkout.is_published ? '✅' : '❌'}</div>
                  <div>Exercises: {todayWorkout.exercises?.length || 0}</div>
                  <div>
                    Total Sets: {todayWorkout.exercises?.reduce((sum, ex) => sum + (ex.sets?.length || 0), 0) || 0}
                  </div>
                </div>
                <pre className="text-xs text-green-400 bg-slate-900 p-3 rounded overflow-auto max-h-48">
                  {JSON.stringify(todayWorkout, null, 2)}
                </pre>
              </div>
            ) : (
              <p className="text-sm text-slate-400">No workout found for today</p>
            )}
          </CardContent>
        </Card>

        {/* Last API Response */}
        {lastApiResponse && (
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-cyan-400">
                  <Database className="w-5 h-5" />
                  Last API Response
                </CardTitle>
                <Button onClick={() => copyToClipboard(lastApiResponse)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-green-400 bg-slate-900 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(lastApiResponse, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Last Error */}
        {lastError && (
          <Card className="bg-red-900/20 border-red-500/50">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-red-400">
                  <AlertCircle className="w-5 h-5" />
                  Last Error
                </CardTitle>
                <Button onClick={() => copyToClipboard(lastError)} variant="ghost" size="sm">
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="text-xs text-red-400 bg-slate-900 p-3 rounded overflow-auto max-h-48">
                {JSON.stringify(lastError, null, 2)}
              </pre>
            </CardContent>
          </Card>
        )}

        {/* Recent Audit Logs */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-400">
              <Activity className="w-5 h-5" />
              Recent Audit Logs (Last 10)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentLogs.length === 0 ? (
              <p className="text-sm text-slate-400">No logs yet</p>
            ) : (
              <div className="space-y-2">
                {recentLogs.map(log => (
                  <div key={log.id} className="bg-slate-900 p-2 rounded text-xs">
                    <div className="flex justify-between text-slate-400">
                      <span>{log.action_type}</span>
                      <span className={log.status === 'success' ? 'text-green-400' : 'text-red-400'}>
                        {log.status}
                      </span>
                    </div>
                    {log.error_code && (
                      <div className="text-red-400 mt-1">Error: {log.error_code}</div>
                    )}
                    {log.debug_id && (
                      <div className="text-cyan-400 mt-1">Debug ID: {log.debug_id}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Info */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader>
            <CardTitle className="text-slate-400">System Info</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs text-slate-400 space-y-1">
              <div>User Agent: {navigator.userAgent}</div>
              <div>Screen: {window.screen.width}x{window.screen.height}</div>
              <div>Viewport: {window.innerWidth}x{window.innerHeight}</div>
              <div>Language: {navigator.language}</div>
              <div>Online: {navigator.onLine ? '✅' : '❌'}</div>
              <div>Timestamp: {new Date().toISOString()}</div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}