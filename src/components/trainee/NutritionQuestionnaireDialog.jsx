import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NutritionQuestionnaireDialog({ open, onOpenChange, trainee, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    weight_kg: trainee?.weight_kg || '',
    height_cm: trainee?.height_cm || '',
    birth_date: trainee?.birth_date || '',
    gender: trainee?.gender || '',
    activity_routine: trainee?.activity_level || 'moderate_activity',
    training_days_per_week: 3,
    training_type: 'mixed',
    goal: trainee?.goal === 'lose' ? 'fat_loss' : trainee?.goal === 'gain' ? 'muscle_gain' : 'maintenance',
    pace: 'moderate',
    dietary_notes: '',
    restrictions: ''
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validate
    if (!formData.weight_kg || !formData.height_cm || !formData.birth_date || !formData.gender) {
      toast.error('מלא/י את כל השדות הנדרשים');
      return;
    }

    setLoading(true);
    try {
      // Call backend calculation function
      const calcResponse = await base44.functions.invoke('calculateNutritionTargets', {
        trainee_email: trainee.user_email,
        weight_kg: parseFloat(formData.weight_kg),
        height_cm: parseFloat(formData.height_cm),
        birth_date: formData.birth_date,
        gender: formData.gender,
        activity_level: formData.activity_routine,
        goal: formData.goal,
      });

      // Response shape: { ok: true, data: { targets: { calories, protein, carbs, fat, bmr, tdee } } }
      if (!calcResponse.ok) {
        toast.error('שגיאה בחישוב היעדים');
        return;
      }

      const targets = calcResponse.data?.targets;
      if (!targets?.calories) {
        toast.error('שגיאה בחישוב היעדים — אנא נסה שוב');
        return;
      }

      // Safety floor
      const minCalories = formData.gender === 'female' ? 1200 : 1500;
      if (targets.calories < minCalories) {
        toast.error(`יעד אגרסיבי מדי! מינימום בטוח: ${minCalories} kcal`);
        return;
      }

      // Save directly to Trainee — single source of truth for NutritionLog
      await base44.entities.Trainee.update(trainee.id, {
        target_calories: targets.calories,
        target_protein:  targets.protein,
        target_carbs:    targets.carbs,
        target_fat:      targets.fat,
      });

      toast.success(`יעדים עודכנו: ${targets.calories} kcal | חלבון: ${targets.protein}g`);
      onOpenChange(false);
      onSuccess?.();

    } catch (error) {
      console.error('Error:', error);
      toast.error('שגיאה בשמירת השאלון');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>שאלון תזונה</DialogTitle>
          <DialogDescription>
            מלא/י את הפרטים שלך כדי לקבל יעדי תזונה מדויקים
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Biometrics */}
          <div className="space-y-3 border-b pb-4">
            <h3 className="font-semibold text-sm">מדידות גוף</h3>
            
            <div>
              <label className="text-sm font-medium">משקל (ק״ג)</label>
              <Input
                type="number"
                step="0.1"
                value={formData.weight_kg}
                onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">גובה (ס״מ)</label>
              <Input
                type="number"
                value={formData.height_cm}
                onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">תאריך לידה</label>
              <Input
                type="date"
                value={formData.birth_date}
                onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
                required
              />
            </div>

            <div>
              <label className="text-sm font-medium">מין</label>
              <Select value={formData.gender} onValueChange={(val) => setFormData({ ...formData, gender: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="male">זכר</SelectItem>
                  <SelectItem value="female">נקבה</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Activity */}
          <div className="space-y-3 border-b pb-4">
            <h3 className="font-semibold text-sm">פעילות גופנית</h3>

            <div>
              <label className="text-sm font-medium">שגרת יומית</label>
              <Select value={formData.activity_routine} onValueChange={(val) => setFormData({ ...formData, activity_routine: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sedentary">ישיבה רובה של היום</SelectItem>
                  <SelectItem value="light_activity">פעילות קלה (הליכה)</SelectItem>
                  <SelectItem value="moderate_activity">פעילות בינונית</SelectItem>
                  <SelectItem value="active">עבודה פיזית</SelectItem>
                  <SelectItem value="very_active">עבודה פיזית כבדה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">ימי אימון בשבוע</label>
              <Input
                type="number"
                min="0"
                max="7"
                value={formData.training_days_per_week}
                onChange={(e) => setFormData({ ...formData, training_days_per_week: e.target.value })}
              />
            </div>

            <div>
              <label className="text-sm font-medium">סוג אימון</label>
              <Select value={formData.training_type} onValueChange={(val) => setFormData({ ...formData, training_type: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">אין</SelectItem>
                  <SelectItem value="strength">כוח</SelectItem>
                  <SelectItem value="pilates">פילאטיס</SelectItem>
                  <SelectItem value="cardio">כושר</SelectItem>
                  <SelectItem value="mixed">מעורבב</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Goal */}
          <div className="space-y-3 border-b pb-4">
            <h3 className="font-semibold text-sm">יעד</h3>

            <div>
              <label className="text-sm font-medium">מטרה</label>
              <Select value={formData.goal} onValueChange={(val) => setFormData({ ...formData, goal: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fat_loss">הפחתת שומן</SelectItem>
                  <SelectItem value="maintenance">שמירה על משקל</SelectItem>
                  <SelectItem value="muscle_gain">בנייה שרירית</SelectItem>
                  <SelectItem value="recomposition">ריקומפוזיציה</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium">קצב שינוי</label>
              <Select value={formData.pace} onValueChange={(val) => setFormData({ ...formData, pace: val })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="slow">אטי (בטוח יותר)</SelectItem>
                  <SelectItem value="moderate">בינוני (מאוזן)</SelectItem>
                  <SelectItem value="aggressive">אגרסיבי (מהיר)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">הערות תזונה</label>
              <Textarea
                placeholder="דיאטה מעדיפה, הגבלות, אלרגיות..."
                value={formData.dietary_notes}
                onChange={(e) => setFormData({ ...formData, dietary_notes: e.target.value })}
                className="h-20"
              />
            </div>

            <div>
              <label className="text-sm font-medium">הגבלות / פציעות</label>
              <Textarea
                placeholder="פציעות, בעיות בריאות, כדי שנוכל להתאים את המלצות"
                value={formData.restrictions}
                onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                className="h-20"
              />
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              ביטול
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              חשב יעדים
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}