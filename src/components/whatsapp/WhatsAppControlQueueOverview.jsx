import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = { queued: '#f59e0b', sending: '#3b82f6', sent: '#10b981', failed: '#ef4444', cancelled: '#6b7280' };

export default function WhatsAppControlQueueOverview({ coachEmail, autoRefresh }) {
  const { data: queue } = useQuery({
    queryKey: ['whatsappQueue', coachEmail],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  if (!queue) return <div className="text-center py-8 text-slate-500">Loading queue...</div>;

  const stats = {
    queued: queue.filter(m => m.status === 'queued').length,
    sending: queue.filter(m => m.status === 'sending').length,
    sent: queue.filter(m => m.status === 'sent').length,
    failed: queue.filter(m => m.status === 'failed').length,
    cancelled: queue.filter(m => m.status === 'cancelled').length,
  };

  const chartData = Object.entries(stats).map(([key, value]) => ({ name: key, value }));

  const staleQueued = queue.filter(m => {
    if (m.status !== 'queued') return false;
    const age = Date.now() - new Date(m.created_date).getTime();
    return age > 3600000; // > 1 hour
  });

  const retryableFailures = queue.filter(m => {
    if (m.status !== 'failed') return false;
    return (m.attempts || 0) < 3;
  });

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {Object.entries(stats).map(([status, count]) => (
          <Card key={status} className="p-4 text-center">
            <p className="text-2xl font-bold text-slate-900">{count}</p>
            <p className="text-xs text-slate-500 capitalize mt-1">{status}</p>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Queue Distribution</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={chartData} cx="50%" cy="50%" labelLine={false} label={({ name, value }) => `${name}: ${value}`} outerRadius={80} fill="#8884d8" dataKey="value">
                {Object.entries(COLORS).map(([key, color]) => (
                  <Cell key={key} fill={color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Status Breakdown</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Alerts */}
      {staleQueued.length > 0 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <p className="text-sm font-medium text-amber-900 mb-2">⚠️ Stale Queued Items</p>
          <p className="text-xs text-amber-800">{staleQueued.length} messages queued for &gt; 1 hour. Consider running worker manually.</p>
        </Card>
        )}

        {retryableFailures.length > 0 && (
        <Card className="p-4 border-blue-200 bg-blue-50">
          <p className="text-sm font-medium text-blue-900 mb-2">ℹ️ Retryable Failures</p>
          <p className="text-xs text-blue-800">{retryableFailures.length} failed messages can be retried (&lt; 3 attempts).</p>
        </Card>
        )}
    </div>
  );
}