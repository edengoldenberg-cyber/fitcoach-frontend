import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, XCircle, Zap, Download, RefreshCw, Shield, Activity, Database, Users, Home, Wrench, Copy, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function SystemCare() {
  const [fixing, setFixing] = useState(false);
  const [debugReport, setDebugReport] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState('');
  const [healthcheckResults, setHealthcheckResults] = useState(null);
  const [healthcheckLoading, setHealthcheckLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: healthStatus, refetch: refetchHealth, isLoading: healthLoading } = useQuery({
    queryKey: ['systemHealth'],
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke('systemHealthCheck', {});
        return response.data;
      } catch (err) {
        return {
          auth: { status: 'error', message: err.message },
          trainee: { status: 'error' },
          homeData: { status: 'error' },
          meals: { status: 'error' },
          workouts: { status: 'error' },
          units: { status: 'error' },
          goals: { status: 'error' }
        };
      }
    },
    enabled: !!user,
  });

  const { data: problemTrainees, refetch: refetchProblems } = useQuery({
    queryKey: ['problemTrainees'],
    queryFn: async () => {
      try {
        const response = await base44.functions.invoke('findProblemTrainees', {});
        return response.data.trainees || [];
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const { data: systemErrors } = useQuery({
    queryKey: ['systemErrors'],
    queryFn: async () => {
      try {
        const logs = await base44.entities.SystemAuditLog.filter({ status: 'fail' }, '-created_date', 50);
        return logs;
      } catch {
        return [];
      }
    },
    enabled: !!user,
  });

  const globalRecoveryMutation = useMutation({
    mutationFn: async () => {
      const response = await base44.functions.invoke('globalSystemRecovery', {});
      return response.data;
    },
    onSuccess: (data) => {
      toast.success(`תיקון גלובלי בוצע בהצלחה! ${data.fixed} תיקונים`);
      refetchHealth();
      refetchProblems();
    },
    onError: (err) => {
      toast.error(`שגיאה: ${err.message}`);
    }
  });

  const [fixingTrainee, setFixingTrainee] = useState(null);
  const [bulkFixing, setBulkFixing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(null);

  const fixTraineeMutation = useMutation({
    mutationFn: async ({ traineeId, traineeEmail, action }) => {
      const correlationId = `FIX-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
      
      setFixingTrainee({ traineeId, action });
      toast.loading(`מבצע תיקון ${action}...`, { id: correlationId });
      
      const response = await base44.functions.invoke('fixTraineeUserIdAndModules', { 
        trainee_id: traineeId,
        trainee_email: traineeEmail,
        action,
        correlation_id: correlationId
      });
      
      return { data: response.data, correlationId };
    },
    onSuccess: ({ data, correlationId }) => {
      setFixingTrainee(null);
      toast.dismiss(correlationId);
      
      if (data.success) {
        toast.success(`✅ תיקון הושלם בהצלחה`);
        queryClient.invalidateQueries({ queryKey: ['problemTrainees'] });
        queryClient.invalidateQueries({ queryKey: ['allTraineesForHealthcheck'] });
      } else {
        toast.error(`⚠️ ${data.message || 'לא ניתן לתקן אוטומטית'}`);
      }
    },
    onError: (err, variables, context) => {
      setFixingTrainee(null);
      toast.error(`❌ שגיאה: ${err.message}`);
    }
  });

  const bulkFixMutation = useMutation({
    mutationFn: async () => {
      const correlationId = `BULK-${Date.now().toString(36)}`.toUpperCase();
      setBulkFixing(true);
      toast.loading('מבצע תיקון לכל הרשימה...', { id: correlationId });
      
      const response = await base44.functions.invoke('fixTraineeUserIdAndModules', {
        action: 'bulk_fix',
        correlation_id: correlationId
      });
      
      return { data: response.data, correlationId };
    },
    onSuccess: ({ data, correlationId }) => {
      setBulkFixing(false);
      toast.dismiss(correlationId);
      
      setBulkProgress(data);
      toast.success(`✅ הושלם: ${data.fixed} תוקנו, ${data.failed} נכשלו, ${data.skipped} דולגו`);
      
      queryClient.invalidateQueries({ queryKey: ['problemTrainees'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesForHealthcheck'] });
    },
    onError: (err) => {
      setBulkFixing(false);
      toast.error(`❌ שגיאה: ${err.message}`);
    }
  });

  const copyDebugReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      user: user?.email,
      healthStatus,
      problemTrainees,
      systemErrors: systemErrors?.slice(0, 20),
    };
    const text = JSON.stringify(report, null, 2);
    navigator.clipboard.writeText(text);
    toast.success('דוח Debug הועתק ללוח');
  };

  const copyTraineeDebug = (trainee) => {
    const correlationId = `DBG-${Date.now().toString(36)}`.toUpperCase();
    const report = {
      traineeId: trainee.id,
      email: trainee.user_email,
      issues: trainee.issues || [],
      user_id: trainee.user_id || null,
      visible_modules: trainee.visible_modules || null,
      home_layout_version: trainee.home_layout_version || null,
      lastError: trainee.lastError || null,
      correlationId,
      timestamp: new Date().toISOString(),
    };
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    toast.success(`📋 דוח Debug הועתק (${correlationId})`);
  };

  const runHealthcheck = async (fullScan = false) => {
    setHealthcheckLoading(true);
    try {
      const payload = fullScan 
        ? { full_scan: true }
        : { trainee_email: selectedTrainee };
      
      const response = await base44.functions.invoke('homeHealthcheck', payload);
      setHealthcheckResults(response.data);
      toast.success(`Healthcheck הושלם: ${response.data.passed} תקין, ${response.data.failed} כשלון`);
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    } finally {
      setHealthcheckLoading(false);
    }
  };

  const previewFix = async (traineeEmail, fixType) => {
    try {
      const response = await base44.functions.invoke('fixTraineeIssue', {
        trainee_email: traineeEmail,
        fix_type: fixType,
        preview_only: true
      });
      setPreviewData(response.data);
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    }
  };

  const applyFix = async (traineeEmail, fixType) => {
    try {
      const response = await base44.functions.invoke('fixTraineeIssue', {
        trainee_email: traineeEmail,
        fix_type: fixType,
        preview_only: false
      });
      toast.success('תיקון בוצע בהצלחה');
      setPreviewData(null);
      setHealthcheckResults(null);
      refetchProblems();
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    }
  };

  const { data: allTrainees } = useQuery({
    queryKey: ['allTraineesForHealthcheck'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
    enabled: !!user,
  });

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" dir="rtl">
        <Card className="p-8 text-center">
          <Shield className="w-16 h-16 mx-auto mb-4 text-red-500" />
          <h2 className="text-xl font-bold mb-2">גישה נדחתה</h2>
          <p className="text-slate-600">פאנל זה זמין רק למנהלי מערכת</p>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status) => {
    if (status === 'ok') return 'text-green-600';
    if (status === 'warning') return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = (status) => {
    if (status === 'ok') return <CheckCircle className="w-5 h-5 text-green-600" />;
    if (status === 'warning') return <AlertCircle className="w-5 h-5 text-yellow-600" />;
    return <XCircle className="w-5 h-5 text-red-600" />;
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Wrench className="w-8 h-8" style={{ color: '#79DBD6' }} />
            <h1 className="text-3xl font-bold" style={{ color: '#79DBD6' }}>טיפול במערכת</h1>
          </div>
          <p className="text-slate-600">כלי ניהול ותיקון מערכתי למנהלים</p>
        </div>

        {/* Global Recovery Button */}
        <Card className="mb-6 bg-gradient-to-r from-orange-50 to-red-50 border-2 border-orange-300">
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-orange-900 mb-2">החזר את המערכת למצב יציב</h3>
                <p className="text-sm text-orange-700">
                  מבצע תיקון בטוח: משלים user_id חסרים, יוצר יעדים דיפולטיביים, בודק קישורים
                </p>
              </div>
              <Button
                onClick={() => globalRecoveryMutation.mutate()}
                disabled={globalRecoveryMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white px-8 py-6 text-lg"
              >
                {globalRecoveryMutation.isPending ? (
                  <RefreshCw className="w-5 h-5 animate-spin ml-2" />
                ) : (
                  <Zap className="w-5 h-5 ml-2" />
                )}
                תקן הכל
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SECTION A: Global System Health */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                בריאות המערכת
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchHealth()}
                disabled={healthLoading}
              >
                <RefreshCw className={`w-4 h-4 ml-2 ${healthLoading ? 'animate-spin' : ''}`} />
                רענן
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {healthLoading ? (
              <div className="text-center py-8">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2 text-slate-400" />
                <p className="text-slate-600">בודק מערכת...</p>
              </div>
            ) : (
              <div className="grid md:grid-cols-2 gap-4">
                {healthStatus && Object.entries(healthStatus).map(([key, check]) => (
                  <div key={key} className="p-4 border rounded-lg bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(check.status)}
                        <span className="font-medium">{check.label || key}</span>
                      </div>
                      {check.status !== 'ok' && check.fixable && (
                        <Button size="sm" variant="outline">תקן</Button>
                      )}
                    </div>
                    {check.message && (
                      <p className={`text-sm ${getStatusColor(check.status)}`}>{check.message}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* HOME HEALTHCHECK SECTION */}
        <Card className="mb-6 border-2 border-blue-300">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="w-5 h-5 text-blue-600" />
              בדיקת Trainee Home
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex gap-3">
                <select 
                  value={selectedTrainee}
                  onChange={(e) => setSelectedTrainee(e.target.value)}
                  className="flex-1 border rounded px-3 py-2"
                >
                  <option value="">בחר מתאמן...</option>
                  {allTrainees?.map(t => (
                    <option key={t.id} value={t.user_email}>{t.full_name} ({t.user_email})</option>
                  ))}
                </select>
                <Button
                  onClick={() => runHealthcheck(false)}
                  disabled={!selectedTrainee || healthcheckLoading}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {healthcheckLoading ? <RefreshCw className="w-4 h-4 animate-spin ml-2" /> : <Activity className="w-4 h-4 ml-2" />}
                  בדוק מתאמן
                </Button>
                <Button
                  onClick={() => runHealthcheck(true)}
                  disabled={healthcheckLoading}
                  variant="outline"
                >
                  {healthcheckLoading ? <RefreshCw className="w-4 h-4 animate-spin ml-2" /> : <Database className="w-4 h-4 ml-2" />}
                  בדיקה מלאה
                </Button>
              </div>

              {/* Healthcheck Results */}
              {healthcheckResults && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-4 p-3 bg-slate-100 rounded">
                    <span className="text-sm font-medium">סה"כ נבדק:</span>
                    <span className="text-lg font-bold">{healthcheckResults.total_checked}</span>
                    <span className="text-sm text-green-600">✓ {healthcheckResults.passed}</span>
                    <span className="text-sm text-red-600">✗ {healthcheckResults.failed}</span>
                  </div>

                  {healthcheckResults.results?.map((result, idx) => (
                    <div key={idx} className={`p-4 border-2 rounded-lg ${result.status === 'PASS' ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <span className="font-medium">{result.trainee_email}</span>
                          <span className={`ml-3 px-2 py-1 text-xs rounded ${result.status === 'PASS' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}`}>
                            {result.status}
                          </span>
                        </div>
                        <span className="text-xs text-slate-500">{result.trainee_id}</span>
                      </div>

                      {result.failures?.length > 0 && (
                        <div className="space-y-2 mt-3">
                          {result.failures.map((failure, fidx) => (
                            <div key={fidx} className="p-3 bg-white border border-red-200 rounded text-sm">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1">
                                  <p className="font-medium text-red-700">{failure.code}</p>
                                  <p className="text-slate-700">{failure.message}</p>
                                  <details className="mt-1">
                                    <summary className="text-xs text-blue-600 cursor-pointer">פרטים טכניים</summary>
                                    <pre className="text-xs bg-slate-50 p-2 mt-1 overflow-x-auto">{failure.technical_details}</pre>
                                  </details>
                                </div>
                                <div className="flex gap-2">
                                  {failure.code === 'MISSING_USER_ID' && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => previewFix(result.trainee_email, 'fix_user_id')}>
                                        תצוגה מקדימה
                                      </Button>
                                      <Button size="sm" className="bg-orange-600" onClick={() => applyFix(result.trainee_email, 'fix_user_id')}>
                                        תקן user_id
                                      </Button>
                                    </>
                                  )}
                                  {(failure.code === 'MISSING_VISIBLE_MODULES' || failure.code === 'EMPTY_VISIBLE_MODULES') && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => previewFix(result.trainee_email, 'fix_visible_modules')}>
                                        תצוגה מקדימה
                                      </Button>
                                      <Button size="sm" className="bg-orange-600" onClick={() => applyFix(result.trainee_email, 'fix_visible_modules')}>
                                        תקן modules
                                      </Button>
                                    </>
                                  )}
                                  {failure.code === 'MISSING_HOME_LAYOUT' && (
                                    <>
                                      <Button size="sm" variant="outline" onClick={() => previewFix(result.trainee_email, 'fix_home_layout')}>
                                        תצוגה מקדימה
                                      </Button>
                                      <Button size="sm" className="bg-orange-600" onClick={() => applyFix(result.trainee_email, 'fix_home_layout')}>
                                        תקן layout
                                      </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Preview Modal */}
              {previewData && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewData(null)}>
                  <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                    <h3 className="text-xl font-bold mb-4">תצוגה מקדימה של שינויים</h3>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm font-medium mb-2">מתאמן: {previewData.trainee_email}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium mb-2">לפני:</p>
                          <pre className="text-xs bg-slate-100 p-3 rounded overflow-x-auto">{JSON.stringify(previewData.before_state, null, 2)}</pre>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-2">אחרי:</p>
                          <pre className="text-xs bg-green-50 p-3 rounded overflow-x-auto">{JSON.stringify(previewData.after_state, null, 2)}</pre>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">שינויים:</p>
                        <ul className="list-disc list-inside text-sm space-y-1">
                          {previewData.changes_applied?.map((change, idx) => (
                            <li key={idx}>{change}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="flex gap-3 justify-end">
                        <Button variant="outline" onClick={() => setPreviewData(null)}>ביטול</Button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* SECTION B: Trainees Issues */}
        <Card className="mb-6">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                מתאמנים עם בעיות ({problemTrainees?.length || 0})
              </CardTitle>
              {problemTrainees && problemTrainees.length > 0 && (
                <Button
                  onClick={() => bulkFixMutation.mutate()}
                  disabled={bulkFixing}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {bulkFixing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin ml-2" />
                      מתקן...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4 ml-2" />
                      הרץ תיקון לכל הרשימה
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {bulkProgress && (
              <div className="mb-4 p-4 bg-blue-50 border-2 border-blue-300 rounded-lg">
                <h4 className="font-bold mb-2">תוצאות תיקון מרוכז:</h4>
                <div className="grid grid-cols-4 gap-3 text-center">
                  <div>
                    <p className="text-2xl font-bold text-slate-700">{bulkProgress.total}</p>
                    <p className="text-xs text-slate-600">סה"כ</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-green-600">{bulkProgress.fixed}</p>
                    <p className="text-xs text-green-700">תוקנו</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{bulkProgress.failed}</p>
                    <p className="text-xs text-red-700">נכשלו</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-500">{bulkProgress.skipped}</p>
                    <p className="text-xs text-slate-600">דולגו</p>
                  </div>
                </div>
                {bulkProgress.details?.filter(d => d.error).length > 0 && (
                  <details className="mt-3">
                    <summary className="text-sm font-medium cursor-pointer text-red-700">רשימת כשלונות ({bulkProgress.details.filter(d => d.error).length})</summary>
                    <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                      {bulkProgress.details.filter(d => d.error).map((detail, idx) => (
                        <div key={idx} className="text-xs p-2 bg-red-50 border border-red-200 rounded">
                          <p className="font-medium">{detail.email}</p>
                          <p className="text-red-700">{detail.message || detail.error}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            )}

            {problemTrainees && problemTrainees.length > 0 ? (
              <div className="space-y-3">
                {problemTrainees.map((trainee) => {
                  const isFixing = fixingTrainee?.traineeId === trainee.id;
                  
                  return (
                    <div key={trainee.id} className="p-4 border rounded-lg bg-yellow-50">
                      <div className="flex items-center justify-between mb-2">
                        <div>
                          <p className="font-medium">{trainee.full_name}</p>
                          <p className="text-sm text-slate-600">{trainee.user_email}</p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyTraineeDebug(trainee)}
                            title="העתק דוח Debug"
                          >
                            <Copy className="w-4 h-4" />
                          </Button>
                          {trainee.issues?.includes('missing_user_id') && (
                            <Button
                              size="sm"
                              onClick={() => fixTraineeMutation.mutate({ 
                                traineeId: trainee.id, 
                                traineeEmail: trainee.user_email,
                                action: 'fix_user_id' 
                              })}
                              disabled={isFixing}
                              className="bg-orange-600 hover:bg-orange-700 text-white"
                            >
                              {isFixing && fixingTrainee.action === 'fix_user_id' ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin ml-1" />
                                  מתקן...
                                </>
                              ) : (
                                'תקן user_id'
                              )}
                            </Button>
                          )}
                          {trainee.issues?.includes('missing_visible_modules') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fixTraineeMutation.mutate({ 
                                traineeId: trainee.id,
                                traineeEmail: trainee.user_email,
                                action: 'restore_home_modules' 
                              })}
                              disabled={isFixing}
                            >
                              {isFixing && fixingTrainee.action === 'restore_home_modules' ? (
                                <>
                                  <Loader2 className="w-3 h-3 animate-spin ml-1" />
                                  משחזר...
                                </>
                              ) : (
                                'שחזר Home Modules'
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {trainee.issues?.map((issue, idx) => (
                          <span key={idx} className="text-xs px-2 py-1 bg-yellow-200 text-yellow-800 rounded">
                            {issue}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-600">
                <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500" />
                <p>כל המתאמנים תקינים</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION C: Home Recovery Tools */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Home className="w-5 h-5" />
              כלי שחזור דף הבית
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4">
              <Button variant="outline" className="h-auto py-4 flex flex-col items-start">
                <span className="font-medium mb-1">Safe Mode Home</span>
                <span className="text-xs text-slate-600">טען דף בית מינימלי שתמיד עובד</span>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex flex-col items-start">
                <span className="font-medium mb-1">שחזר Layout אחרון</span>
                <span className="text-xs text-slate-600">חזור לגרסה עובדת אחרונה</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* SECTION D: Debug & Logs */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5" />
                לוגים ודיבאג
              </CardTitle>
              <Button size="sm" onClick={copyDebugReport}>
                <Download className="w-4 h-4 ml-2" />
                העתק דוח Debug
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {systemErrors?.length > 0 ? (
                systemErrors.map((log) => (
                  <div key={log.id} className="p-3 bg-red-50 border border-red-200 rounded text-sm">
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-red-800">{log.action_type}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(log.created_date).toLocaleString('he-IL')}
                      </span>
                    </div>
                    {log.debug_id && (
                      <p className="text-xs text-slate-500 mb-1">Debug ID: {log.debug_id}</p>
                    )}
                    {log.error_code && (
                      <p className="text-xs text-orange-700 mb-1">Code: {log.error_code}</p>
                    )}
                    {log.error_message_he && (
                      <p className="text-red-700 text-xs mb-1">{log.error_message_he}</p>
                    )}
                    {log.trainee_email && (
                      <p className="text-xs text-slate-600">מתאמן: {log.trainee_email}</p>
                    )}
                    {log.details && (
                      <details className="mt-2">
                        <summary className="text-xs text-blue-600 cursor-pointer">הצג פרטים טכניים</summary>
                        <pre className="text-xs bg-slate-100 p-2 mt-1 overflow-x-auto rounded">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      </details>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center py-8 text-slate-600">אין שגיאות מערכת</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}