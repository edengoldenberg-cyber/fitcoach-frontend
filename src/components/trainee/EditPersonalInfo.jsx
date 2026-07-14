import React, { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { User, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { calcNutritionTargets, ageFromBirthDate } from '@/utils/nutritionCalc';

export default function EditPersonalInfo({ open, onClose, trainee }) {
  const [formData, setFormData] = useState({
    weight_kg: '',
    height_cm: '',
    birth_date: '',
    gender: 'male',
    activity_level: 'moderate',
    goal: 'maintain',
    diet_type: 'balanced',
    goal_weight_change_kg: '',
    goal_timeline_weeks: '',
    target_weight_kg: '',
  });

  const [customCalories, setCustomCalories] = useState('');
  const [showCustomCalories, setShowCustomCalories] = useState(false);
  const [showManualEdit, setShowManualEdit] = useState(false);
  const [manualTargets, setManualTargets] = useState({
    target_calories: '',
    target_protein: '',
    target_carbs: '',
    target_fat: ''
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    if (trainee) {
      setFormData({
        weight_kg: trainee.weight_kg || '',
        height_cm: trainee.height_cm || '',
        birth_date: trainee.birth_date || '',
        gender: trainee.gender || 'male',
        activity_level: trainee.activity_level || 'moderate',
        goal: trainee.goal || 'maintain',
        diet_type: trainee.diet_type || 'balanced',
        goal_weight_change_kg: trainee.goal_weight_change_kg || '',
        goal_timeline_weeks: trainee.goal_timeline_weeks || '',
        target_weight_kg: trainee.target_weight_kg || '',
      });
      setManualTargets({
        target_calories: trainee.target_calories || '',
        target_protein: trainee.target_protein || '',
        target_carbs: trainee.target_carbs || '',
        target_fat: trainee.target_fat || ''
      });
    }
  }, [trainee]);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Trainee.update(trainee.id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      onClose();
    },
    onError: (error) => {
      alert('❌ שגיאה בשמירת הפרטים: ' + error.message);
    }
  });

  const age = ageFromBirthDate(formData.birth_date);

  // Canonical formula — identical to backend nutrition.fn.js
  const autoTargets = (formData.weight_kg && formData.height_cm && age)
    ? calcNutritionTargets({
        weight_kg:      formData.weight_kg,
        height_cm:      formData.height_cm,
        age,
        gender:         formData.gender,
        activity_level: formData.activity_level,
        goal:           formData.goal,
      })
    : null;

  const customTargets = (showCustomCalories && customCalories && formData.weight_kg && age)
    ? calcNutritionTargets({
        weight_kg:         formData.weight_kg,
        height_cm:         formData.height_cm,
        age,
        gender:            formData.gender,
        activity_level:    formData.activity_level,
        goal:              formData.goal,
        override_calories: customCalories,
      })
    : null;

  const displayTargets = customTargets || autoTargets;

  // Feedback for custom calorie input
  const getCustomCalorieFeedback = () => {
    if (!customTargets || !autoTargets) return null;
    const diff = customTargets.calories - autoTargets.tdee;
    if (diff < -1000) return { color: 'text-red-600', msg: '⚠️ גירעון גבוה מדי — עלול לפגוע בשרירים ובבריאות' };
    if (diff < -500) return { color: 'text-amber-600', msg: '🔥 גירעון משמעותי — ירידה מהירה של כ-0.5 ק"ג בשבוע' };
    if (diff < -200) return { color: 'text-emerald-600', msg: '✅ גירעון מתון — ירידה בריאה של כ-0.25 ק"ג בשבוע' };
    if (diff < 200) return { color: 'text-blue-600', msg: '⚖️ שמירה על משקל — קלוריות תחזוקה' };
    if (diff < 500) return { color: 'text-emerald-600', msg: '💪 עודף מתון — עלייה מבוקרת במסה' };
    return { color: 'text-amber-600', msg: '📈 עודף גבוה — עלייה מהירה, ייתכן שומן מיותר' };
  };

  const handleSave = () => {
    let targets;
    if (showManualEdit) {
      targets = {
        target_calories: parseFloat(manualTargets.target_calories),
        target_protein: parseFloat(manualTargets.target_protein),
        target_carbs: parseFloat(manualTargets.target_carbs),
        target_fat: parseFloat(manualTargets.target_fat),
      };
    } else if (displayTargets) {
      targets = {
        target_calories: displayTargets.calories,
        target_protein: displayTargets.protein,
        target_carbs: displayTargets.carbs,
        target_fat: displayTargets.fat,
      };
    } else {
      targets = {};
    }

    updateMutation.mutate({
      weight_kg:            parseFloat(formData.weight_kg),
      height_cm:            parseFloat(formData.height_cm),
      birth_date:           formData.birth_date || null,
      gender:               formData.gender,
      activity_level:       formData.activity_level,
      goal:                 formData.goal,
      diet_type:            formData.diet_type || null,
      goal_timeline_weeks:  formData.goal_timeline_weeks ? parseInt(formData.goal_timeline_weeks) : null,
      goal_weight_change_kg:formData.goal_weight_change_kg ? parseFloat(formData.goal_weight_change_kg) : null,
      target_weight_kg:     formData.target_weight_kg ? parseFloat(formData.target_weight_kg) : null,
      ...targets,
    });
  };

  const feedback = getCustomCalorieFeedback();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="w-5 h-5" style={{ color: '#79DBD6' }} />
            עריכת פרטים אישיים
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-blue-800">
              💡 הפרטים האלה עוזרים למנתח הפעילות הגופנית לחשב במדויק את הקלוריות שאתה שורף
            </p>
          </div>

          {/* Physical stats */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>משקל (ק"ג) *</Label>
              <Input type="number" step="0.1" value={formData.weight_kg}
                onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })} placeholder="75" />
            </div>
            <div>
              <Label>גובה (ס"מ) *</Label>
              <Input type="number" value={formData.height_cm}
                onChange={(e) => setFormData({ ...formData, height_cm: e.target.value })} placeholder="175" />
            </div>
          </div>

          <div>
            <Label>תאריך לידה *</Label>
            <Input type="date" value={formData.birth_date}
              onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
              max={new Date().toISOString().split('T')[0]} />
            {age && <p className="text-xs text-slate-500 mt-1">גיל: {age} שנים</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>מין *</Label>
              <select value={formData.gender}
                onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="male">זכר</option>
                <option value="female">נקבה</option>
              </select>
            </div>
            <div>
              <Label>רמת פעילות *</Label>
              <select value={formData.activity_level}
                onChange={(e) => setFormData({ ...formData, activity_level: e.target.value })}
                className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
                <option value="sedentary">מינימלית</option>
                <option value="light">קלה (1-2/שבוע)</option>
                <option value="moderate">בינונית (3-4)</option>
                <option value="active">גבוהה (5-6)</option>
                <option value="very_active">מאוד גבוהה</option>
              </select>
            </div>
          </div>

          {/* Goal */}
          <div>
            <Label>מטרה *</Label>
            <select value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              className="w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="lose">ירידה במשקל</option>
              <option value="maintain">שמירה על משקל</option>
              <option value="gain">עלייה במסה</option>
            </select>
          </div>

          {/* Goal weight & timeline — only for lose/gain */}
          {(formData.goal === 'lose' || formData.goal === 'gain') && (
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-3">
              <p className="text-xs font-medium text-slate-600">
                {formData.goal === 'lose' ? '🎯 יעד ירידה' : '🎯 יעד עלייה'}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">
                    {formData.goal === 'lose' ? 'כמה ק"ג לרדת' : 'כמה ק"ג לעלות'}
                  </Label>
                  <Input type="number" step="0.5" min="0"
                    value={formData.goal_weight_change_kg}
                    onChange={(e) => setFormData({ ...formData, goal_weight_change_kg: e.target.value })}
                    placeholder="5" className="h-8" />
                </div>
                <div>
                  <Label className="text-xs">בכמה שבועות</Label>
                  <Input type="number" min="1"
                    value={formData.goal_timeline_weeks}
                    onChange={(e) => setFormData({ ...formData, goal_timeline_weeks: e.target.value })}
                    placeholder="12" className="h-8" />
                </div>
              </div>
              <div>
                <Label className="text-xs">משקל יעד (ק"ג)</Label>
                <Input type="number" step="0.5" min="0"
                  value={formData.target_weight_kg}
                  onChange={(e) => setFormData({ ...formData, target_weight_kg: e.target.value })}
                  placeholder="70" className="h-8" />
              </div>
              {formData.goal_weight_change_kg && formData.goal_timeline_weeks && (
                <p className="text-xs text-teal-700 bg-teal-50 rounded px-2 py-1">
                  📅 קצב: {(parseFloat(formData.goal_weight_change_kg) / parseFloat(formData.goal_timeline_weeks)).toFixed(2)} ק"ג בשבוע
                </p>
              )}
            </div>
          )}

          {/* Protein note */}
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
            <p className="text-xs text-slate-500">
              💡 חלבון מחושב לפי 2 גרם/ק"ג משקל גוף — תקן מקצועי לאימוני כוח
            </p>
          </div>

          {/* Auto targets display */}
          {displayTargets && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-emerald-800">
                  {customTargets ? '🎯 יעדים לפי הקלוריות שבחרת' : 'יעדים מומלצים:'}
                </p>
                <Button type="button" variant="ghost" size="sm"
                  onClick={() => setShowManualEdit(!showManualEdit)} className="text-xs h-6 px-2">
                  {showManualEdit ? 'חזור למומלץ' : 'עריכה ידנית'}
                </Button>
              </div>

              {!showManualEdit ? (
                <div className="grid grid-cols-2 gap-1 text-xs">
                  <p className="text-emerald-700">קלוריות: <strong>{displayTargets.calories}</strong></p>
                  <p className="text-emerald-700">חלבון: <strong>{displayTargets.protein}g</strong></p>
                  <p className="text-emerald-700">פחמימות: <strong>{displayTargets.carbs}g</strong></p>
                  <p className="text-emerald-700">שומן: <strong>{displayTargets.fat}g</strong></p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'target_calories', label: 'קלוריות', ph: displayTargets.calories },
                    { key: 'target_protein', label: 'חלבון (g)', ph: displayTargets.protein },
                    { key: 'target_carbs', label: 'פחמימות (g)', ph: displayTargets.carbs },
                    { key: 'target_fat', label: 'שומן (g)', ph: displayTargets.fat },
                  ].map(f => (
                    <div key={f.key}>
                      <Label className="text-xs">{f.label}</Label>
                      <Input type="number"
                        value={manualTargets[f.key]}
                        onChange={(e) => setManualTargets({ ...manualTargets, [f.key]: e.target.value })}
                        placeholder={f.ph} className="h-8 text-xs" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Custom calorie input section */}
          <div className="border border-dashed border-slate-300 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowCustomCalories(!showCustomCalories)}
              className="w-full flex items-center justify-between px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              <span>🍽️ רוצה להזין קלוריות ידנית?</span>
              {showCustomCalories ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showCustomCalories && (
              <div className="px-3 pb-3 space-y-2">
                <Label className="text-xs text-slate-500">כמה קלוריות ביום אתה רוצה לאכול?</Label>
                <Input
                  type="number"
                  min="800" max="5000" step="50"
                  value={customCalories}
                  onChange={(e) => setCustomCalories(e.target.value)}
                  placeholder={autoTargets?.calories || 2000}
                />
                {feedback && (
                  <p className={`text-xs font-medium ${feedback.color} bg-white border rounded px-2 py-1.5`}>
                    {feedback.msg}
                  </p>
                )}
                {customTargets && (
                  <p className="text-xs text-slate-500">
                    המאקרו יחושב לפי הקלוריות שהוגדרו
                  </p>
                )}
                {customCalories && (
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    style={{ backgroundColor: '#79DBD6', color: 'white' }}
                    onClick={() => {
                      // Accepted — custom stays applied, close panel
                      setShowCustomCalories(false);
                    }}
                  >
                    ✅ אשר וקבע כיעד
                  </Button>
                )}
              </div>
            )}
          </div>

          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !formData.weight_kg || !formData.height_cm || !formData.birth_date}
            className="w-full"
            style={{ backgroundColor: '#79DBD6', color: 'white' }}
          >
            {updateMutation.isPending ? 'שומר...' : (
              <><Save className="w-4 h-4 ml-2" />שמור פרטים</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}