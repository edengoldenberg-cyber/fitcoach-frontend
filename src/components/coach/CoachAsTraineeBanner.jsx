import React from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

export default function CoachAsTraineeBanner({ onExit }) {
  return (
    <div
      className="sticky top-0 z-50 flex items-center justify-between px-4 py-2.5 text-white text-sm font-semibold shadow-md"
      style={{ background: 'linear-gradient(90deg, #f59e0b, #d97706)' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2">
        <span className="text-base">🧪</span>
        <span>מצב בדיקה: אתה משתמש בממשק מתאמן עם הפרטים שלך</span>
      </div>
      <Button
        size="sm"
        onClick={onExit}
        className="bg-white text-amber-700 hover:bg-amber-50 border-0 font-bold h-8 px-3 text-xs flex-shrink-0"
      >
        ← חזור לממשק מאמן
      </Button>
    </div>
  );
}