import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { AlertCircle, CheckCircle, RefreshCw } from 'lucide-react';

export default function BackfillUserIds() {
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState(null);

  const handleBackfill = async () => {
    setScanning(true);
    setResults(null);

    try {
      const allTrainees = await base44.entities.Trainee.list();
      const allUsers = await base44.entities.User.list();
      
      const stats = {
        scanned: 0,
        updated: 0,
        skipped_no_email: 0,
        skipped_no_auth: 0,
        skipped_already_has: 0,
        failed: 0,
        failures: []
      };

      console.log('[Backfill] Starting - found', allTrainees.length, 'trainees');

      for (const trainee of allTrainees) {
        stats.scanned++;
        
        // Skip if already has user_id
        if (trainee.user_id) {
          stats.skipped_already_has++;
          continue;
        }
        
        // Skip if no email
        if (!trainee.user_email) {
          stats.skipped_no_email++;
          continue;
        }

        // Find user by email (case-insensitive, trimmed)
        const normalizedEmail = trainee.user_email.trim().toLowerCase();
        const user = allUsers.find(u => 
          u.email?.trim().toLowerCase() === normalizedEmail
        );
        
        if (user) {
          try {
            console.log('[Backfill] Updating trainee', trainee.user_email, 'with user_id', user.id);
            
            // CRITICAL: Real UPDATE in database
            await base44.entities.Trainee.update(trainee.id, {
              user_id: user.id
            });
            
            stats.updated++;
            console.log('[Backfill] ✅ Updated successfully');
          } catch (err) {
            console.error('[Backfill] ❌ Update failed:', err);
            stats.failed++;
            stats.failures.push({
              trainee_email: trainee.user_email,
              trainee_name: trainee.full_name,
              reason: err.message
            });
          }
        } else {
          stats.skipped_no_auth++;
          stats.failures.push({
            trainee_email: trainee.user_email,
            trainee_name: trainee.full_name,
            reason: 'No auth user found with matching email'
          });
        }
      }

      console.log('[Backfill] Complete:', stats);
      setResults(stats);
    } catch (err) {
      console.error('Backfill failed:', err);
      setResults({
        error: err.message
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-4">🔧 Backfill User IDs</h3>
      <p className="text-sm text-slate-600 mb-4">
        כלי זה מאתר מתאמנים שחסר להם user_id ומשלים אותו לפי email
      </p>

      <Button
        onClick={handleBackfill}
        disabled={scanning}
        className="w-full mb-4"
        style={{ backgroundColor: '#79DBD6' }}
      >
        {scanning ? (
          <>
            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
            סורק...
          </>
        ) : (
          'התחל Backfill'
        )}
      </Button>

      {results && (
        <div className="space-y-3">
          {results.error ? (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">שגיאה</p>
                  <p className="text-sm text-red-600">{results.error}</p>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-3">
                <div className="p-3 bg-blue-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-blue-600">{results.scanned}</p>
                  <p className="text-xs text-slate-600">נסרקו</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-green-600">{results.updated}</p>
                  <p className="text-xs text-slate-600">עודכנו ✅</p>
                </div>
                <div className="p-3 bg-red-50 rounded-lg text-center">
                  <p className="text-2xl font-bold text-red-600">{results.failed}</p>
                  <p className="text-xs text-slate-600">שגיאות</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="p-2 bg-slate-50 rounded text-center">
                  <p className="text-sm font-bold text-slate-600">{results.skipped_already_has || 0}</p>
                  <p className="text-xs text-slate-500">כבר מלא</p>
                </div>
                <div className="p-2 bg-slate-50 rounded text-center">
                  <p className="text-sm font-bold text-slate-600">{results.skipped_no_email || 0}</p>
                  <p className="text-xs text-slate-500">אין email</p>
                </div>
                <div className="p-2 bg-slate-50 rounded text-center">
                  <p className="text-sm font-bold text-slate-600">{results.skipped_no_auth || 0}</p>
                  <p className="text-xs text-slate-500">אין auth user</p>
                </div>
              </div>

              {results.failures.length > 0 && (
                <div className="border border-amber-200 rounded-lg p-3 bg-amber-50">
                  <p className="font-medium text-amber-800 mb-2">כשלונות:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {results.failures.map((fail, i) => (
                      <div key={i} className="text-xs bg-white p-2 rounded border">
                        <p className="font-medium">{fail.trainee_name || fail.trainee_email}</p>
                        <p className="text-slate-500">{fail.reason}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {results.updated > 0 && (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <p className="text-sm text-green-800">
                      הושלמו {results.updated} מתאמנים בהצלחה
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </Card>
  );
}