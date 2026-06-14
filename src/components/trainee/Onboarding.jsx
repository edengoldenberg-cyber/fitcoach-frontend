import React, { useState } from 'react';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Utensils, Activity, MessageSquare, ChevronLeft } from "lucide-react";
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Onboarding({ onComplete, onSkip }) {
  const [step, setStep] = useState(1);
  const navigate = useNavigate();

  const steps = [
    {
      title: "ברוך הבא 👋",
      content: (
        <div className="text-center space-y-4 py-8">
          <div className="text-6xl mb-4">💪</div>
          <h2 className="text-2xl font-bold text-slate-800">כיף שאתה כאן!</h2>
          <p className="text-slate-600 px-4 leading-relaxed">
            FIT COACH PRO עוזרת לך לעקוב, להבין ולהתקדם – יחד עם המאמן שלך.
          </p>
        </div>
      )
    },
    {
      title: "איך מתחילים",
      content: (
        <div className="space-y-4 py-4">
          <h2 className="text-xl font-bold text-slate-800 text-center mb-6">3 צעדים קלים</h2>
          
          <Card className="p-4 flex items-center gap-3" style={{ borderColor: '#79DBD6' }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold" 
                 style={{ backgroundColor: '#79DBD6' }}>1</div>
            <div className="flex-1">
              <p className="font-medium text-slate-800">הזן ארוחה ראשונה</p>
              <p className="text-xs text-slate-500">כדי שנבין איפה אתה</p>
            </div>
            <Button 
              size="sm" 
              onClick={() => { onComplete(); navigate(createPageUrl('NutritionLog')); }}
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Utensils className="w-4 h-4" />
            </Button>
          </Card>

          <Card className="p-4 flex items-center gap-3 border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold">2</div>
            <div className="flex-1">
              <p className="font-medium text-slate-800">הזן פעילות / צעדים היום</p>
              <p className="text-xs text-slate-500">כל תנועה נחשבת</p>
            </div>
            <Button 
              size="sm"
              variant="outline"
              onClick={() => { onComplete(); navigate(createPageUrl('Activity')); }}
            >
              <Activity className="w-4 h-4" />
            </Button>
          </Card>

          <Card className="p-4 flex items-center gap-3 border-slate-200">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-700 font-bold">3</div>
            <div className="flex-1">
              <p className="font-medium text-slate-800">שלח הודעה למאמן</p>
              <p className="text-xs text-slate-500">תמיד פה בשבילך</p>
            </div>
            <Button 
              size="sm"
              variant="outline"
              onClick={() => { onComplete(); navigate(createPageUrl('Chat')); }}
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
          </Card>
        </div>
      )
    },
    {
      title: "ציפיות",
      content: (
        <div className="text-center space-y-6 py-8">
          <div className="text-6xl mb-4">🎯</div>
          <div className="space-y-4 px-4">
            <p className="text-lg font-medium text-slate-800">
              האפליקציה לא שופטת – היא עוזרת.
            </p>
            <p className="text-slate-600 leading-relaxed">
              ככל שתזין יותר, המאמן יוכל לדייק אותך יותר.
            </p>
          </div>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-500 mt-8">
            <CheckCircle className="w-4 h-4" style={{ color: '#79DBD6' }} />
            <span>מוכן לצאת לדרך</span>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col" dir="rtl">
      {/* Header */}
      <div className="p-4 border-b bg-white">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <h1 className="text-lg font-bold" style={{ color: '#79DBD6' }}>FIT COACH PRO</h1>
          <div className="flex gap-1">
            {[1, 2, 3].map(i => (
              <div 
                key={i}
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: i === step ? '#79DBD6' : '#e2e8f0' }}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-8">
          {steps[step - 1].content}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t bg-white">
        <div className="max-w-lg mx-auto flex gap-3">
          {step < 3 ? (
            <>
              <Button 
                variant="outline" 
                onClick={onSkip}
                className="flex-1"
              >
                דלג
              </Button>
              <Button 
                onClick={() => setStep(step + 1)}
                className="flex-1"
                style={{ backgroundColor: '#79DBD6' }}
              >
                הבא
                <ChevronLeft className="w-4 h-4 mr-2" />
              </Button>
            </>
          ) : (
            <Button 
              onClick={onComplete}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              בואו נתחיל! 🚀
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}