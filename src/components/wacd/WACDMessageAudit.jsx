import React, { useState, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronDown, ChevronRight, Search, Eye } from 'lucide-react';
import WACDMessageChain from './WACDMessageChain';

const STATUS_COLOR = {
  sent: 'bg-emerald-100 text-emerald-700',
  provider_unconfirmed: 'bg-yellow-100 text-yellow-700',
  queued: 'bg-blue-100 text-blue-700',
  sending: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  cancelled: 'bg-slate-100 text-slate-600',
  duplicate_blocked: 'bg-orange-100 text-orange-700',
  reminder_skipped: 'bg-orange-100 text-orange-700',
  message_sent: 'bg-emerald-100 text-emerald-700',
};

function maskPhone(phone) {
  if (!phone) return '—';
  const s = String(phone);
  if (s.length < 6) return s;
  return s.slice(0, 4) + '****' + s.slice(-3);
}

function fmtTime(ts) {
  if (!ts) return '—';
  try { return new Date(ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' }); }
  catch { return ts; }
}

function truncate(s, n = 50) {
  if (!s) return '—';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export default function WACDMessageAudit({ data }) {
  const { todayEventLogs, todayPerformance, todayQueue, traineeMap } = data;
  const [search, setSearch] = useState('');
  const [filterTrigger, setFilterTrigger] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedMsg, setSelectedMsg] = useState(null);

  // Merge today's sent messages from performance + queue
  const rows = useMemo(() => {
    const result = [];

    // From EventLogs (decisions)
    todayEventLogs.forEach(e => {
      const trainee = traineeMap[e.trainee_id] || traineeMap[e.trainee_email];
      result.push({
        id: e.id,
        time: e.timestamp,
        trainee_name: trainee?.full_name || e.trainee_email || '—',
        trainee_email: e.trainee_email,
        phone: trainee?.phone,
        trigger_type: e.trigger_type,
        message_preview: e.message_sent || '—',
        status: e.event_type === 'message_sent' ? 'sent' : 'reminder_skipped',
        blocked_reason: e.blocked_reason,
        source: 'EventLog',
        event_id: e.id,
        raw: e,
      });
    });

    // From Queue (with provider details)
    todayQueue.forEach(q => {
      const trainee = traineeMap[q.context_id];
      result.push({
        id: q.id,
        time: q.created_date,
        trainee_name: trainee?.full_name || q.to_name || q.context_id || '—',
        trainee_email: trainee?.user_email,
        phone: q.to_phone_e164,
        trigger_type: q.template_key || '—',
        message_preview: q.rendered_text || '—',
        status: q.status,
        source: 'Queue',
        error: q.error_message,
        raw: q,
      });
    });

    // Sort by time desc
    result.sort((a, b) => new Date(b.time) - new Date(a.time));
    return result;
  }, [todayEventLogs, todayQueue, traineeMap]);

  // Unique trigger types
  const triggerTypes = useMemo(() => {
    const s = new Set(rows.map(r => r.trigger_type).filter(Boolean));
    return Array.from(s);
  }, [rows]);

  const filtered = useMemo(() => {
    let r = rows;
    if (filterTrigger !== 'all') r = r.filter(x => x.trigger_type === filterTrigger);
    if (filterStatus !== 'all') r = r.filter(x => x.status === filterStatus);
    if (search) {
      const s = search.toLowerCase();
      r = r.filter(x =>
        x.trainee_name?.toLowerCase().includes(s) ||
        x.trainee_email?.toLowerCase().includes(s) ||
        x.phone?.includes(s) ||
        x.trigger_type?.toLowerCase().includes(s)
      );
    }
    return r;
  }, [rows, filterTrigger, filterStatus, search]);

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-40">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="חיפוש לפי שם / אימייל / פלאפון..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pr-9 h-9 text-sm"
          />
        </div>
        <Select value={filterTrigger} onValueChange={setFilterTrigger}>
          <SelectTrigger className="w-44 h-9 text-sm">
            <SelectValue placeholder="סוג אוטומציה" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסוגים</SelectItem>
            {triggerTypes.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36 h-9 text-sm">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הסטטוסים</SelectItem>
            <SelectItem value="sent">נשלח</SelectItem>
            <SelectItem value="failed">נכשל</SelectItem>
            <SelectItem value="queued">בתור</SelectItem>
            <SelectItem value="reminder_skipped">נחסם</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-xs text-slate-500">{filtered.length} רשומות</p>

      {/* Table */}
      <div className="space-y-1.5">
        {filtered.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">אין נתונים</div>
        )}
        {filtered.map((row, i) => (
          <div key={row.id || i} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
            <div className="flex items-start gap-2 flex-wrap">
              <span className="text-xs text-slate-400 w-12 flex-shrink-0 pt-0.5">{fmtTime(row.time)}</span>
              <span className="text-sm font-semibold text-slate-800 flex-1 min-w-32">{row.trainee_name}</span>
              <span className="text-xs text-slate-400 font-mono">{maskPhone(row.phone)}</span>
              <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{row.trigger_type}</span>
              <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${STATUS_COLOR[row.status] || 'bg-slate-100 text-slate-600'}`}>
                {row.status}
              </span>
              <Button
                variant="ghost" size="icon"
                className="h-6 w-6 text-slate-400 hover:text-teal-600"
                onClick={() => setSelectedMsg(row)}
                title="פרטי שרשרת"
              >
                <Eye className="w-3.5 h-3.5" />
              </Button>
            </div>
            <p className="text-xs text-slate-500 mt-1 pr-14 truncate">{truncate(row.message_preview, 80)}</p>
            {row.blocked_reason && (
              <p className="text-xs text-orange-600 mt-0.5 pr-14">חסום: {row.blocked_reason}</p>
            )}
            {row.error && (
              <p className="text-xs text-red-600 mt-0.5 pr-14">שגיאה: {row.error}</p>
            )}
          </div>
        ))}
      </div>

      {/* Chain detail modal */}
      {selectedMsg && (
        <WACDMessageChain
          msg={selectedMsg}
          data={data}
          onClose={() => setSelectedMsg(null)}
        />
      )}
    </div>
  );
}