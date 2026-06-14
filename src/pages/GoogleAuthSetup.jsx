import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, ExternalLink } from 'lucide-react';

export default function GoogleAuthSetup() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4" dir="rtl">
      <Card className="max-w-2xl w-full p-8">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800 mb-2">
            נדרשת הפעלת Google OAuth
          </h1>
          <p className="text-slate-600">
            כדי שהמערכת תעבוד עם התחברות Google, צריך להפעיל אותה דרך ההגדרות
          </p>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="font-bold text-blue-900 mb-4 flex items-center gap-2">
            📋 הוראות הפעלה (פעם אחת בלבד)
          </h2>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">
                1
              </div>
              <div>
                <p className="font-medium text-blue-900">פתח את ההגדרות</p>
                <p className="text-sm text-blue-700">
                  Dashboard → Settings → Authentication
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">
                2
              </div>
              <div>
                <p className="font-medium text-blue-900">הפעל Google Authentication</p>
                <p className="text-sm text-blue-700">
                  לחץ על ה-toggle ליד "Google authentication"
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center flex-shrink-0 font-bold text-sm">
                3
              </div>
              <div>
                <p className="font-medium text-blue-900">בחר "Default Base44 OAuth"</p>
                <p className="text-sm text-blue-700">
                  זה הכי פשוט ומהיר - אין צורך בהגדרות נוספות
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-6 h-6 bg-green-600 text-white rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4" />
              </div>
              <div>
                <p className="font-medium text-green-900">סיימת!</p>
                <p className="text-sm text-green-700">
                  הכפתור "המשך עם Google" יופיע אוטומטית בדף ההתחברות
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
          <p className="text-sm text-amber-800">
            <strong>💡 למה זה דרך ההגדרות?</strong><br />
            Base44 מנהלת את דף ההתחברות באופן מרכזי כדי להבטיח אבטחה מקסימלית.
            לכן, הפעלת Google OAuth נעשית דרך ההגדרות ולא דרך קוד.
          </p>
        </div>

        <div className="text-center">
          <Button
            onClick={() => window.open('https://docs.base44.app/Setting-up-your-app/Managing-login-and-registration', '_blank')}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <ExternalLink className="w-4 h-4 ml-2" />
            פתח מדריך מפורט
          </Button>
          
          <p className="text-xs text-slate-500 mt-4">
            אחרי ההפעלה, רענן את הדף והכל יעבוד 🚀
          </p>
        </div>
      </Card>
    </div>
  );
}