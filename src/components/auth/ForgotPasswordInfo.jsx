import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

export default function ForgotPasswordInfo() {
  return (
    <Card className="p-6 max-w-md mx-auto" dir="rtl">
      <div className="flex items-start gap-3">
        <AlertCircle className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="font-bold text-slate-800 mb-2">שכחת את הסיסמה?</h3>
          <p className="text-slate-600 text-sm mb-3">
            בשלב הפיילוט, איפוס סיסמה מתבצע דרך המאמן.
          </p>
          <p className="text-slate-700 text-sm font-medium">
            💬 פנה למאמן שלך והוא יעדכן לך סיסמה חדשה.
          </p>
        </div>
      </div>
    </Card>
  );
}