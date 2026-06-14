import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, Droplets } from 'lucide-react';

/**
 * Displays water targets with explanation of calculation method.
 * 
 * Logic:
 * 1. If NutritionTargets exists → use daily_water_ml
 * 2. Else if questionnaire exists → weight * 35ml (clamp 2000-4000)
 * 3. Else → gender default (male=3000ml, female=2000ml)
 */
export default function WaterTargetsDisplay({ nutritionTargets, trainee, nutritionQuestionnaireData }) {
  if (!trainee) return null;

  let waterTarget = 0;
  let calculationMethod = '';
  let calculationDetails = '';

  if (nutritionTargets?.daily_water_ml) {
    // Method 1: Use saved nutrition targets
    waterTarget = nutritionTargets.daily_water_ml;
    
    if (nutritionTargets.source === 'questionnaire') {
      const weight = nutritionQuestionnaireData?.weight_kg || trainee.weight_kg;
      calculationMethod = 'תשובון קורי (משוקלל)';
      calculationDetails = weight ? `${weight}ק״ג × 35 = ${Math.round(weight * 35)}מ״ל (התוקף ${waterTarget}מ״ל)` : '';
    } else if (nutritionTargets.source === 'coach_manual') {
      calculationMethod = 'עריכה ידנית של מאמן';
      calculationDetails = '';
    } else {
      calculationMethod = 'חישוב אוטומטי';
      calculationDetails = '';
    }
  } else if (trainee?.weight_kg) {
    // Method 2: Calculate from trainee weight (if no questionnaire yet)
    let raw = trainee.weight_kg * 35;
    waterTarget = Math.max(2000, Math.min(raw, 4000));
    calculationMethod = 'חישוב לפי משקל';
    calculationDetails = `${trainee.weight_kg}ק״ג × 35 = ${raw}מ״ל → התוקף ${waterTarget}מ״ל (2-4 ליטר)`;
  } else {
    // Method 3: Gender default
    waterTarget = trainee?.gender === 'male' ? 3000 : 2000;
    calculationMethod = trainee?.gender === 'male' ? 'ברירת מחדל (זכר)' : 'ברירת מחדל (נקבה)';
    calculationDetails = '';
  }

  const isQuestionnaireActive = nutritionTargets?.source === 'questionnaire';
  const isDefault = !nutritionTargets && !trainee?.weight_kg;

  return (
    <Card className={isDefault ? 'border-amber-200 bg-amber-50 mb-4' : 'border-blue-200 bg-blue-50 mb-4'}>
      <CardContent className="pt-4">
        <div className="flex items-start gap-3">
          {isDefault ? (
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          )}
          
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Droplets className="w-4 h-4 text-blue-600" />
              <p className="font-bold text-sm text-slate-900">{waterTarget}מ״ל מים ביום</p>
            </div>
            
            <p className="text-xs text-slate-700 mb-1">
              <strong>שיטת חישוב:</strong> {calculationMethod}
            </p>
            
            {calculationDetails && (
              <p className="text-xs text-slate-600">
                {calculationDetails}
              </p>
            )}
            
            {isDefault && (
              <p className="text-xs text-amber-700 mt-2">
                💡 מלא/י שאלון תזונה לחישוב מדויק יותר
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}