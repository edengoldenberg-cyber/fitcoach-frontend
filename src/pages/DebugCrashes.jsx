import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Copy, RefreshCw, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function DebugCrashes() {
  const [crashes, setCrashes] = useState([]);
  const [filter, setFilter] = useState('all'); // all, today, week

  useEffect(() => {
    loadCrashes();
  }, []);

  const loadCrashes = () => {
    try {
      const stored = localStorage.getItem('lastCrash');
      if (stored) {
        const crash = JSON.parse(stored);
        setCrashes([crash]);
      }
    } catch (err) {
      console.error('Failed to load crashes:', err);
    }
  };

  const handleCopyCrash = (crash) => {
    const report = `
דוח תקלה - FIT COACH PRO
=========================
זמן: ${new Date(crash.time).toLocaleString('he-IL')}
נתיב: ${crash.route}
שגיאה: ${crash.message}

Stack Trace:
${crash.stack || 'לא זמין'}

מכשיר: ${crash.userAgent}
    `.trim();

    navigator.clipboard.writeText(report).then(() => {
      alert('דוח התקלה הועתק ללוח');
    }).catch(() => {
      alert('לא ניתן להעתיק. נסה שוב.');
    });
  };

  const handleClearCrashes = () => {
    if (confirm('האם למחוק את כל דוחות התקלות?')) {
      localStorage.removeItem('lastCrash');
      setCrashes([]);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">בדיקת קריסות מתאמנים</h1>
            <p className="text-sm text-slate-600">דוחות תקלות שנתפסו ב-Error Boundary</p>
          </div>
          <div className="flex gap-2">
            <Button onClick={loadCrashes} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 ml-2" />
              רענן
            </Button>
            {crashes.length > 0 && (
              <Button onClick={handleClearCrashes} variant="outline" size="sm" className="text-red-600">
                <Trash2 className="w-4 h-4 ml-2" />
                נקה הכל
              </Button>
            )}
          </div>
        </div>

        <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800">
            💡 כאשר מתאמן נתקל בקריסה, המידע נשמר כאן. זה עוזר לזהות בעיות במהירות.
          </p>
        </Card>

        {crashes.length === 0 ? (
          <Card className="p-12 text-center bg-white">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">✓</span>
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">אין דוחות קריסה</h3>
            <p className="text-sm text-slate-600">כל המתאמנים עובדים תקין 👍</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {crashes.map((crash, index) => (
              <Card key={index} className="p-4 border-2 border-red-200 bg-red-50">
                <div className="flex items-start gap-3 mb-3">
                  <AlertTriangle className="w-6 h-6 text-red-500 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-slate-800">קריסה באפליקציה</h3>
                      <span className="text-xs text-slate-500">
                        {new Date(crash.time).toLocaleString('he-IL')}
                      </span>
                    </div>
                    
                    <div className="bg-white border border-red-200 rounded-lg p-3 mb-3">
                      <p className="text-sm font-medium text-red-900 mb-1">שגיאה:</p>
                      <p className="text-xs text-red-700 font-mono break-all">{crash.message}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
                      <div className="bg-white p-2 rounded">
                        <span className="font-medium text-slate-700">נתיב:</span>
                        <p className="text-slate-600 break-all">{crash.route || 'לא זמין'}</p>
                      </div>
                      <div className="bg-white p-2 rounded">
                        <span className="font-medium text-slate-700">מכשיר:</span>
                        <p className="text-slate-600 truncate" title={crash.userAgent}>
                          {crash.userAgent?.includes('Mobile') ? '📱 מובייל' : '💻 מחשב'}
                        </p>
                      </div>
                    </div>

                    {crash.stack && (
                      <details className="bg-white border border-red-200 rounded-lg p-2 mb-3">
                        <summary className="text-xs font-medium text-slate-700 cursor-pointer">
                          Stack Trace (לחץ להרחבה)
                        </summary>
                        <pre className="text-xs text-slate-600 mt-2 overflow-x-auto whitespace-pre-wrap">
                          {crash.stack}
                        </pre>
                      </details>
                    )}

                    <Button
                      onClick={() => handleCopyCrash(crash)}
                      size="sm"
                      variant="outline"
                      className="w-full"
                    >
                      <Copy className="w-3 h-3 ml-2" />
                      העתק דוח מלא
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        <div className="mt-6">
          <Link to={createPageUrl('CoachDashboard')}>
            <Button variant="outline" className="w-full">
              חזור לפאנל מאמן
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}