import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Copy, Eye } from 'lucide-react';

/**
 * Displays trainee login readiness status and provides recovery actions
 * Part of the trainee invite/restore flow fix
 */
export default function TraineeLoginStatusPanel({ trainee, authUser, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  // Determine status
  const hasUserEmail = !!trainee?.user_email;
  const hasUserId = !!trainee?.user_id;
  const hasAuthUser = !!authUser;
  const isDeleted = trainee?.status === 'deleted' || trainee?.deleted_at;
  const isInactive = trainee?.status === 'inactive';

  // Main verdict
  let status = 'unknown';
  let verdict = '';
  let color = 'slate';

  if (!hasAuthUser) {
    status = 'auth_user_missing';
    verdict = '⚠️ צריך להזמין דרך Base44';
    color = 'amber';
  } else if (!hasUserId) {
    status = 'missing_user_id';
    verdict = '⚠️ משתמש לא קשור';
    color = 'amber';
  } else if (isDeleted) {
    status = 'deleted';
    verdict = '⛔ מתאמן מחוק';
    color = 'red';
  } else if (isInactive) {
    status = 'inactive';
    verdict = '⚠️ מתאמן לא פעיל';
    color = 'amber';
  } else {
    status = 'ready';
    verdict = '✅ מוכן להתחברות';
    color = 'green';
  }

  const handleRestoreTrainee = async () => {
    setLoading(true);
    try {
      await base44.asServiceRole.entities.Trainee.update(trainee.id, {
        status: 'active',
      });
      alert('המתאמן שוחזר בהצלחה');
      onRefresh?.();
    } catch (err) {
      alert('שגיאה בשחזור: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCopyInstructions = () => {
    const text = `הזמן את ${trainee?.full_name} (${trainee?.user_email}) דרך Base44 Users/Admin panel`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="p-4 border-2" style={{ borderColor: color === 'green' ? '#10b981' : color === 'red' ? '#ef4444' : color === 'amber' ? '#f59e0b' : '#e2e8f0' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-slate-800">מצב התחברות</h3>
        <Badge className={`text-xs py-1 ${
          status === 'ready' ? 'bg-green-100 text-green-700' :
          status === 'deleted' ? 'bg-red-100 text-red-700' :
          'bg-amber-100 text-amber-700'
        }`}>
          {verdict}
        </Badge>
      </div>

      <div className="space-y-2 mb-4 text-sm">
        <div className="flex items-center gap-2">
          {hasAuthUser ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
          <span className={hasAuthUser ? 'text-green-700' : 'text-red-700'}>
            Auth/User: {hasAuthUser ? '✅ קיים' : '❌ חסר'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasUserId ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
          <span className={hasUserId ? 'text-green-700' : 'text-amber-700'}>
            Trainee.user_id: {hasUserId ? '✅ קיים' : '⚠️ חסר'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {!isDeleted ? <CheckCircle2 className="w-4 h-4 text-green-600" /> : <XCircle className="w-4 h-4 text-red-600" />}
          <span className={!isDeleted ? 'text-green-700' : 'text-red-700'}>
            סטטוס: {!isDeleted ? '✅ פעיל' : '❌ מחוק/לא פעיל'}
          </span>
        </div>
      </div>

      {/* Actions based on status */}
      {status === 'auth_user_missing' && (
        <Alert className="mb-3 border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-xs">
            {trainee?.full_name} צריך להזמן דרך Base44 Users כדי ליצור משתמש התחברות
          </AlertDescription>
        </Alert>
      )}

      {status === 'auth_user_missing' && (
        <Button
          size="sm"
          variant="outline"
          className="w-full text-xs"
          onClick={handleCopyInstructions}
        >
          {copied ? '✅ הועתק' : <><Copy className="w-3 h-3 mr-1" /> העתק הוראות</>}
        </Button>
      )}

      {status === 'deleted' && (
        <Button
          size="sm"
          className="w-full bg-green-600 hover:bg-green-700 text-white text-xs"
          onClick={handleRestoreTrainee}
          disabled={loading}
        >
          {loading ? 'שוחזר...' : '🔄 שחזר מתאמן'}
        </Button>
      )}

      {status === 'ready' && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800 text-xs">
            מוכן להתחברות ולקבלת magic link
          </AlertDescription>
        </Alert>
      )}
    </Card>
  );
}