import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HelpCircle, Lightbulb, MessageSquare } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

const TIPS = {
  TraineeHome: "במסך הבית תראה סיכום יומי - קלוריות, מים, אימונים. כל מה שחשוב לעקוב אחריו.",
  NutritionLog: "השתמש ב-AI להזנה מהירה. כתוב בעברית מה אכלת והמערכת תחשב עבורך.",
  WaterLog: "המים חשובים לא פחות! השתדל להגיע ליעד היומי שלך.",
  Activity: "כל פעילות נחשבת - הליכה, ריצה, אפילו עבודות בית. רשום והמערכת תחשב קלוריות.",
  DeviceStats: "אם יש לך שעון חכם, הזן את הנתונים פעם ביום - זה יעזור למאמן לראות תמונה מלאה.",
  WorkoutLog: "תעד את האימון - משקלים, חזרות, תחושה. ככה המאמן יכול לעזור לך להתקדם.",
  BodyMeasurements: "שקול פעם בשבוע באותו יום ושעה. השינויים הקטנים הם שחשובים."
};

export default function HelpButton({ pageName = 'TraineeHome' }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const tip = TIPS[pageName] || "האפליקציה כאן כדי לעזור לך לעקוב ולהתקדם. כל שאלה - המאמן פה בשבילך!";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 left-4 w-12 h-12 rounded-full shadow-lg flex items-center justify-center z-40"
        style={{ backgroundColor: '#79DBD6' }}
      >
        <HelpCircle className="w-6 h-6 text-white" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2" style={{ color: '#79DBD6' }}>
              <HelpCircle className="w-5 h-5" />
              עזרה
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <div className="flex items-start gap-2 mb-2">
                <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-slate-700">{tip}</p>
              </div>
            </div>

            <Button
              onClick={() => {
                setOpen(false);
                navigate(createPageUrl('Chat'));
              }}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <MessageSquare className="w-4 h-4 ml-2" />
              שלח שאלה למאמן
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}