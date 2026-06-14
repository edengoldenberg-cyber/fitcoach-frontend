import React from 'react';
import { Search, Zap, Star, X } from 'lucide-react';

const MEAL_LABELS = {
  breakfast: 'ארוחת בוקר',
  lunch: 'ארוחת צהריים',
  dinner: 'ארוחת ערב',
  snack: 'חטיפים',
};

function ActionOption({ icon, title, subtitle, className, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full min-h-[72px] rounded-2xl p-4 text-right flex items-center gap-3 shadow-sm active:scale-[0.98] transition-all ${className}`}
    >
      <span className="text-2xl flex-shrink-0">{icon}</span>
      <span className="flex-1 min-w-0">
        <span className="block text-base font-bold">{title}</span>
        {subtitle && <span className="block text-xs opacity-80 mt-1 leading-relaxed">{subtitle}</span>}
      </span>
    </button>
  );
}

export default function AddMealActionSheet({ open, mealType, onClose, onPhoto, onText, onSearch, onQuick, onSaved }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center" dir="rtl">
      <button type="button" className="absolute inset-0 bg-black/45" onClick={onClose} aria-label="סגור" />
      <div className="relative w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl animate-in slide-in-from-bottom-4 duration-200">
        <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">איך תרצה להוסיף פריט?</h2>
            <p className="mt-1 text-sm text-slate-500">יישמר אל {MEAL_LABELS[mealType] || 'הארוחה הנוכחית'}</p>
          </div>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full bg-slate-100 text-slate-500 min-h-0 min-w-0">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <ActionOption
            icon="📸"
            title="צלם ארוחה"
            subtitle="העלה תמונה ו-AI יזהה את המאכלים"
            className="bg-gradient-to-r from-teal-400 to-teal-500 text-white"
            onClick={onPhoto}
          />
          <ActionOption
            icon="✨"
            title="תאר ארוחה בכתב"
            subtitle="כתוב מה אכלת וה-AI יחשב קלוריות ומאקרו"
            className="bg-gradient-to-r from-purple-500 to-purple-600 text-white"
            onClick={onText}
          />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2">
          <button type="button" onClick={onSearch} className="min-h-[52px] rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-700 flex items-center gap-3 justify-start">
            <Search className="h-4 w-4 text-slate-500" />
            <span className="font-semibold">🔎 חיפוש במאגר</span>
          </button>
          <button type="button" onClick={onQuick} className="min-h-[52px] rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-700 flex items-center gap-3 justify-start">
            <Zap className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">⚡ הוספה מהירה</span>
          </button>
          <button type="button" onClick={onSaved} className="min-h-[52px] rounded-2xl border border-slate-200 bg-slate-50 px-4 text-slate-700 flex items-center gap-3 justify-start">
            <Star className="h-4 w-4 text-amber-500" />
            <span className="font-semibold">⭐ מהמאכלים שלי / אחרונים</span>
          </button>
        </div>
      </div>
    </div>
  );
}