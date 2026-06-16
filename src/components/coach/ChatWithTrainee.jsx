import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, MessageCircle } from "lucide-react";
import { format } from 'date-fns';
import { he } from 'date-fns/locale/he';

export default function ChatWithTrainee({ open, onClose, traineeEmail, traineeName, coachEmail }) {
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: messages = [] } = useQuery({
    queryKey: ['messages', coachEmail, traineeEmail],
    queryFn: () => base44.entities.Message.filter({ 
      coach_email: coachEmail,
      trainee_email: traineeEmail 
    }),
    enabled: open && !!coachEmail && !!traineeEmail,
    refetchInterval: open ? 5000 : false,
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
    if (!message.trim()) return;
    
    sendMessageMutation.mutate({
      coach_email: coachEmail,
      trainee_email: traineeEmail,
      sender_role: 'coach',
      text: message.trim(),
    });
  };

  useEffect(() => {
    if (open) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md h-[600px] flex flex-col p-0" dir="rtl">
        <DialogHeader className="p-4 border-b">
          <DialogTitle className="flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-emerald-500" />
            שיחה עם {traineeName}
          </DialogTitle>
        </DialogHeader>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {sortedMessages.length === 0 ? (
            <div className="text-center py-12">
              <MessageCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">אין הודעות עדיין</p>
            </div>
          ) : (
            sortedMessages.map((msg) => {
              const isMe = msg.sender_role === 'coach';
              return (
                <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[75%]">
                    <div className={`p-3 rounded-2xl ${
                      isMe 
                        ? 'bg-emerald-500 text-white rounded-bl-none' 
                        : 'bg-slate-100 text-slate-800 rounded-br-none'
                    }`}>
                      <p className="text-sm leading-relaxed">{msg.text}</p>
                    </div>
                    <p className={`text-xs text-slate-400 mt-1 ${isMe ? 'text-left' : 'text-right'}`}>
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
        <div className="border-t p-4">
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
      </DialogContent>
    </Dialog>
  );
}