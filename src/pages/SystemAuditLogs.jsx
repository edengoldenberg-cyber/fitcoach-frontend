import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle, AlertTriangle, Copy, Filter } from "lucide-react";
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';

export default function SystemAuditLogs() {
  const [traineeFilter, setTraineeFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => base44.entities.SystemAuditLog.list('-created_date', 100),
    enabled: !!user?.email,
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const filteredLogs = logs.filter(log => {
    if (traineeFilter && log.trainee_email !== traineeFilter) return false;
    if (actionFilter !== 'all' && log.action_type !== actionFilter) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    return true;
  });

  const copyReport = (log) => {
    const report = `
דוח תקלה מערכת FIT COACH PRO
=================================
מזהה תקלה: ${log.debug_id}
זמן: ${format(new Date(log.created_date), 'dd/MM/yyyy HH:mm:ss', { locale: he })}
סוג פעולה: ${log.action_type}
סטטוס: ${log.status}
קוד שגיאה: ${log.error_code || 'N/A'}
הודעה: ${log.error_message_he || 'N/A'}

פרטים נוספים:
מתאמן: ${log.trainee_email || 'N/A'}
מבצע: ${log.actor_email || 'N/A'}
אימון מקור: ${log.source_workout_id || 'N/A'}
אימון יעד: ${log.target_workout_id || 'N/A'}

סיכום payload:
תרגילים: ${log.payload_summary?.exercises_count || 'N/A'}
סטים: ${log.payload_summary?.sets_count || 'N/A'}

Details (JSON):
${JSON.stringify(log.details, null, 2)}
=================================
    `.trim();
    
    navigator.clipboard.writeText(report);
    alert('✅ הדוח הועתק ללוח');
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'fail':
        return <AlertCircle className="w-4 h-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status) => {
    const variants = {
      success: 'bg-green-100 text-green-800',
      fail: 'bg-red-100 text-red-800',
      warning: 'bg-yellow-100 text-yellow-800',
    };
    
    const labels = {
      success: 'הצלחה',
      fail: 'כשל',
      warning: 'אזהרה',
    };
    
    return (
      <Badge className={variants[status] || 'bg-slate-100 text-slate-800'}>
        {labels[status] || status}
      </Badge>
    );
  };

  const actionLabels = {
    PUBLISH_DAILY_WORKOUT: 'פרסום אימון יומי',
    COPY_DAILY_TO_TRAINEE: 'העתקה למתאמן',
    SAVE_WORKOUT: 'שמירת אימון',
    DELETE_WORKOUT: 'מחיקת אימון',
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-100 p-6" dir="rtl">
        <div className="max-w-6xl mx-auto">
          <p className="text-center text-slate-500">טוען לוגים...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-slate-100 p-6 pb-24" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-4">
        <Card className="bg-white border-0 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-orange-600">
              <AlertCircle className="w-6 h-6" />
              דוחות מערכת - Audit Logs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div>
                <label className="text-sm font-medium mb-2 block">מתאמן</label>
                <Select value={traineeFilter} onValueChange={setTraineeFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="כל המתאמנים" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>כל המתאמנים</SelectItem>
                    {trainees.map(t => (
                      <SelectItem key={t.user_email} value={t.user_email}>
                        {t.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">סוג פעולה</label>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="כל הפעולות" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הפעולות</SelectItem>
                    <SelectItem value="PUBLISH_DAILY_WORKOUT">פרסום אימון יומי</SelectItem>
                    <SelectItem value="COPY_DAILY_TO_TRAINEE">העתקה למתאמן</SelectItem>
                    <SelectItem value="SAVE_WORKOUT">שמירת אימון</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <label className="text-sm font-medium mb-2 block">סטטוס</label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger>
                    <SelectValue placeholder="כל הסטטוסים" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    <SelectItem value="success">הצלחות</SelectItem>
                    <SelectItem value="fail">כשלים</SelectItem>
                    <SelectItem value="warning">אזהרות</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              {filteredLogs.length === 0 ? (
                <p className="text-center text-slate-500 py-6">אין לוגים להצגה</p>
              ) : (
                filteredLogs.slice(0, 50).map(log => (
                  <div
                    key={log.id}
                    className={`p-4 rounded-lg border transition-colors ${
                      log.status === 'fail' ? 'bg-red-50 border-red-200' : 
                      log.status === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(log.status)}
                        <span className="font-medium text-sm">
                          {actionLabels[log.action_type] || log.action_type}
                        </span>
                        {getStatusBadge(log.status)}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">
                          {format(new Date(log.created_date), 'dd/MM HH:mm', { locale: he })}
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyReport(log)}
                          className="h-7 w-7 p-0"
                        >
                          <Copy className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>

                    <div className="text-xs space-y-1">
                      {log.debug_id && (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-500">מזהה:</span>
                          <code className="bg-slate-100 px-2 py-0.5 rounded font-mono">
                            {log.debug_id}
                          </code>
                        </div>
                      )}
                      
                      {log.trainee_email && (
                        <div>
                          <span className="text-slate-500">מתאמן: </span>
                          <span className="font-medium">{log.trainee_email}</span>
                        </div>
                      )}
                      
                      {log.error_code && (
                        <div>
                          <span className="text-slate-500">קוד שגיאה: </span>
                          <code className="bg-red-100 text-red-800 px-2 py-0.5 rounded font-mono">
                            {log.error_code}
                          </code>
                        </div>
                      )}
                      
                      {log.error_message_he && (
                        <div className="text-red-700 font-medium mt-1">
                          {log.error_message_he}
                        </div>
                      )}
                      
                      {log.payload_summary && (
                        <div className="flex gap-3 mt-2">
                          {log.payload_summary.exercises_count !== undefined && (
                            <span className="text-slate-600">
                              תרגילים: {log.payload_summary.exercises_count}
                            </span>
                          )}
                          {log.payload_summary.sets_count !== undefined && (
                            <span className="text-slate-600">
                              סטים: {log.payload_summary.sets_count}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}