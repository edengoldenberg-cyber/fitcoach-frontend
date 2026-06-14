import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock } from 'lucide-react';

export default function WhatsAppControlConversationHealth({ coachEmail, autoRefresh }) {
  const { data: states } = useQuery({
    queryKey: ['leadConversationStates', coachEmail],
    queryFn: () => base44.entities.LeadConversationState.filter({ coach_email: coachEmail }),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  const { data: leads } = useQuery({
    queryKey: ['leads', coachEmail],
    queryFn: () => base44.entities.Lead.filter({ coach_email: coachEmail }),
    refetchInterval: autoRefresh ? 10000 : false,
  });

  if (!states || !leads) return <div className="text-center py-8 text-slate-500">Loading health data...</div>;

  const active = states.filter(s => s.flowStatus === 'ACTIVE').length;
  const waitingForReply = states.filter(s => s.flowStatus === 'ACTIVE' && s.lastFlowActionAt && Date.now() - new Date(s.lastFlowActionAt).getTime() > 3600000).length;
  const callRequested = leads.filter(l => l.status === 'CALL_REQUESTED').length;
  const stuckOnSameStep = states.filter(s => s.flowStatus === 'ACTIVE' && s.lastFlowActionAt && Date.now() - new Date(s.lastFlowActionAt).getTime() > 86400000).length;
  const simulatorLeads = leads.filter(l => l.isSimulatorLead).length;
  const realLeads = leads.length - simulatorLeads;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Active Conversations</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{active}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-xs text-slate-500">Ongoing flows</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Waiting for Reply</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{waitingForReply}</p>
            </div>
            <Clock className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xs text-slate-500">No response &gt; 1 hour</p>
        </Card>

        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Call Requested</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{callRequested}</p>
            </div>
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-xs text-slate-500">Ready for sales call</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Stuck on Step</p>
              <p className="text-2xl font-bold text-slate-900 mt-2">{stuckOnSameStep}</p>
            </div>
            <AlertCircle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-xs text-slate-500">No progress &gt; 24 hours</p>
        </Card>

        <Card className="p-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">Real Leads</p>
              <Badge variant="default">{realLeads}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-slate-600">Simulator Leads</p>
              <Badge variant="outline">{simulatorLeads}</Badge>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}