import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RefreshCw, Check, AlertTriangle, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function SyncUsers() {
  const [syncing, setSyncing] = useState(false);
  const [report, setReport] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['allTrainees'],
    queryFn: () => base44.entities.Trainee.list(),
    enabled: user?.role === 'admin',
  });

  const handleSync = async () => {
    setSyncing(true);
    setReport(null);

    try {
      const response = await base44.functions.invoke('syncAllTraineesWithAuth', {});
      setReport(response.data.report);
    } catch (err) {
      console.error('Sync failed:', err);
      alert('הסנכרון נכשל: ' + err.message);
    } finally {
      setSyncing(false);
    }
  };

  const missingUserIds = trainees.filter(t => !t.user_id).length;

  if (user?.role !== 'admin') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4" dir="rtl">
        <Card className="p-6">
          <p className="text-slate-600">דף זה נגיש למנהלים בלבד</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">סנכרון משתמשים</h1>
            <p className="text-sm text-slate-600">קישור אוטומטי בין Auth Users לבין Trainees</p>
          </div>
          <Link to={createPageUrl('CoachDashboard')}>
            <Button variant="outline">חזור לדשבורד</Button>
          </Link>
        </div>

        <Card className="p-4 mb-6 bg-blue-50 border-blue-200">
          <p className="text-sm text-blue-800 mb-2">
            💡 <strong>מה זה עושה?</strong>
          </p>
          <ul className="text-xs text-blue-700 space-y-1 mr-4">
            <li>• עובר על כל המתאמנים במערכת</li>
            <li>• מחפש עבורם Auth User לפי מייל</li>
            <li>• מקשר אוטומטית user_id לטבלת Trainees</li>
            <li>• תיקון חד פעמי לנתונים קיימים</li>
          </ul>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="p-4 text-center">
            <Users className="w-8 h-8 mx-auto text-slate-400 mb-2" />
            <p className="text-3xl font-bold text-slate-800">{trainees.length}</p>
            <p className="text-sm text-slate-600">סה״כ מתאמנים</p>
          </Card>
          <Card className={`p-4 text-center ${missingUserIds > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
            {missingUserIds > 0 ? (
              <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2" />
            ) : (
              <Check className="w-8 h-8 mx-auto text-green-500 mb-2" />
            )}
            <p className="text-3xl font-bold text-slate-800">{missingUserIds}</p>
            <p className="text-sm text-slate-600">חסרי user_id</p>
          </Card>
        </div>

        {/* Sync Button */}
        <Button
          onClick={handleSync}
          disabled={syncing || missingUserIds === 0}
          className="w-full mb-6 h-14"
          style={{ backgroundColor: '#79DBD6' }}
        >
          {syncing ? (
            <>
              <RefreshCw className="w-5 h-5 ml-2 animate-spin" />
              מסנכרן...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5 ml-2" />
              {missingUserIds > 0 ? `סנכרן ${missingUserIds} מתאמנים` : 'הכל מסונכרן ✓'}
            </>
          )}
        </Button>

        {/* Report */}
        {report && (
          <Card className="p-4">
            <h3 className="font-bold text-slate-800 mb-4">תוצאות סנכרון</h3>
            
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-50 p-3 rounded-lg">
                <p className="text-xs text-slate-600">סה״כ נבדקו</p>
                <p className="text-2xl font-bold text-slate-800">{report.total}</p>
              </div>
              <div className="bg-green-50 p-3 rounded-lg">
                <p className="text-xs text-green-700">קושרו בהצלחה</p>
                <p className="text-2xl font-bold text-green-600">{report.linked}</p>
              </div>
              <div className="bg-blue-50 p-3 rounded-lg">
                <p className="text-xs text-blue-700">נוצרו חדשים</p>
                <p className="text-2xl font-bold text-blue-600">{report.created}</p>
              </div>
              <div className="bg-amber-50 p-3 rounded-lg">
                <p className="text-xs text-amber-700">דולגו (כבר מקושרים)</p>
                <p className="text-2xl font-bold text-amber-600">{report.skipped}</p>
              </div>
            </div>

            {report.errors.length > 0 && (
              <div className="border-t pt-4">
                <p className="text-sm font-medium text-red-800 mb-2">
                  ⚠️ שגיאות ({report.errors.length})
                </p>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {report.errors.map((err, i) => (
                    <div key={i} className="bg-red-50 border border-red-200 rounded p-2 text-xs">
                      <p className="font-medium text-red-900">{err.name || err.email}</p>
                      <p className="text-red-700">{err.error}</p>
                      {err.trainee_id && (
                        <p className="text-red-600 mt-1">ID: {err.trainee_id}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {report.linked > 0 && (
              <div className="mt-4 bg-green-50 border border-green-200 rounded p-3">
                <p className="text-sm text-green-800">
                  ✓ הסנכרון הושלם בהצלחה! {report.linked} מתאמנים קושרו למשתמשים שלהם.
                </p>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}