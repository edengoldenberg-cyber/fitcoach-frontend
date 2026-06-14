import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Play, 
  Loader2, 
  Copy, 
  Search,
  ExternalLink,
  PlayCircle
} from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';
import BackButton from '../components/shared/BackButton';

export default function TraineeQA() {
  const [searchTerm, setSearchTerm] = useState('');
  const [testResults, setTestResults] = useState({});
  const [runningTests, setRunningTests] = useState(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const runQAMutation = useMutation({
    mutationFn: async (traineeEmail) => {
      const response = await base44.functions.invoke('runTraineeQA', { traineeEmail });
      return response.data;
    },
    onSuccess: (data, traineeEmail) => {
      setTestResults(prev => ({
        ...prev,
        [traineeEmail]: data,
      }));
      setRunningTests(prev => {
        const newSet = new Set(prev);
        newSet.delete(traineeEmail);
        return newSet;
      });
    },
    onError: (error, traineeEmail) => {
      setTestResults(prev => ({
        ...prev,
        [traineeEmail]: {
          error: true,
          message: error.message || 'Test failed',
        },
      }));
      setRunningTests(prev => {
        const newSet = new Set(prev);
        newSet.delete(traineeEmail);
        return newSet;
      });
    },
  });

  const handleRunTest = (traineeEmail) => {
    setRunningTests(prev => new Set([...prev, traineeEmail]));
    runQAMutation.mutate(traineeEmail);
  };

  const handleRunAllTests = async () => {
    setRunningAll(true);
    for (const trainee of filteredTrainees) {
      setRunningTests(prev => new Set([...prev, trainee.user_email]));
      await runQAMutation.mutateAsync(trainee.user_email);
    }
    setRunningAll(false);
  };

  const copyReport = (result) => {
    const report = generateReport(result);
    navigator.clipboard.writeText(report);
    alert('דוח הועתק ללוח');
  };

  const generateReport = (result) => {
    let report = `=== דוח בדיקת יציבות ===\n\n`;
    report += `מתאמן: ${result.trainee.name} (${result.trainee.email})\n`;
    report += `תאריך: ${new Date(result.timestamp).toLocaleString('he-IL')}\n`;
    report += `סטטוס כללי: ${result.overallStatus === 'passed' ? '✅ תקין' : result.overallStatus === 'warning' ? '⚠️ חלקי' : '❌ נכשל'}\n\n`;
    
    report += `סיכום:\n`;
    report += `✅ עבר: ${result.summary.passed}\n`;
    report += `❌ נכשל: ${result.summary.failed}\n`;
    report += `⚠️ אזהרות: ${result.summary.warnings}\n\n`;
    
    report += `=== פירוט בדיקות ===\n\n`;
    
    result.tests.forEach((test, i) => {
      const icon = test.status === 'passed' ? '✅' : test.status === 'warning' ? '⚠️' : '❌';
      report += `${i + 1}. ${icon} [${test.category}] ${test.name}\n`;
      if (test.details) report += `   📋 ${test.details}\n`;
      if (test.error) report += `   ❗ שגיאה: ${test.error}\n`;
      report += `\n`;
    });
    
    report += `\n=== נתונים טכניים ===\n`;
    report += `Trainee ID: ${result.trainee.id}\n`;
    report += `User Agent: ${navigator.userAgent}\n`;
    report += `App Version: FIT COACH PRO v2.0\n`;
    
    return report;
  };

  const filteredTrainees = trainees.filter(t => {
    const search = searchTerm.toLowerCase();
    return (
      t.full_name?.toLowerCase().includes(search) ||
      t.user_email?.toLowerCase().includes(search) ||
      t.phone?.includes(search)
    );
  });

  const getStatusIcon = (result) => {
    if (!result) return null;
    if (result.error) {
      return <XCircle className="w-5 h-5 text-red-500" />;
    }
    if (result.overallStatus === 'passed') {
      return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
    if (result.overallStatus === 'warning') {
      return <AlertTriangle className="w-5 h-5 text-amber-500" />;
    }
    return <XCircle className="w-5 h-5 text-red-500" />;
  };

  const getStatusText = (result) => {
    if (!result) return 'לא נבדק';
    if (result.error) return 'שגיאה בבדיקה';
    if (result.overallStatus === 'passed') return 'תקין';
    if (result.overallStatus === 'warning') return 'חלקי';
    return 'נכשל';
  };

  return (
    <div className="min-h-screen bg-slate-50" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6 pb-24">
        <BackButton />
        
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            🔍 בדיקת יציבות מתאמנים (QA)
          </h1>
          <p className="text-slate-600 text-sm">
            מערכת בדיקה אוטומטית לזיהוי תקלות בהוספת ארוחות, אימונים ומדדים
          </p>
        </div>

        {/* Search & Run All */}
        <div className="mb-6 flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="חיפוש לפי שם, אימייל או טלפון..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pr-10"
            />
          </div>
          <Button
            onClick={handleRunAllTests}
            disabled={runningAll || filteredTrainees.length === 0}
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
            className="flex items-center gap-2"
          >
            {runningAll ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                מריץ...
              </>
            ) : (
              <>
                <PlayCircle className="w-4 h-4" />
                הרץ לכולם ({filteredTrainees.length})
              </>
            )}
          </Button>
        </div>

        {/* Info Card */}
        <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
          <h3 className="font-bold text-blue-900 mb-2">מה הבדיקה כוללת?</h3>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>✅ בדיקת הרשאות וזיהוי משתמש</li>
            <li>✅ יצירה, קריאה ועדכון של ארוחות + חישוב סיכומים</li>
            <li>✅ יצירה וקריאה של אימונים עם תרגילים וסטים</li>
            <li>✅ יצירה וקריאה של מדדים (משקל, אחוז שומן)</li>
            <li>✅ מחיקת נתוני בדיקה (לא משאיר זיהום)</li>
          </ul>
        </Card>

        {/* Trainees List */}
        {isLoading ? (
          <div className="text-center py-12">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
            <p className="text-slate-500">טוען מתאמנים...</p>
          </div>
        ) : filteredTrainees.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-slate-500">לא נמצאו מתאמנים</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredTrainees.map(trainee => {
              const result = testResults[trainee.user_email];
              const isRunning = runningTests.has(trainee.user_email);

              return (
                <Card key={trainee.id} className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      {getStatusIcon(result)}
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{trainee.full_name}</h3>
                        <p className="text-xs text-slate-500">{trainee.user_email}</p>
                        {result && !result.error && (
                          <p className="text-xs text-slate-600 mt-1">
                            {getStatusText(result)} • {result.summary.passed} עבר, {result.summary.failed} נכשל
                          </p>
                        )}
                        {result?.error && (
                          <p className="text-xs text-red-600 mt-1">
                            שגיאה: {result.message}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => navigate(createPageUrl(`TraineeProfile?email=${trainee.user_email}`))}
                        variant="outline"
                        size="sm"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                      <Button
                        onClick={() => handleRunTest(trainee.user_email)}
                        disabled={isRunning}
                        size="sm"
                        style={{ backgroundColor: '#79DBD6', color: 'white' }}
                      >
                        {isRunning ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin ml-1" />
                            רץ...
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 ml-1" />
                            הרץ בדיקה
                          </>
                        )}
                      </Button>
                      {result && !result.error && (
                        <Button
                          onClick={() => copyReport(result)}
                          variant="outline"
                          size="sm"
                        >
                          <Copy className="w-4 h-4 ml-1" />
                          העתק דוח
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Test Details */}
                  {result && !result.error && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <h4 className="text-sm font-bold text-slate-700 mb-2">פירוט בדיקות:</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {result.tests.map((test, i) => (
                          <div
                            key={i}
                            className={`p-2 rounded-lg text-xs ${
                              test.status === 'passed'
                                ? 'bg-green-50 border border-green-200'
                                : test.status === 'warning'
                                ? 'bg-amber-50 border border-amber-200'
                                : 'bg-red-50 border border-red-200'
                            }`}
                          >
                            <div className="flex items-start gap-2">
                              {test.status === 'passed' && <CheckCircle className="w-3 h-3 text-green-600 mt-0.5" />}
                              {test.status === 'warning' && <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5" />}
                              {test.status === 'failed' && <XCircle className="w-3 h-3 text-red-600 mt-0.5" />}
                              <div className="flex-1">
                                <p className="font-medium text-slate-800">
                                  [{test.category}] {test.name}
                                </p>
                                {test.error && (
                                  <p className="text-red-700 mt-1">❗ {test.error}</p>
                                )}
                                {test.details && (
                                  <p className="text-slate-600 mt-1">📋 {test.details}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}