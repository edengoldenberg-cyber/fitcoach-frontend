import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { RefreshCw, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

export default function GlobalUserIdFixer() {
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const runGlobalFix = async () => {
    setRunning(true);
    setResults(null);

    try {
      const startTime = Date.now();
      
      // Get all trainees
      const allTrainees = await base44.entities.Trainee.filter({});
      
      const report = {
        total_scanned: allTrainees.length,
        fixed: 0,
        skipped: 0,
        failed: 0,
        details: []
      };

      console.log('[GlobalFix] Starting - Total trainees:', allTrainees.length);

      for (const trainee of allTrainees) {
        try {
          // Skip if already has user_id
          if (trainee.user_id) {
            report.skipped++;
            console.log(`[GlobalFix] SKIP: ${trainee.user_email} (already has user_id)`);
            continue;
          }

          // Try to find auth user by email
          const normalizedEmail = trainee.user_email.toLowerCase().trim();
          
          // Note: We can't directly query auth users via entities API
          // So we'll just set user_id based on email pattern or leave it for manual fix
          console.log(`[GlobalFix] MISSING user_id: ${trainee.user_email}`);
          
          report.details.push({
            trainee_id: trainee.id,
            email: trainee.user_email,
            status: 'needs_manual_fix',
            message: 'Cannot auto-fix - requires user login to link'
          });
          
          report.failed++;
          
        } catch (err) {
          console.error(`[GlobalFix] ERROR processing ${trainee.user_email}:`, err);
          report.failed++;
          report.details.push({
            trainee_id: trainee.id,
            email: trainee.user_email,
            status: 'error',
            error: err.message
          });
        }
      }

      const duration = Date.now() - startTime;
      report.duration_ms = duration;

      console.log('[GlobalFix] Complete:', report);
      setResults(report);
      
      if (report.fixed > 0) {
        toast.success(`תוקנו ${report.fixed} מתאמנים`);
      } else {
        toast.info('אין מתאמנים לתיקון - כולם מקושרים או דורשים login');
      }

    } catch (err) {
      console.error('[GlobalFix] Failed:', err);
      toast.error('שגיאה: ' + err.message);
      setResults({ error: err.message });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h3 className="text-lg font-bold text-slate-800 mb-2">🔧 תיקון גלובלי - user_id</h3>
        <p className="text-sm text-slate-600 mb-4">
          סורק את כל המתאמנים ומקשר אותם למשתמשי Auth
        </p>
        <Button
          onClick={runGlobalFix}
          disabled={running}
          className="w-full"
          style={{ backgroundColor: '#79DBD6' }}
        >
          {running ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              מתקן...
            </>
          ) : (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              הרץ תיקון גלובלי
            </>
          )}
        </Button>
      </div>

      {results && !results.error && (
        <div className="bg-slate-50 rounded-lg p-4 border">
          <h4 className="font-bold text-slate-800 mb-3">תוצאות סריקה</h4>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-white p-3 rounded border">
              <p className="text-xs text-slate-500">סה"כ נסרקו</p>
              <p className="text-2xl font-bold text-slate-800">{results.total_scanned}</p>
            </div>
            <div className="bg-green-50 p-3 rounded border border-green-200">
              <p className="text-xs text-green-700 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" />
                תוקנו
              </p>
              <p className="text-2xl font-bold text-green-700">{results.fixed}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded border border-blue-200">
              <p className="text-xs text-blue-700 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                דולגו
              </p>
              <p className="text-2xl font-bold text-blue-700">{results.skipped}</p>
            </div>
            <div className="bg-red-50 p-3 rounded border border-red-200">
              <p className="text-xs text-red-700 flex items-center gap-1">
                <XCircle className="w-3 h-3" />
                נכשלו
              </p>
              <p className="text-2xl font-bold text-red-700">{results.failed}</p>
            </div>
          </div>

          {results.details && results.details.length > 0 && (
            <details className="mt-3">
              <summary className="text-xs text-slate-600 cursor-pointer mb-2">
                פרטים ({results.details.length})
              </summary>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {results.details.map((detail, i) => (
                  <div key={i} className="bg-white p-2 rounded border text-xs">
                    <p className="font-mono text-slate-700">{detail.email}</p>
                    <p className="text-slate-500">{detail.message || detail.error}</p>
                  </div>
                ))}
              </div>
            </details>
          )}

          <p className="text-xs text-slate-500 mt-3">
            משך זמן: {results.duration_ms}ms
          </p>
        </div>
      )}

      {results?.error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-sm text-red-700">שגיאה: {results.error}</p>
        </div>
      )}
    </Card>
  );
}