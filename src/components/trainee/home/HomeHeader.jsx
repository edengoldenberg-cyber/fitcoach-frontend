import React from 'react';
import { Sparkles } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function HomeHeader({ user, trainee, onOpenAICoach }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? '☀️ בוקר טוב' : hour < 17 ? '🌤 צהריים טובים' : '🌙 ערב טוב';
  const firstName = trainee?.full_name?.split(' ')[0] || user?.full_name?.split(' ')[0] || 'מתאמן';

  return (
    <div
      className="rounded-2xl p-5 mb-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #79DBD6 0%, #5BC5C0 50%, #3aada8 100%)' }}
    >
      {/* Decorative circles */}
      <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 -translate-y-8 translate-x-8" />
      <div className="absolute bottom-0 left-0 w-20 h-20 rounded-full bg-white/10 translate-y-6 -translate-x-6" />

      <div className="relative">
        <p className="text-white/80 text-sm mb-1">{greeting}</p>
        <h1 className="text-white text-2xl font-bold mb-3">{firstName} 👋</h1>

        <button
          onClick={onOpenAICoach}
          className="flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white rounded-xl px-4 py-2.5 transition-all backdrop-blur-sm border border-white/30"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-sm font-medium">שאל את ה-AI Coach</span>
        </button>
      </div>
    </div>
  );
}