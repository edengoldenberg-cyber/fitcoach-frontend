import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { Send, MessageCircle, AlertCircle } from 'lucide-react';

export default function WhatsAppControlMessageTrace({ leadId, coachEmail }) {
  const [searchLeadId, setSearchLeadId] = useState(leadId || '');

  const { data: lead } = useQuery({
    queryKey: ['leadTrace', searchLeadId],
    queryFn: () => base44.entities.Lead.filter({ id: searchLeadId }),
    enabled: !!searchLeadId,
    select: (data) => data[0],
  });

  const { data: threads } = useQuery({
    queryKey: ['leadThreads', searchLeadId],
    queryFn: () => base44.entities.LeadMessageThread.filter({ leadId: searchLeadId }),
    enabled: !!searchLeadId,
  });

  const { data: queue } = useQuery({
    queryKey: ['leadQueue', searchLeadId],
    queryFn: () => base44.entities.WhatsAppMessageQueue.filter({ context_id: searchLeadId }),
    enabled: !!searchLeadId,
  });

  const { data: state } = useQuery({
    queryKey: ['leadState', searchLeadId],
    queryFn: () => base44.entities.LeadConversationState.filter({ leadId: searchLeadId }),
    enabled: !!searchLeadId,
    select: (data) => data[0],
  });

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <Input
          placeholder="Enter lead ID to trace..."
          value={searchLeadId}
          onChange={(e) => setSearchLeadId(e.target.value)}
          className="text-sm"
        />
      </Card>

      {!searchLeadId && (
        <Card className="p-8 text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-slate-500 text-sm">Enter a lead ID to view full conversation trace</p>
        </Card>
      )}

      {searchLeadId && !lead && (
        <Card className="p-4 border-red-200 bg-red-50">
          <p className="text-sm text-red-800">Lead not found: {searchLeadId}</p>
        </Card>
      )}

      {lead && (
        <>
          {/* Lead Info */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Lead Information</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-slate-500 text-xs">Name</p>
                <p className="font-medium text-slate-900">{lead.firstName} {lead.lastName}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Phone</p>
                <p className="font-medium text-slate-900">{lead.phoneE164}</p>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Status</p>
                <Badge variant="outline" className="capitalize text-xs mt-1">{lead.status}</Badge>
              </div>
              <div>
                <p className="text-slate-500 text-xs">Temperature</p>
                <Badge variant="outline" className="capitalize text-xs mt-1">{lead.leadTemperature}</Badge>
              </div>
              {lead.isSimulatorLead && (
                <div className="col-span-2">
                  <Badge variant="outline" className="text-xs">🧪 Simulator Lead</Badge>
                </div>
              )}
            </div>
          </Card>

          {/* Flow State */}
          {state && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Flow State</h3>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-slate-500 text-xs">Flow</p>
                  <p className="font-medium text-slate-900">{state.flowName}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Status</p>
                  <Badge variant="outline" className="capitalize text-xs mt-1">{state.flowStatus}</Badge>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Current Step</p>
                  <p className="font-medium text-slate-900">{state.currentStepOrder} of {state.totalSteps}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs">Last Action</p>
                  <p className="font-medium text-slate-900 text-xs">{formatDistanceToNow(new Date(state.lastFlowActionAt), { addSuffix: true })}</p>
                </div>
              </div>
            </Card>
          )}

          {/* Message Thread */}
          <Card className="p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-4">Message History ({threads?.length || 0})</h3>
            <div className="space-y-2">
              {threads?.map((msg) => (
                <div key={msg.id} className="p-3 bg-slate-50 rounded border border-slate-200">
                  <div className="flex items-start gap-3 mb-2">
                    {msg.direction === 'INBOUND' ? (
                      <MessageCircle className="w-4 h-4 text-blue-500 mt-0.5" />
                    ) : (
                      <Send className="w-4 h-4 text-green-500 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-slate-600">{msg.direction === 'INBOUND' ? '📨 Inbound' : '📤 Outbound'} • {formatDistanceToNow(new Date(msg.messageTimestamp), { addSuffix: true })}</p>
                      <p className="text-sm text-slate-900 mt-1">{msg.messageText}</p>
                    </div>
                  </div>
                  {msg.replyProducer && (
                    <p className="text-xs text-slate-500 pl-7">Reply by: {msg.replyProducer}</p>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Queue History */}
          {queue && queue.length > 0 && (
            <Card className="p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-4">Queue History ({queue.length})</h3>
              <div className="space-y-2">
                {queue.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 rounded border border-slate-200 text-sm">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-medium text-slate-900 truncate">{item.rendered_text.slice(0, 50)}</p>
                      <Badge variant="outline" className="capitalize text-xs">{item.status}</Badge>
                    </div>
                    <p className="text-xs text-slate-500">Created: {formatDistanceToNow(new Date(item.created_date), { addSuffix: true })}</p>
                    {item.error_message && <p className="text-xs text-red-600 mt-1">Error: {item.error_message.slice(0, 60)}</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}