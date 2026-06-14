import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { formatDistanceToNow } from 'date-fns';
import { Send, MessageCircle } from 'lucide-react';

export default function WhatsAppControlMessageActivity({ coachEmail, autoRefresh, onSelectLead }) {
  const [filter, setFilter] = useState('all'); // all, inbound, outbound
  const [searchPhone, setSearchPhone] = useState('');

  const { data: threads } = useQuery({
    queryKey: ['messageThreads', coachEmail],
    queryFn: async () => {
      const items = await base44.entities.LeadMessageThread.filter({ coach_email: coachEmail });
      return items.sort((a, b) => new Date(b.messageTimestamp) - new Date(a.messageTimestamp)).slice(0, 50);
    },
    refetchInterval: autoRefresh ? 10000 : false,
  });

  if (!threads) return <div className="text-center py-8 text-slate-500">Loading activity...</div>;

  const filtered = threads
    .filter(t => filter === 'all' || t.direction === filter.toUpperCase())
    .filter(t => !searchPhone || (t.leadId && t.leadId.includes(searchPhone)));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex gap-3">
          <Input
            placeholder="Search by lead ID..."
            value={searchPhone}
            onChange={(e) => setSearchPhone(e.target.value)}
            className="text-sm"
          />
          <div className="flex gap-2">
            {['all', 'inbound', 'outbound'].map((f) => (
              <Badge
                key={f}
                variant={filter === f ? 'default' : 'outline'}
                className="cursor-pointer capitalize text-xs"
                onClick={() => setFilter(f)}
              >
                {f}
              </Badge>
            ))}
          </div>
        </div>
      </Card>

      <div className="space-y-2">
        {filtered.map((msg) => (
          <Card
            key={msg.id}
            className="p-4 cursor-pointer hover:bg-slate-50 transition-colors"
            onClick={() => onSelectLead(msg.leadId)}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                {msg.direction === 'INBOUND' ? (
                  <MessageCircle className="w-4 h-4 text-blue-500 mt-1 flex-shrink-0" />
                ) : (
                  <Send className="w-4 h-4 text-green-500 mt-1 flex-shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{msg.messageText.slice(0, 60)}</p>
                  <p className="text-xs text-slate-500 mt-1">Lead: {msg.leadId}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <Badge variant="outline" className="text-xs capitalize mb-2 block">
                  {msg.direction.toLowerCase()}
                </Badge>
                <p className="text-xs text-slate-500">
                  {formatDistanceToNow(new Date(msg.messageTimestamp), { addSuffix: true })}
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}