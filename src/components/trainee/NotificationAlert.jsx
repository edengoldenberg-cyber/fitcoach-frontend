import React, { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, CheckCircle, Sparkles, Droplets, Utensils, Dumbbell, Scale, MessageCircle } from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useNavigate } from 'react-router-dom';

const notificationSound = new Audio('data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4LjI5LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7v////////////////////////////////////////////////////////////////AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA//sQZAAP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAETEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZBQP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//sQZBQP8AAAaQAAAAgAAA0gAAABAAABpAAAACAAADSAAAAEVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV');

const actionIcons = {
  open_nutrition: Utensils,
  open_water: Droplets,
  open_workout: Dumbbell,
  open_metrics: Scale,
  open_chat_ai: MessageCircle,
  none: Bell
};

export default function NotificationAlert({ userEmail }) {
  const [showAlert, setShowAlert] = useState(false);
  const [currentNotification, setCurrentNotification] = useState(null);
  const [notificationQueue, setNotificationQueue] = useState([]);
  const hasPlayedSound = useRef(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: receipts = [] } = useQuery({
    queryKey: ['notificationReceipts', userEmail],
    queryFn: () => base44.entities.NotificationReceipt.filter({ trainee_email: userEmail }),
    enabled: !!userEmail,
    refetchInterval: 5000, // Poll every 5 seconds
  });

  const { data: allNotifications = [] } = useQuery({
    queryKey: ['allNotifications'],
    queryFn: () => base44.entities.Notification.list('-created_date', 50),
    refetchInterval: 5000,
  });

  const markAsReadMutation = useMutation({
    mutationFn: async (receiptId) => {
      await base44.entities.NotificationReceipt.update(receiptId, {
        read_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationReceipts'] });
      queryClient.invalidateQueries({ queryKey: ['unreadNotifications'] });
    }
  });

  const handleActionMutation = useMutation({
    mutationFn: async (receiptId) => {
      await base44.entities.NotificationReceipt.update(receiptId, {
        action_taken_at: new Date().toISOString()
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationReceipts'] });
    }
  });

  // Check for new unread notifications
  useEffect(() => {
    if (!receipts?.length || !allNotifications?.length) return;

    const unreadReceipts = receipts.filter(r => r && !r.read_at);
    const newNotifications = unreadReceipts
      .map(receipt => {
        if (!receipt?.notification_id) return null;
        const notification = allNotifications.find(n => n?.id === receipt.notification_id);
        return notification ? { ...notification, receiptId: receipt.id } : null;
      })
      .filter(Boolean);

    if (newNotifications.length > 0 && !showAlert) {
      setNotificationQueue(newNotifications);
      const firstNotification = newNotifications[0];
      setCurrentNotification(firstNotification);
      setShowAlert(true);
      
      // Play sound
      if (!hasPlayedSound.current) {
        try {
          notificationSound.play().catch(err => console.log('Sound play blocked:', err));
          hasPlayedSound.current = true;
        } catch (err) {
          console.log('Failed to play sound:', err);
        }
      }

      // Reset sound flag after 30 seconds
      setTimeout(() => {
        hasPlayedSound.current = false;
      }, 30000);
    }
  }, [receipts, allNotifications, showAlert]);

  const handleAcknowledge = async () => {
    if (currentNotification?.receiptId) {
      await markAsReadMutation.mutateAsync(currentNotification.receiptId);
    }

    // Show next notification in queue
    const remainingQueue = notificationQueue.slice(1);
    if (remainingQueue.length > 0) {
      setNotificationQueue(remainingQueue);
      setCurrentNotification(remainingQueue[0]);
    } else {
      setShowAlert(false);
      setCurrentNotification(null);
      setNotificationQueue([]);
    }
  };

  const handleAction = async () => {
    if (currentNotification?.receiptId) {
      await handleActionMutation.mutateAsync(currentNotification.receiptId);
      await markAsReadMutation.mutateAsync(currentNotification.receiptId);
    }

    // Navigate based on action type
    const actionType = currentNotification?.action_type;
    if (actionType && actionType !== 'none') {
      const pageMap = {
        open_nutrition: 'NutritionLog',
        open_water: 'WaterLog',
        open_workout: 'WorkoutLog',
        open_metrics: 'Metrics',
        open_chat_ai: 'TraineeHome', // Will trigger AI coach
      };
      
      const page = pageMap[actionType];
      if (page) {
        setShowAlert(false);
        setCurrentNotification(null);
        setNotificationQueue([]);
        navigate(createPageUrl(page));
      }
    } else {
      handleAcknowledge();
    }
  };

  if (!currentNotification) return null;

  const ActionIcon = actionIcons[currentNotification.action_type] || Bell;
  const categoryColors = {
    'תזכורת': 'from-blue-500 to-blue-600',
    'עידוד': 'from-green-500 to-green-600',
    'משימה': 'from-orange-500 to-orange-600',
    'כללי': 'from-slate-500 to-slate-600'
  };

  const gradientColor = categoryColors[currentNotification.category] || 'from-slate-500 to-slate-600';

  return (
    <Dialog open={showAlert} onOpenChange={() => {}}>
      <DialogContent 
        className="max-w-md p-0 overflow-hidden"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Header with gradient */}
        <div className={`bg-gradient-to-r ${gradientColor} p-6 text-white`}>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 bg-white bg-opacity-20 rounded-full">
              <Bell className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-lg">{currentNotification.title}</h3>
              <p className="text-xs opacity-90">{currentNotification.category}</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <p className="text-slate-700 text-base leading-relaxed mb-6 whitespace-pre-wrap">
            {currentNotification.message}
          </p>

          {/* Queue indicator */}
          {notificationQueue.length > 1 && (
            <div className="bg-slate-50 rounded-lg p-2 mb-4 text-center">
              <p className="text-xs text-slate-600">
                יש לך עוד {notificationQueue.length - 1} הודעות
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="space-y-2">
            {currentNotification.action_type && currentNotification.action_type !== 'none' && (
              <Button
                onClick={handleAction}
                className="w-full h-12"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                <ActionIcon className="w-4 h-4 ml-2" />
                {currentNotification.action_label || 'פתח'}
              </Button>
            )}
            <Button
              onClick={handleAcknowledge}
              variant={currentNotification.action_type === 'none' ? 'default' : 'outline'}
              className="w-full h-12"
              style={currentNotification.action_type === 'none' ? { backgroundColor: '#79DBD6', color: 'white' } : {}}
            >
              <CheckCircle className="w-4 h-4 ml-2" />
              הבנתי
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}