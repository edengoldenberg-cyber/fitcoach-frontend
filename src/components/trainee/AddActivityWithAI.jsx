import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Info } from 'lucide-react';

// טבלת MET לפי סוג פעילות ועצימות
const MET_TABLE = {
  'כוח': { low: 3.5, moderate: 5.0, high: 6.0 },
  'הליכה': { low: 2.8, moderate: 3.5, high: 4.3 },
  'ריצה': { low: 8, moderate: 10, high: 12 },
  'HIIT': { low: 8, moderate: 10, high: 12 },
  'אופניים': { low: 4, moderate: 6, high: 8 },
  'חתירה': { low: 6, moderate: 8, high: 10 },
  'פילאטיס': { low: 3, moderate: 4, high: 5 },
  'שחייה': { low: 6, moderate: 8, high: 10 },
  'קרוספיט': { low: 8, moderate: 10, high: 12 },
  'יוגה': { low: 2.5, moderate: 3.5, high: 4.5 },
  'אירובי': { low: 5, moderate: 7, high: 9 },
  'כדורסל': { low: 6, moderate: 8, high: 10 },
  'כדורגל': { low: 7, moderate: 9, high: 11 },
  'טניס': { low: 5, moderate: 7, high: 9 },
  'סקווש': { low: 7, moderate: 9, high: 12 },
  'אחר': { low: 4, moderate: 6, high: 8 }
};

export default function AddActivityWithAI({ open, onClose, onSuccess, traineeEmail }) {
  const [activityType, setActivityType] = useState('');
  const [intensity, setIntensity] = useState('moderate');
  const [duration, setDuration] = useState('');
  const [tempWeight, setTempWeight] = useState('');
  const [result, setResult] = useState(null);

  const { data: trainee } = useQuery({
    queryKey: ['trainee', traineeEmail],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
      return trainees[0];
    },
    enabled: !!traineeEmail,
  });

  const handleCalculate = () => {
    if (!activityType || !duration) {
      alert('נא למלא את כל השדות');
      return;
    }

    const weight = trainee?.weight_kg || parseFloat(tempWeight);
    if (!weight) {
      alert('נא להזין משקל');
      return;
    }

    // קבלת MET מהטבלה
    const metValue = MET_TABLE[activityType]?.[intensity] || MET_TABLE['אחר'][intensity];
    
    // חישוב: MET * משקל(ק"ג) * זמן(בשעות)
    const durationHours = parseFloat(duration) / 60;
    const caloriesBurned = Math.round(metValue * weight * durationHours);

    setResult({
      calories: caloriesBurned,
      met: metValue,
      formula: `${metValue} (MET) × ${weight} (ק"ג) × ${durationHours.toFixed(2)} (שעות)`
    });
  };

  const handleSave = async () => {
    if (!result) return;

    try {
      const today = new Date().toISOString().split('T')[0];
      
      await base44.entities.ActivityLog.create({
        trainee_email: traineeEmail,
        date: today,
        activity_type: activityType,
        intensity,
        duration_minutes: parseInt(duration),
        met_used: result.met,
        calories_burned: result.calories,
      });

      if (onSuccess) {
        await onSuccess({
          trainee_email: traineeEmail,
          date: today,
          activity_type: activityType,
          intensity,
          duration_minutes: parseInt(duration),
          calories_burned: result.calories,
        });
      }

      alert('✅ הפעילות נשמרה ביומן!');
      setActivityType('');
      setIntensity('moderate');
      setDuration('');
      setTempWeight('');
      setResult(null);
      onClose();
    } catch (err) {
      console.error('Failed to save activity:', err);
      alert('שגיאה בשמירת הפעילות: ' + err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" style={{ color: '#79DBD6' }} />
            מחשבון הוצאה קלורית
          </DialogTitle>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-xs text-blue-800 flex items-start gap-2">
                <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>החישוב מבוסס על נוסחת MET (Metabolic Equivalent). MET × משקל × זמן = קלוריות נשרפות</span>
              </p>
            </div>

            {!trainee?.weight_kg && (
              <div>
                <Label>משקל (ק"ג) *</Label>
                <Input
                  type="number"
                  step="0.1"
                  value={tempWeight}
                  onChange={(e) => setTempWeight(e.target.value)}
                  placeholder="75"
                />
                <p className="text-xs text-slate-500 mt-1">לא נמצא משקל בפרופיל. הזן משקל לחישוב.</p>
              </div>
            )}

            <div>
              <Label>סוג פעילות *</Label>
              <Select value={activityType} onValueChange={setActivityType}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר סוג פעילות..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="כוח">כוח</SelectItem>
                  <SelectItem value="הליכה">הליכה</SelectItem>
                  <SelectItem value="ריצה">ריצה</SelectItem>
                  <SelectItem value="HIIT">HIIT</SelectItem>
                  <SelectItem value="אופניים">אופניים</SelectItem>
                  <SelectItem value="חתירה">חתירה</SelectItem>
                  <SelectItem value="פילאטיס">פילאטיס</SelectItem>
                  <SelectItem value="שחייה">שחייה</SelectItem>
                  <SelectItem value="קרוספיט">קרוספיט</SelectItem>
                  <SelectItem value="יוגה">יוגה</SelectItem>
                  <SelectItem value="אירובי">אירובי</SelectItem>
                  <SelectItem value="כדורסל">כדורסל</SelectItem>
                  <SelectItem value="כדורגל">כדורגל</SelectItem>
                  <SelectItem value="טניס">טניס</SelectItem>
                  <SelectItem value="סקווש">סקווש</SelectItem>
                  <SelectItem value="אחר">אחר</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>עצימות *</Label>
              <Select value={intensity} onValueChange={setIntensity}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">נמוכה (קל, נינוח)</SelectItem>
                  <SelectItem value="moderate">בינונית (בקצב סביר)</SelectItem>
                  <SelectItem value="high">גבוהה (אינטנסיבי)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>משך זמן (דקות) *</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="30"
                min="1"
              />
            </div>

            <Button
              onClick={handleCalculate}
              disabled={!activityType || !duration || (!trainee?.weight_kg && !tempWeight)}
              className="w-full"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
            >
              חשב
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-orange-50 to-red-50 border-2 border-orange-200 rounded-lg p-5">
              <div className="text-center mb-4">
                <p className="text-sm text-slate-600 mb-1">קלוריות נשרפו</p>
                <p className="text-5xl font-bold text-orange-600">{result.calories}</p>
              </div>
              
              <div className="pt-3 border-t border-orange-200 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-600">MET:</span>
                  <span className="font-semibold text-slate-800">{result.met}</span>
                </div>
                <div className="text-xs text-slate-700">
                  <strong>נוסחה:</strong> {result.formula}
                </div>
              </div>
            </div>

            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <p className="text-sm text-emerald-800">
                <strong>💪 השפעה על מאזן יומי:</strong>
                <br />
                {trainee?.include_burned_calories_in_balance 
                  ? `הקלוריות הנשרפות (${result.calories}) יקטינו את יעד הקלוריות שלך היום`
                  : 'הקלוריות יירשמו ליומן פעילות לעקוב'}
              </p>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => setResult(null)}
                variant="outline"
                className="flex-1"
              >
                חישוב חדש
              </Button>
              <Button
                onClick={handleSave}
                className="flex-1"
                style={{ backgroundColor: '#79DBD6', color: 'white' }}
              >
                הוסף ליומן פעילות
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}