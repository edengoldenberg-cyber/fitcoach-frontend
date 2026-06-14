import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, MessageCircle } from "lucide-react";
import { format } from 'date-fns';
import { he } from 'date-fns/locale';

export default function Chat() {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: traineeProfile } = useQuery({
    queryKey: ['traineeProfile', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ user_email: user?.email }),
    enabled: !!user?.email,
    select: (data) => data[0],
  });

  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const isCoach = (coachTrainees && coachTrainees.length > 0) || user?.role === 'admin';
  
  // For trainee: get messages with their coach
  // For coach: this page shouldn't really be accessed, but if it is, show empty
  const coachEmail = traineeProfile?.coach_email;
  const traineeEmail = traineeProfile?.user_email;

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', coachEmail, traineeEmail],
    queryFn: () => {
      if (isCoach || !coachEmail || !traineeEmail) return [];
      return base44.entities.Message.filter({ 
        coach_email: coachEmail,
        trainee_email: traineeEmail 
      });
    },
    enabled: !isCoach && !!coachEmail && !!traineeEmail,
    refetchInterval: 5000, // Poll every 5 seconds for new messages
  });

  const sendMessageMutation = useMutation({
    mutationFn: (data) => base44.entities.Message.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['messages'] });
      setMessage('');
    },
  });

  const sortedMessages = [...messages].sort((a, b) => 
    new Date(a.created_date) - new Date(b.created_date)
  );

  const handleSend = () => {
    if (!message.trim() || !coachEmail || !traineeEmail) return;
    
    sendMessageMutation.mutate({
      coach_email: coachEmail,
      trainee_email: traineeEmail,
      sender_role: 'trainee',
      text: message.trim(),
    });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (isCoach) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center" dir="rtl">
        <Card className="p-8 text-center max-w-sm mx-4">
          <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">הודעות זמינות בפרופיל כל מתאמן</p>
        </Card>
      </div>
    );
  }

  if (!traineeProfile) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center" dir="rtl">
        <Card className="p-8 text-center max-w-sm mx-4">
          <p className="text-slate-500">טוען...</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col" dir="rtl">
      <div className="max-w-lg mx-auto w-full flex flex-col h-screen">
        {/* Header */}
        <div className="bg-white border-b p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Avatar className="w-10 h-10">
              <AvatarFallback className="bg-emerald-500 text-white">
                {traineeProfile?.coach_email?.[0]?.toUpperCase() || 'M'}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="font-bold text-slate-800">המאמן שלי</h1>
              <p className="text-xs text-slate-500">{traineeProfile?.coach_email}</p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-20">
          {sortedMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">אין הודעות עדיין</p>
              <p className="text-xs text-slate-400 mt-1">שלח הודעה ראשונה למאמן שלך</p>
            </div>
          ) : (
            sortedMessages.map((msg) => {
              const isMe = msg.sender_role === 'trainee';
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-start' : 'justify-end'}`}>
                  <div className={`max-w-[75%] ${isMe ? 'order-2' : 'order-1'}`}>
                    <div className={`p-3 rounded-2xl ${
                      isMe 
                        ? 'bg-emerald-500 text-white rounded-br-none' 
                        : 'bg-white text-slate-800 rounded-bl-none shadow-sm'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    <p className={`text-xs text-slate-400 mt-1 ${isMe ? 'text-right' : 'text-left'}`}>
                      {format(new Date(msg.created_date), 'HH:mm', { locale: he })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="bg-white border-t p-4 pb-20">
          <div className="flex gap-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend()}
              placeholder="כתוב הודעה..."
              className="flex-1"
            />
            <Button 
              onClick={handleSend}
              disabled={!message.trim() || sendMessageMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-600"
            >
              <Send className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}