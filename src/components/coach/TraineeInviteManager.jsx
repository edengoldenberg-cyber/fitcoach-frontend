import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { UserCheck, UserX, Mail, RefreshCw, Zap } from 'lucide-react';

const STATUS_LABELS = {
  joined: { label: 'מחובר', color: 'bg-green-100 text-green-700' },
  invited: { label: 'הוזמן', color: 'bg-blue-100 text-blue-700' },
  no_auth: { label: 'לא נרשם', color: 'bg-red-100 text-red-700' },
};

function TraineeRow({ trainee, onFixed }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleFix = async () => {
    setLoading(true);
    setResult(null);
    try {
      const res = await base44.functions.invoke('fixSingleTraineeUserId', { trainee_id: trainee.id });
      setResult(res.data);
      if (res.data.success) {
        toast.success(`${trainee.full_name}: ${res.data.message}`);
        onFixed?.();
      } else {
        toast.warning(`${trainee.full_name}: ${res.data.message}`);
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('resendTraineeInvite', { trainee_id: trainee.id });
      if (res.data.summary?.sent > 0) {
        toast.success(`הזמנה נשלחה ל-${trainee.user_email}`);
        onFixed?.();
      } else {
        toast.error('שליחה נכשלה: ' + (res.data.results?.failed?.[0]?.error || 'שגיאה'));
      }
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const statusInfo = STATUS_LABELS[trainee.invite_status] || 
    (trainee.user_id ? STATUS_LABELS.joined : STATUS_LABELS.no_auth);

  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-0">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 text-sm">{trainee.full_name}</p>
        <p className="text-xs text-slate-500 truncate">{trainee.user_email}</p>
        {trainee.invite_last_error && (
          <p className="text-xs text-red-500 mt-0.5 truncate">{trainee.invite_last_error}</p>
        )}
      </div>

      <div className="flex-shrink-0">
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusInfo.color}`}>
          {statusInfo.label}
        </span>
      </div>

      <div className="flex gap-1 flex-shrink-0">
        {!trainee.user_id && (
          <Button
            size="sm"
            variant="outline"
            className="h-8 px-2 text-xs gap-1 border-blue-300 text-blue-700"
            onClick={handleFix}
            disabled={loading}
          >
            <Zap className="w-3 h-3" />
            Fix ID
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          className="h-8 px-2 text-xs gap-1 border-teal-300 text-teal-700"
          onClick={handleResend}
          disabled={loading}
        >
          <Mail className="w-3 h-3" />
          {loading ? '...' : 'Resend'}
        </Button>
      </div>
    </div>
  );
}

export default function TraineeInviteManager() {
  const queryClient = useQueryClient();
  const [bulkLoading, setBulkLoading] = useState(false);
  const [backfillLoading, setBackfillLoading] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);

  const { data: trainees = [], refetch } = useQuery({
    queryKey: ['traineeInviteManager'],
    queryFn: () => base44.entities.Trainee.list('-created_date', 200),
  });

  const noAuthTrainees = trainees.filter(t => !t.user_id || t.invite_status === 'no_auth');
  const invitedTrainees = trainees.filter(t => !t.user_id && t.invite_status === 'invited');
  const joinedTrainees = trainees.filter(t => t.user_id);

  const handleBulkResend = async () => {
    setBulkLoading(true);
    try {
      const res = await base44.functions.invoke('resendTraineeInvite', { bulk: true });
      const { sent, failed } = res.data.summary;
      toast.success(`נשלחו ${sent} הזמנות${failed > 0 ? ` (${failed} נכשלו)` : ''}`);
      refetch();
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBackfill = async () => {
    setBackfillLoading(true);
    setBackfillResult(null);
    try {
      const res = await base44.functions.invoke('backfillTraineeUserIds', {});
      setBackfillResult(res.data.summary);
      toast.success(`Backfill הושלם: ${res.data.summary.fixed} קושרו`);
      refetch();
    } catch (e) {
      toast.error('שגיאה: ' + e.message);
    } finally {
      setBackfillLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-teal-600" />
            ניהול הזמנות ו-User ID
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {joinedTrainees.length} מחוברים · {noAuthTrainees.length} ללא Auth · {invitedTrainees.length} הוזמנו
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handleBackfill}
            disabled={backfillLoading}
            className="gap-1 text-xs"
          >
            <RefreshCw className={`w-3 h-3 ${backfillLoading ? 'animate-spin' : ''}`} />
            Backfill All
          </Button>
          {noAuthTrainees.length > 0 && (
            <Button
              size="sm"
              onClick={handleBulkResend}
              disabled={bulkLoading}
              className="gap-1 text-xs bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Mail className="w-3 h-3" />
              {bulkLoading ? 'שולח...' : `שלח הזמנות (${noAuthTrainees.length})`}
            </Button>
          )}
        </div>
      </div>

      {backfillResult && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm">
          <p className="font-medium text-blue-800">תוצאות Backfill:</p>
          <p className="text-blue-700">
            סה"כ: {backfillResult.total} · קושרו: {backfillResult.fixed} ·
            ללא Auth: {backfillResult.missingAuthUser} · כבר קושרו: {backfillResult.alreadyLinked}
          </p>
        </div>
      )}

      {noAuthTrainees.length === 0 ? (
        <div className="text-center py-6 text-slate-500">
          <UserCheck className="w-10 h-10 mx-auto mb-2 text-green-400" />
          <p className="text-sm font-medium text-green-600">כל המתאמנים מקושרים ✅</p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-medium text-red-700 mb-2 flex items-center gap-1">
            <UserX className="w-4 h-4" />
            מתאמנים ללא Auth ({noAuthTrainees.length}):
          </p>
          <div className="max-h-80 overflow-y-auto">
            {noAuthTrainees.map(t => (
              <TraineeRow key={t.id} trainee={t} onFixed={refetch} />
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}