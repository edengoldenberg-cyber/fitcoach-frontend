import React from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, Edit, Brain, Search } from 'lucide-react';

/**
 * Clear mode selector for meal entry.
 * Explains each approach simply.
 */
export default function MealEntryModeSelector({ onSelectMode }) {
  return (
    <div className="space-y-3 py-4">
      <div className="text-sm text-slate-600 mb-4 text-center">
        בחר/י את הדרך הנוחה ביותר להוסיף ארוחה:
      </div>
      
      <Button
        onClick={() => onSelectMode('ai-image')}
        className="w-full h-auto py-4 flex flex-col items-center justify-center gap-2"
        style={{ backgroundColor: '#79DBD6', color: 'white' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5" />
          <span className="font-bold">AI עם תמונה</span>
        </div>
        <p className="text-xs opacity-90">צלם/י או העלה/י תמונה של הארוחה</p>
      </Button>

      <Button
        onClick={() => onSelectMode('ai-text')}
        className="w-full h-auto py-4 flex flex-col items-center justify-center gap-2"
        variant="outline"
      >
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5" />
          <span className="font-bold">AI טקסט בלבד</span>
        </div>
        <p className="text-xs text-slate-600">תאר/י בפירוט: כמות, סוג, צורת הכנה</p>
      </Button>

      <Button
        onClick={() => onSelectMode('search')}
        className="w-full h-auto py-4 flex flex-col items-center justify-center gap-2"
        variant="outline"
      >
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5" />
          <span className="font-bold">🔍 חיפוש במאגר</span>
        </div>
        <p className="text-xs text-slate-600">בחר מזון מוכר מהמאגר שלנו</p>
      </Button>

      <Button
        onClick={() => onSelectMode('manual')}
        className="w-full h-auto py-4 flex flex-col items-center justify-center gap-2"
        variant="outline"
      >
        <div className="flex items-center gap-2">
          <Edit className="w-5 h-5" />
          <span className="font-bold">✍️ הזנה ידנית</span>
        </div>
        <p className="text-xs text-slate-600">הזן ערכים תזונתיים ידנית (ל-100 גרם)</p>
      </Button>
    </div>
  );
}