import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, TrendingUp, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';

export default function WhatsAppSystemDashboard() {
  const { data: queueItems, isLoading } = useQuery({
    queryKey: ['whatsappQueue'],
    queryFn: () => base44.entities.WhatsAppMessageQueue.list(),
    refetchInterval: 10000,
  });

  const { data: messages } = useQuery({
    queryKey: ['messages'],
    queryFn: () => base44.entities.LeadMessageThread.list(),
    refetchInterval: 10000,
  });

  const { data: leads } = useQuery({
    queryKey: ['leads'],
    queryFn: () => base44.entities.Lead.list(),
  });

  if (isLoading) return <Loader2 className="w-4 h-4 animate-spin" />;

  // Queue Metrics
  const queueMetrics = {
    queued: queueItems?.filter(q => q.status === 'queued').length || 0,
    sending: queueItems?.filter(q => q.status === 'sending').length || 0,
    sent: queueItems?.filter(q => q.status === 'sent').length || 0,
    failed: queueItems?.filter(q => q.status === 'failed').length || 0,
  };

  // Lead Status Dashboard
  const leadStatusMetrics = {
    NEW: leads?.filter(l => l.status === 'NEW').length || 0,
    CONTACTED: leads?.filter(l => l.status === 'CONTACTED').length || 0,
    INTERESTED: leads?.filter(l => l.status === 'INTERESTED').length || 0,
    CALL_REQUESTED: leads?.filter(l => l.status === 'CALL_REQUESTED').length || 0,
    BOOKED: leads?.filter(l => l.status === 'BOOKED').length || 0,
    CLOSED: leads?.filter(l => l.status === 'CLOSED').length || 0,
  };

  const queueChartData = Object.entries(queueMetrics).map(([key, value]) => ({
    name: key.toUpperCase(),
    count: value,
  }));

  const leadChartData = Object.entries(leadStatusMetrics).map(([key, value]) => ({
    name: key.replace(/_/g, ' '),
    value,
  }));

  const colors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#6366f1'];

  return (
    <div className="space-y-6">
      {/* Queue Metrics */}
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(queueMetrics).map(([key, value]) => (
          <Card key={key} className="p-4">
            <div className="text-xs text-slate-600 uppercase font-semibold">{key}</div>
            <div className="text-3xl font-bold text-slate-900 mt-2">{value}</div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-bold mb-4">Queue Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={queueChartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <h3 className="font-bold mb-4">Lead Status Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie data={leadChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                {leadChartData.map((_, idx) => (
                  <Cell key={idx} fill={colors[idx % colors.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Message Stream */}
      <Card className="p-4">
        <h3 className="font-bold mb-4">Recent Messages</h3>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {messages?.slice(0, 20).map(msg => (
            <div key={msg.id} className="p-2 bg-slate-50 rounded text-xs border border-slate-200">
              <div className="flex justify-between mb-1">
                <span className="font-mono text-slate-700">{msg.leadId?.slice(0, 8)}</span>
                <Badge variant={msg.direction === 'INBOUND' ? 'default' : 'secondary'}>
                  {msg.direction}
                </Badge>
              </div>
              <div className="text-slate-600 truncate">{msg.messageText?.slice(0, 80)}</div>
              <div className="text-slate-500">{format(new Date(msg.messageTimestamp), 'PPp')}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Warnings */}
      {queueMetrics.failed > 0 && (
        <Card className="p-4 border-red-200 bg-red-50">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm text-red-900">{queueMetrics.failed} Failed Messages</div>
              <div className="text-xs text-red-700">Check error details and retry</div>
            </div>
          </div>
        </Card>
      )}

      {queueMetrics.queued > 10 && (
        <Card className="p-4 border-amber-200 bg-amber-50">
          <div className="flex gap-2 items-start">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold text-sm text-amber-900">Queue Backlog</div>
              <div className="text-xs text-amber-700">{queueMetrics.queued} messages waiting to send</div>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}