import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { Mail, Eye, MousePointerClick, Clock } from 'lucide-react';

export default function MessageHistory({ notifications }) {
  const sortedNotifications = [...notifications]
    .filter(n => n.status === 'sent')
    .sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  if (sortedNotifications.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Mail className="w-16 h-16 text-slate-300 mx-auto mb-4" />
        <p className="text-slate-500">אין הודעות שנשלחו עדיין</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {sortedNotifications.map(notification => {
        const recipientCount = notification.recipient_emails?.length || 0;
        const readCount = notification.read_count || 0;
        const actionCount = notification.action_count || 0;
        const unreadCount = recipientCount - readCount;

        return (
          <Card key={notification.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1">
                <h3 className="font-bold text-slate-800 mb-1">{notification.title}</h3>
                <p className="text-sm text-slate-600 mb-2">{notification.message}</p>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Clock className="w-3 h-3" />
                  {format(new Date(notification.sent_at), 'dd/MM/yyyy HH:mm', { locale: he })}
                  <Badge variant="outline" className="text-xs">
                    {notification.category}
                  </Badge>
                  {notification.action_type !== 'none' && (
                    <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700">
                      CTA: {notification.action_label}
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 pt-3 border-t">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-500" />
                <div>
                  <p className="text-lg font-bold text-slate-800">{recipientCount}</p>
                  <p className="text-xs text-slate-500">נשלח ל</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-green-500" />
                <div>
                  <p className="text-lg font-bold text-slate-800">{readCount}</p>
                  <p className="text-xs text-slate-500">נקרא</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MousePointerClick className="w-4 h-4 text-purple-500" />
                <div>
                  <p className="text-lg font-bold text-slate-800">{actionCount}</p>
                  <p className="text-xs text-slate-500">לחצו על CTA</p>
                </div>
              </div>
            </div>

            {unreadCount > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-sm text-orange-600 font-medium">
                  {unreadCount} מתאמנים עדיין לא קראו
                </p>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}