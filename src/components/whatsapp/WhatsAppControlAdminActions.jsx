import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function WhatsAppControlAdminActions({ coachEmail }) {
  const [loadingAction, setLoadingAction] = useState(null);

  const { data: queue, refetch: refetchQueue } = useQuery({
    queryKey: ['whatsappQueue', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
  });

  const runWorkerManually = async () => {
    try {
      setLoadingAction('worker');
      const response = await base44.functions.invoke('whatsAppQueueWorker', {});
      if (response.data?.ok) {
        toast.success(`✅ Worker completed: ${response.data.sent} sent, ${response.data.failed} failed`);
        refetchQueue();
      } else {
        toast.error('Worker execution failed');
      }
    } catch (err) {
      toast.error('Error running worker: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const retryAllFailures = async () => {
    try {
      setLoadingAction('retry-all');
      const retryable = queue.filter(m => m.status === 'failed' && (m.attempts || 0) < 3);
      
      for (const item of retryable) {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(item.id, {
          status: 'queued',
          attempts: (item.attempts || 0) + 1,
          error_message: null,
        });
      }
      
      toast.success(`✅ ${retryable.length} items queued for retry`);
      refetchQueue();
    } catch (err) {
      toast.error('Error retrying: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  const clearStaleQueued = async () => {
    try {
      setLoadingAction('clear-stale');
      const stale = queue.filter(m => {
        if (m.status !== 'queued') return false;
        const age = Date.now() - new Date(m.created_date).getTime();
        return age > 3600000; // > 1 hour
      });

      for (const item of stale) {
        await base44.asServiceRole.entities.WhatsAppMessageQueue.update(item.id, {
          status: 'cancelled',
          error_message: 'ADMIN: Stale queued item cancelled',
        });
      }

      toast.success(`✅ ${stale.length} stale items cancelled`);
      refetchQueue();
    } catch (err) {
      toast.error('Error clearing stale items: ' + err.message);
    } finally {
      setLoadingAction(null);
    }
  };

  if (!queue) return <div className="text-center py-8 text-slate-500">Loading actions...</div>;

  const retryable = queue.filter(m => m.status === 'failed' && (m.attempts || 0) < 3).length;
  const stale = queue.filter(m => {
    if (m.status !== 'queued') return false;
    const age = Date.now() - new Date(m.created_date).getTime();
    return age > 3600000;
  }).length;

  return (
    <div className="space-y-6">
      {/* Safety Notice */}
      <Card className="p-4 border-amber-200 bg-amber-50">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-900">⚠️ Admin Actions</p>
            <p className="text-xs text-amber-800 mt-1">These actions only affect queue items. They cannot damage leads, flows, or conversation history.</p>
          </div>
        </div>
      </Card>

      {/* Worker Control */}
      <Card className="p-6">
        <h3 className="text-sm font-semibold text-slate-900 mb-2">Run Worker Manually</h3>
        <p className="text-xs text-slate-600 mb-4">Process all pending queued messages immediately (normally runs on schedule).</p>
        <Button
          onClick={runWorkerManually}
          disabled={loadingAction === 'worker'}
          className="w-full bg-blue-600 hover:bg-blue-700"
        >
          {loadingAction === 'worker' ? 'Running...' : '▶️ Run Worker Now'}
        </Button>
      </Card>

      {/* Retry Failed Items */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Retry Failed Items</h3>
            <p className="text-xs text-slate-600 mt-1">Re-queue failed messages that haven't exceeded max retries.</p>
          </div>
          {retryable > 0 && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
        </div>
        <p className="text-sm font-medium text-slate-700 mb-4">{retryable} retryable items found</p>
        <Button
          onClick={retryAllFailures}
          disabled={retryable === 0 || loadingAction === 'retry-all'}
          className="w-full"
          variant={retryable > 0 ? 'default' : 'outline'}
        >
          {loadingAction === 'retry-all' ? 'Retrying...' : `🔄 Retry ${retryable} Items`}
        </Button>
      </Card>

      {/* Clear Stale Queued */}
      <Card className="p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Clear Stale Queued</h3>
            <p className="text-xs text-slate-600 mt-1">Cancel messages queued for &gt; 1 hour (likely stuck).</p>
          </div>
          {stale > 0 && <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />}
        </div>
        <p className="text-sm font-medium text-slate-700 mb-4">{stale} stale items found</p>
        <Button
          onClick={clearStaleQueued}
          disabled={stale === 0 || loadingAction === 'clear-stale'}
          className="w-full"
          variant={stale > 0 ? 'default' : 'outline'}
        >
          {loadingAction === 'clear-stale' ? 'Clearing...' : `🗑️ Cancel ${stale} Stale Items`}
        </Button>
      </Card>

      {/* Safe Info */}
      <Card className="p-4 border-green-200 bg-green-50">
        <div className="flex gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">✅ Safe Operations</p>
            <p className="text-xs text-green-800 mt-1">All actions are limited to queue management and cannot modify leads, flows, AI logic, or configuration.</p>
          </div>
        </div>
      </Card>
    </div>
  );
}