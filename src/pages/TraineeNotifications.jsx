import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { Bell, BellOff, CheckCircle, Archive, AlertCircle, Info, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import NotificationSettings from '@/components/trainee/NotificationSettings';

export default function TraineeNotifications() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('all');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['traineeNotifications', user?.email],
    queryFn: () => base44.entities.Notification.filter({ 
      trainee_email: user?.email 
    }),
    enabled: !!user?.email,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, {
        status: 'read',
        read_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeNotifications'] });
      toast.success('✓ סומן כנקרא');
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => n.status === 'unread');
      await Promise.all(
        unread.map(n => 
          base44.entities.Notification.update(n.id, {
            status: 'read',
            read_at: new Date().toISOString()
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeNotifications'] });
      toast.success(`✓ ${notifications.filter(n => n.status === 'unread').length} הודעות סומנו כנקראו`);
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (notificationId) => {
      await base44.entities.Notification.update(notificationId, {
        status: 'archived',
        archived_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeNotifications'] });
      toast.success('✓ הועבר לארכיון');
    },
  });

  const handleActionClick = (notification) => {
    if (notification.status === 'unread') {
      markAsReadMutation.mutate(notification.id);
    }

    if (notification.action_url) {
      navigate(notification.action_url);
    }
  };

  // Filter notifications
  const filteredNotifications = useMemo(() => {
    let filtered = notifications;

    if (activeTab === 'unread') {
      filtered = filtered.filter(n => n.status === 'unread');
    } else if (activeTab === 'auto') {
      filtered = filtered.filter(n => n.source === 'auto');
    } else if (activeTab === 'coach') {
      filtered = filtered.filter(n => n.source === 'coach');
    } else if (activeTab === 'system') {
      filtered = filtered.filter(n => n.source === 'system');
    }

    return filtered.sort((a, b) => 
      new Date(b.created_date) - new Date(a.created_date)
    );
  }, [notifications, activeTab]);

  // Group by date
  const groupedNotifications = useMemo(() => {
    const groups = {};
    
    for (const notif of filteredNotifications) {
      const date = format(new Date(notif.created_date), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(notif);
    }

    return groups;
  }, [filteredNotifications]);

  const unreadCount = notifications.filter(n => n.status === 'unread').length;
  const autoCount = notifications.filter(n => n.source === 'auto').length;
  const coachCount = notifications.filter(n => n.source === 'coach').length;
  const systemCount = notifications.filter(n => n.source === 'system').length;

  const getSeverityIcon = (severity) => {
    if (severity === 'critical') return <AlertCircle className="w-4 h-4 text-red-500" />;
    if (severity === 'warning') return <AlertCircle className="w-4 h-4 text-orange-500" />;
    return <Info className="w-4 h-4 text-blue-500" />;
  };

  const getSeverityColor = (severity) => {
    if (severity === 'critical') return 'border-l-4 border-red-500';
    if (severity === 'warning') return 'border-l-4 border-orange-500';
    return 'border-l-4 border-blue-500';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 pb-20 flex items-center justify-center" dir="rtl">
        <p className="text-slate-500">טוען התראות...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Bell className="w-6 h-6" style={{ color: '#79DBD6' }} />
              הודעות
            </h1>
            {unreadCount > 0 && (
              <p className="text-sm text-slate-600 mt-1">
                {unreadCount} הודעות חדשות
              </p>
            )}
          </div>
          
          {unreadCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllAsReadMutation.mutate()}
              disabled={markAllAsReadMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              סמן הכל כנקרא
            </Button>
          )}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-3 mb-1">
            <TabsTrigger value="all">הכל ({notifications.length})</TabsTrigger>
            <TabsTrigger value="unread">לא נקרא ({unreadCount})</TabsTrigger>
            <TabsTrigger value="settings" className="flex items-center gap-1">
              <Settings2 className="w-3.5 h-3.5" /> הגדרות
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <NotificationSettings userEmail={user?.email} />
        )}

        {/* Notifications List */}
        {activeTab !== 'settings' && filteredNotifications.length === 0 ? (
          <Card className="p-12 text-center">
            <BellOff className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">אין הודעות להצגה</p>
          </Card>
        ) : activeTab !== 'settings' ? (
          <div className="space-y-6">
            {Object.entries(groupedNotifications).map(([date, notifs]) => (
              <div key={date}>
                <h3 className="text-sm font-medium text-slate-600 mb-3">
                  {format(new Date(date), 'dd MMMM yyyy', { locale: he })}
                </h3>
                <div className="space-y-3">
                  {notifs.map((notification) => {
                    const isUnread = notification.status === 'unread';
                    
                    return (
                      <Card 
                        key={notification.id}
                        className={`p-4 cursor-pointer transition-all ${getSeverityColor(notification.severity)} ${
                          isUnread ? 'border-2 bg-blue-50' : 'border'
                        }`}
                        style={isUnread ? { borderColor: '#79DBD6' } : {}}
                        onClick={() => {
                          if (isUnread) {
                            markAsReadMutation.mutate(notification.id);
                          }
                        }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              {getSeverityIcon(notification.severity)}
                              <h3 className="font-bold text-slate-800">{notification.title_he}</h3>
                              {isUnread && (
                                <Badge style={{ backgroundColor: '#79DBD6', color: 'white' }}>
                                  חדש
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-slate-600">{notification.body_he}</p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-3 border-t">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              {notification.type}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {notification.source}
                            </Badge>
                            <span className="text-xs text-slate-500">
                              {format(new Date(notification.created_date), 'HH:mm', { locale: he })}
                            </span>
                          </div>

                          <div className="flex items-center gap-2">
                            {notification.action_url && (
                              <Button
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActionClick(notification);
                                }}
                                style={{ backgroundColor: '#79DBD6', color: 'white' }}
                              >
                                {notification.action_label || 'פתח'}
                              </Button>
                            )}
                            
                            {!isUnread && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  archiveMutation.mutate(notification.id);
                                }}
                              >
                                <Archive className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}