import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Bell, Search } from 'lucide-react';
import NotificationAuditStats from '@/components/notifications/NotificationAuditStats';
import NotificationTimeline from '@/components/notifications/NotificationTimeline';

export default function CoachNotificationControlCenter() {
  const params = new URLSearchParams(window.location.search);
  const debug = params.get('notification_debug') === 'true';
  const [traineeFilter, setTraineeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['notificationAuditLogs'],
    queryFn: () => base44.entities.NotificationAuditLog.list('-created_at', 500),
    initialData: [],
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['activeTraineesForNotificationAudit'],
    queryFn: () => base44.entities.Trainee.filter({ status: 'active' }),
    initialData: [],
  });

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const traineeMatch = traineeFilter === 'all' || log.trainee_email === traineeFilter || log.trainee_id === traineeFilter;
      const statusMatch = statusFilter === 'all' || log.status === statusFilter;
      const typeMatch = typeFilter === 'all' || log.notification_type === typeFilter;
      const text = `${log.title || ''} ${log.body || ''} ${log.trigger_reason || ''}`.toLowerCase();
      const searchMatch = !search.trim() || text.includes(search.trim().toLowerCase());
      return traineeMatch && statusMatch && typeMatch && searchMatch;
    });
  }, [logs, traineeFilter, statusFilter, typeFilter, search]);

  const types = [...new Set(logs.map((log) => log.notification_type).filter(Boolean))];
  const duplicateCount = logs.filter((log) => log.status === 'duplicate_blocked').length;
  const spamKeys = Object.entries(logs.reduce((acc, log) => {
    acc[log.deduplication_key] = (acc[log.deduplication_key] || 0) + 1;
    return acc;
  }, {})).filter(([, count]) => count >= 3).length;

  return (
    <div className="max-w-6xl mx-auto p-4 pb-24" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <Bell className="w-7 h-7 text-teal-600" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900">מרכז בקרת התראות</h1>
          <p className="text-sm text-slate-500">מעקב מלא אחרי שליחה, מסירה, פתיחה וחסימות כפילות</p>
        </div>
      </div>

      <NotificationAuditStats logs={filteredLogs} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-4">
        <Card className="p-4 bg-orange-50 border-orange-100">
          <div className="text-2xl font-bold text-orange-700">{duplicateCount}</div>
          <div className="text-sm text-orange-700">כפילויות שנחסמו</div>
        </Card>
        <Card className="p-4 bg-red-50 border-red-100">
          <div className="text-2xl font-bold text-red-700">{spamKeys}</div>
          <div className="text-sm text-red-700">מפתחות שחזרו 3+ פעמים</div>
        </Card>
      </div>

      <Card className="p-4 mb-4 bg-white border-0 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש בטקסט..." className="pr-9" />
          </div>
          <Select value={traineeFilter} onValueChange={setTraineeFilter}>
            <SelectTrigger><SelectValue placeholder="מתאמן" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל המתאמנים</SelectItem>
              {trainees.map((trainee) => (
                <SelectItem key={trainee.id} value={trainee.user_email}>{trainee.full_name || trainee.user_email}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger><SelectValue placeholder="סטטוס" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסטטוסים</SelectItem>
              <SelectItem value="queued">בתור</SelectItem>
              <SelectItem value="sending">בשליחה</SelectItem>
              <SelectItem value="sent">נשלח</SelectItem>
              <SelectItem value="delivered">נמסר</SelectItem>
              <SelectItem value="opened">נפתח</SelectItem>
              <SelectItem value="failed">נכשל</SelectItem>
              <SelectItem value="duplicate_blocked">כפילות נחסמה</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger><SelectValue placeholder="סוג" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הסוגים</SelectItem>
              {types.map((type) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </Card>

      {isLoading ? (
        <Card className="p-8 text-center">טוען נתוני התראות...</Card>
      ) : (
        <NotificationTimeline logs={filteredLogs} debug={debug} />
      )}
    </div>
  );
}