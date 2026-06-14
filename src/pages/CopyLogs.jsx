import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function CopyLogs() {
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['copyLogs'],
    queryFn: async () => {
      const allLogs = await base44.entities.CopyLog.list('-created_date', 100);
      return allLogs;
    },
    enabled: user?.role === 'admin',
  });

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-slate-50 p-6" dir="rtl">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardContent className="p-8 text-center text-slate-500">
              דף זה זמין למנהלי מערכת בלבד
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Copy Logs - 100 אחרונים</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500 mx-auto"></div>
              </div>
            ) : logs.length === 0 ? (
              <p className="text-center text-slate-500 py-8">אין לוגים</p>
            ) : (
              <div className="space-y-2">
                {logs.map(log => (
                  <div 
                    key={log.id} 
                    className={`p-3 rounded-lg border ${
                      log.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {log.success ? (
                        <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                      )}
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {log.action_type}
                          </span>
                          <span className="text-xs text-slate-500">
                            {format(new Date(log.created_date), 'dd/MM/yyyy HH:mm:ss')}
                          </span>
                        </div>
                        
                        <div className="text-xs text-slate-600 space-y-1">
                          <div>מתאמן: {log.trainee_email}</div>
                          {log.exercise_name && <div>תרגיל: {log.exercise_name}</div>}
                          {log.target_date && <div>תאריך: {log.target_date}</div>}
                          <div>Status: {log.status_code || 'N/A'}</div>
                          {log.duration_ms && <div>Duration: {log.duration_ms}ms</div>}
                        </div>

                        {log.error_text && (
                          <div className="mt-2 p-2 bg-red-100 rounded text-xs text-red-800">
                            {log.error_text}
                          </div>
                        )}

                        {log.payload_json && (
                          <details className="mt-2">
                            <summary className="text-xs cursor-pointer text-blue-600 hover:text-blue-800">
                              View Payload
                            </summary>
                            <pre className="mt-1 p-2 bg-white rounded text-[10px] overflow-auto max-h-40">
                              {JSON.stringify(log.payload_json, null, 2)}
                            </pre>
                          </details>
                        )}

                        {log.response_text && (
                          <details className="mt-2">
                            <summary className="text-xs cursor-pointer text-blue-600 hover:text-blue-800">
                              View Response
                            </summary>
                            <pre className="mt-1 p-2 bg-white rounded text-[10px] overflow-auto max-h-40">
                              {log.response_text}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}