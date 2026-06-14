import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SystemTestRunner() {
  const [testResult, setTestResult] = useState(null);

  const runTestMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('testNotificationSystem', {
        test_trainee_email: null // Uses current user
      });
      return result.data;
    },
    onSuccess: (data) => {
      setTestResult(data);
      
      if (data.ok) {
        const { passed, failed, warnings } = data.summary;
        if (failed === 0) {
          toast.success(`✓ כל הבדיקות עברו! (${passed} עברו, ${warnings} אזהרות)`);
        } else {
          toast.warning(`⚠️ ${passed} עברו, ${failed} נכשלו, ${warnings} אזהרות`);
        }
      } else {
        toast.error(`שגיאה בבדיקה: ${data.error}`);
      }
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const getStatusIcon = (status) => {
    if (status === '✔') return <CheckCircle className="w-4 h-4 text-green-600" />;
    if (status === '❌') return <XCircle className="w-4 h-4 text-red-600" />;
    return <AlertTriangle className="w-4 h-4 text-orange-600" />;
  };

  const formatLabel = (key) => {
    const labels = {
      internalNotifications: 'Internal Notifications',
      automation: 'Automation',
      deduplication: 'Deduplication',
      push: 'Push',
      performance: 'Performance',
      stability: 'Stability'
    };
    return labels[key] || key;
  };

  return (
    <div>
      {testResult && testResult.report && (
        <div className="mb-4">
          {/* Summary Card */}
          <Card className="p-4 mb-4 bg-slate-50">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-green-600">{testResult.summary.passed}</div>
                <div className="text-xs text-slate-600">עברו</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{testResult.summary.failed}</div>
                <div className="text-xs text-slate-600">נכשלו</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-600">{testResult.summary.warnings}</div>
                <div className="text-xs text-slate-600">אזהרות</div>
              </div>
            </div>
          </Card>

          {/* Detailed Results */}
          <div className="space-y-2">
            {Object.entries(testResult.report).map(([key, value]) => (
              <div key={key} className="border rounded-lg p-3 bg-white">
                <div className="flex items-start gap-2 mb-2">
                  {getStatusIcon(value.status)}
                  <div className="flex-1">
                    <div className="font-bold text-sm">{formatLabel(key)}</div>
                    <div className="text-xs text-slate-600">{value.details}</div>
                  </div>
                  <Badge variant={value.status === '✔' ? 'default' : value.status === '❌' ? 'destructive' : 'outline'}>
                    {value.status}
                  </Badge>
                </div>

                {/* Show sub-tests if available */}
                {value.tests && value.tests.length > 0 && (
                  <div className="mt-2 ml-6 space-y-1">
                    {value.tests.map((test, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        {test.passed ? (
                          <CheckCircle className="w-3 h-3 text-green-600" />
                        ) : (
                          <XCircle className="w-3 h-3 text-red-600" />
                        )}
                        <span className={test.passed ? 'text-slate-600' : 'text-red-600'}>
                          {test.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Show dedup stats */}
                {key === 'deduplication' && value.created !== undefined && (
                  <div className="mt-2 ml-6 text-xs text-slate-600">
                    נוצרו: {value.created} | נחסמו: {value.blocked}
                  </div>
                )}

                {/* Show performance stats */}
                {key === 'performance' && value.duration > 0 && (
                  <div className="mt-2 ml-6 text-xs text-slate-600">
                    {value.count} התראות ב-{value.duration}ms
                  </div>
                )}

                {/* Show push stats */}
                {key === 'push' && value.subscriptions !== undefined && (
                  <div className="mt-2 ml-6 text-xs text-slate-600">
                    {value.subscriptions} מינויים פעילים
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="pt-3 mt-3 border-t text-center">
            <div className="text-sm text-slate-600">
              זמן ריצה כולל: <span className="font-bold">{testResult.duration_ms}ms</span>
            </div>
          </div>
        </div>
      )}

      <Button
        onClick={() => runTestMutation.mutate()}
        disabled={runTestMutation.isPending}
        className="w-full"
      >
        {runTestMutation.isPending ? (
          <>
            <Loader2 className="w-4 h-4 ml-2 animate-spin" />
            מריץ בדיקות מלאות...
          </>
        ) : (
          'הרץ בדיקת מערכת מלאה'
        )}
      </Button>
    </div>
  );
}