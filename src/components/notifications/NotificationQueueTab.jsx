import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  Play, 
  RefreshCw, 
  X, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Loader2,
  Filter
} from "lucide-react";
import CoachManualNotificationUI from './CoachManualNotificationUI';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { toast } from 'sonner';

export default function NotificationQueueTab() {
  const queryClient = useQueryClient();
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [filterUser, setFilterUser] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);

  // Fetch trainees for autocomplete
  const { data: allTrainees = [] } = useQuery({
    queryKey: ['allTrainees'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
  });

  // Fetch notification jobs
  const { data: allJobs = [], isLoading } = useQuery({
    queryKey: ['notificationJobs'],
    queryFn: () => base44.entities.NotificationJob.list('-created_date', 200),
    refetchInterval: 5000 // Refresh every 5 seconds
  });

  // Filter trainees based on search
  const filteredTrainees = allTrainees.filter(trainee => {
    if (!searchQuery) return false;
    const query = searchQuery.toLowerCase();
    return (
      trainee.full_name?.toLowerCase().includes(query) ||
      trainee.user_email?.toLowerCase().includes(query) ||
      trainee.phone?.toLowerCase().includes(query)
    );
  }).slice(0, 10);

  // Filter jobs
  const filteredJobs = allJobs.filter(job => {
    if (filterStatus !== 'all' && job.status !== filterStatus) return false;
    if (filterType !== 'all' && job.type !== filterType) return false;
    if (filterUser && !job.user_email?.includes(filterUser) && !job.trainee_name?.includes(filterUser)) return false;
    return true;
  });

  // Create test jobs mutation
  const createTestJobsMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTrainee) {
        throw new Error('יש לבחור מתאמן');
      }
      const result = await base44.functions.invoke('createNotificationJobs', {
        isTest: true,
        testUserEmail: selectedTrainee.user_email
      });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה ביצירת התראות');
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      toast.success(`נוצרו ${data.created} התראות בדיקה עבור ${selectedTrainee.full_name}`);
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const handleSelectTrainee = (trainee) => {
    setSelectedTrainee(trainee);
    setSearchQuery(trainee.full_name);
    setShowDropdown(false);
  };

  // Process queue mutation
  const processQueueMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('processNotificationQueue', {});
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה בעיבוד התור');
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      toast.success(`עובדו ${data.processed} התראות (${data.results.sent} נשלחו)`);
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Retry job mutation
  const retryJobMutation = useMutation({
    mutationFn: async (jobId) => {
      const result = await base44.functions.invoke('retryNotificationJob', { jobId });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה בניסיון חוזר');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      toast.success('התראה הוחזרה לתור');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Cancel job mutation
  const cancelJobMutation = useMutation({
    mutationFn: async (jobId) => {
      const result = await base44.functions.invoke('cancelNotificationJob', { jobId });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה בביטול');
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      toast.success('התראה בוטלה');
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  // Clean old jobs mutation
  const cleanOldJobsMutation = useMutation({
    mutationFn: async () => {
      const result = await base44.functions.invoke('cleanOldNotificationJobs', { daysOld: 7 });
      if (!result.data?.success) {
        throw new Error(result.data?.error || 'שגיאה בניקוי');
      }
      return result.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notificationJobs'] });
      toast.success(data.message);
    },
    onError: (error) => {
      toast.error(`שגיאה: ${error.message}`);
    }
  });

  const getStatusBadge = (status) => {
    const variants = {
      queued: { color: 'bg-blue-100 text-blue-700', icon: Clock },
      processing: { color: 'bg-yellow-100 text-yellow-700', icon: Loader2 },
      sent: { color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
      failed: { color: 'bg-red-100 text-red-700', icon: AlertCircle },
      skipped: { color: 'bg-gray-100 text-gray-700', icon: X },
      deduped: { color: 'bg-purple-100 text-purple-700', icon: AlertCircle },
      cancelled: { color: 'bg-slate-100 text-slate-700', icon: X }
    };

    const variant = variants[status] || variants.queued;
    const Icon = variant.icon;

    return (
      <Badge className={`${variant.color} flex items-center gap-1`}>
        <Icon className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const getTypeLabel = (type) => {
    const labels = {
      meal_missing: '🍽️ ארוחה חסרה',
      workout_missing: '💪 אימון חסר',
      water_missing: '💧 מים חסרים',
      weigh_in_missing: '⚖️ שקילה חסרה',
      weekly_summary: '📊 סיכום שבועי',
      system_alert: '⚠️ התראת מערכת',
      custom: '✉️ מותאם אישית',
      coach_message: '👨‍🏫 הודעת מאמן'
    };
    return labels[type] || type;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Coach Manual UI - New Section */}
      <CoachManualNotificationUI />

      {/* Divider */}
      <div className="border-t-4 border-slate-200 pt-6">
        <h3 className="text-lg font-bold text-slate-700 mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          כלי בדיקה מתקדמים (Debug)
        </h3>
      </div>

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">בקרה ובדיקות</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Test Section */}
          <div className="space-y-3">
            <div className="relative">
              <label className="text-sm font-medium text-slate-700 mb-1.5 block">
                חיפוש מתאמן לבדיקה *
              </label>
              <Input
                placeholder="הקלד שם, מייל או טלפון של מתאמן..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setShowDropdown(true);
                  if (!e.target.value) setSelectedTrainee(null);
                }}
                onFocus={() => setShowDropdown(true)}
                className="w-full"
              />
              
              {/* Dropdown */}
              {showDropdown && searchQuery && (
                <div className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                  {filteredTrainees.length > 0 ? (
                    filteredTrainees.map((trainee) => (
                      <button
                        key={trainee.id}
                        onClick={() => handleSelectTrainee(trainee)}
                        className="w-full text-right px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 transition-colors"
                      >
                        <div className="font-medium text-slate-800">{trainee.full_name}</div>
                        <div className="text-sm text-slate-500">{trainee.user_email}</div>
                        {trainee.phone && (
                          <div className="text-xs text-slate-400">{trainee.phone}</div>
                        )}
                      </button>
                    ))
                  ) : (
                    <div className="px-4 py-3 text-center text-slate-500">
                      לא נמצאו מתאמנים
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Selected Trainee Display */}
            {selectedTrainee && (
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-sm font-medium text-green-800 mb-2">✓ מתאמן נבחר:</div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">שם:</span>
                    <span className="font-medium text-slate-800">{selectedTrainee.full_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">מייל:</span>
                    <span className="font-medium text-slate-800">{selectedTrainee.user_email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">User ID:</span>
                    <span className="font-mono text-xs text-slate-600">{selectedTrainee.user_id || 'N/A'}</span>
                  </div>
                </div>
              </div>
            )}

            <Button
              onClick={() => createTestJobsMutation.mutate()}
              disabled={createTestJobsMutation.isPending || !selectedTrainee}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300"
            >
              {createTestJobsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Play className="w-4 h-4 ml-2" />
              )}
              הרץ בדיקה (TEST)
            </Button>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => processQueueMutation.mutate()}
              disabled={processQueueMutation.isPending}
              variant="outline"
            >
              {processQueueMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <RefreshCw className="w-4 h-4 ml-2" />
              )}
              עבד תור התראות
            </Button>

            <Button
              onClick={() => cleanOldJobsMutation.mutate()}
              disabled={cleanOldJobsMutation.isPending}
              variant="outline"
            >
              {cleanOldJobsMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin ml-2" />
              ) : (
                <Trash2 className="w-4 h-4 ml-2" />
              )}
              נקה תור ישן (7+ ימים)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Filter className="w-5 h-5" />
            סינון
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-sm text-slate-600 mb-1 block">סטטוס</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="all">הכל</option>
                <option value="queued">queued</option>
                <option value="processing">processing</option>
                <option value="sent">sent</option>
                <option value="failed">failed</option>
                <option value="skipped">skipped</option>
                <option value="deduped">deduped</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-600 mb-1 block">סוג</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="w-full rounded-md border border-slate-300 px-3 py-2"
              >
                <option value="all">הכל</option>
                <option value="meal_missing">ארוחה חסרה</option>
                <option value="workout_missing">אימון חסר</option>
                <option value="water_missing">מים חסרים</option>
                <option value="weigh_in_missing">שקילה חסרה</option>
              </select>
            </div>

            <div>
              <label className="text-sm text-slate-600 mb-1 block">מתאמן</label>
              <Input
                placeholder="חיפוש לפי שם או מייל"
                value={filterUser}
                onChange={(e) => setFilterUser(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-slate-600">
            מציג {filteredJobs.length} מתוך {allJobs.length} התראות
          </div>
        </CardContent>
      </Card>

      {/* Jobs Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">תור התראות</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredJobs.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                אין התראות בתור
              </div>
            ) : (
              filteredJobs.map((job) => (
                <div
                  key={job.id}
                  className="border rounded-lg p-4 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-2">
                      {/* Header */}
                      <div className="flex items-center gap-2 flex-wrap">
                        {getStatusBadge(job.status)}
                        <span className="text-sm font-medium">{getTypeLabel(job.type)}</span>
                        <Badge variant="outline" className="text-xs">{job.channel}</Badge>
                        {job.is_test && (
                          <Badge className="bg-orange-100 text-orange-700 text-xs">TEST</Badge>
                        )}
                      </div>

                      {/* User Info */}
                      <div className="text-sm text-slate-700">
                        <span className="font-medium">{job.trainee_name || 'לא ידוע'}</span>
                        <span className="text-slate-500 mx-2">•</span>
                        <span className="text-slate-500">{job.user_email}</span>
                      </div>

                      {/* Payload Preview */}
                      {job.payload?.title_he && (
                        <div className="text-sm bg-slate-50 p-2 rounded">
                          <div className="font-medium text-slate-700">{job.payload.title_he}</div>
                          {job.payload.body_he && (
                            <div className="text-slate-600 text-xs mt-1 line-clamp-2">
                              {job.payload.body_he}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Error Message */}
                      {job.error_message && (
                        <div className="text-sm text-red-600 bg-red-50 p-2 rounded flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <div>
                            <div className="font-medium">{job.error_code}</div>
                            <div>{job.error_message}</div>
                          </div>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                        <span>נוצר: {format(new Date(job.created_date), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                        {job.sent_at && (
                          <span>נשלח: {format(new Date(job.sent_at), 'dd/MM/yyyy HH:mm', { locale: he })}</span>
                        )}
                        <span>ניסיונות: {job.attempts || 0}</span>
                        {job.dedupe_key && (
                          <span className="text-purple-600">🔑 {job.dedupe_key.slice(-8)}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2">
                      {job.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => retryJobMutation.mutate(job.id)}
                          disabled={retryJobMutation.isPending}
                        >
                          <RefreshCw className="w-3 h-3" />
                        </Button>
                      )}
                      {job.status === 'queued' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => cancelJobMutation.mutate(job.id)}
                          disabled={cancelJobMutation.isPending}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}