import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, AlertOctagon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

/**
 * Debug component showing the active nutrition targets.
 * Shows source and warns if multiple sources exist.
 */
export default function NutritionTargetsDebug({ targets, traineeEmail }) {
  const [showDetails, setShowDetails] = useState(false);

  if (!targets) {
    return (
      <Card className="border-amber-200 bg-amber-50 mb-4">
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-sm text-amber-900">חסר שאלון תזונה</p>
              <p className="text-xs text-amber-700 mt-1">
                מלא/י שאלון כדי לקבל יעדים מדויקים והמלצות AI
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const sourceLabels = {
    'questionnaire': 'שאלון תזונה',
    'coach_manual': 'עריכה ידנית של מאמן',
    'auto_calculated': 'חישוב אוטומטי'
  };

  return (
    <Card className="border-green-200 bg-green-50 mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-green-600" />
            יעדים יומיים פעילים
          </CardTitle>
          <Badge variant="outline" className="bg-green-100">
            {sourceLabels[targets.source] || 'לא ידוע'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="text-xs space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white p-2 rounded border border-green-200">
            <p className="text-green-700 font-semibold">{targets.daily_calories}</p>
            <p className="text-green-600">קלוריות</p>
          </div>
          <div className="bg-white p-2 rounded border border-green-200">
            <p className="text-green-700 font-semibold">{targets.daily_protein_g}g</p>
            <p className="text-green-600">חלבון</p>
          </div>
          <div className="bg-white p-2 rounded border border-green-200">
            <p className="text-green-700 font-semibold">{targets.daily_carbs_g}g</p>
            <p className="text-green-600">פחמימות</p>
          </div>
          <div className="bg-white p-2 rounded border border-green-200">
            <p className="text-green-700 font-semibold">{targets.daily_fat_g}g</p>
            <p className="text-green-600">שומן</p>
          </div>
          <div className="bg-white p-2 rounded border border-green-200 col-span-2">
            <p className="text-green-700 font-semibold">{targets.daily_water_ml}ml</p>
            <p className="text-green-600">מים</p>
          </div>
        </div>
        
        {targets.calculation_details && (
          <>
            <button
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between p-2 bg-green-100 rounded text-green-700 font-semibold hover:bg-green-200 transition-colors mt-2"
            >
              <span>פירוט החישוב</span>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            
            {showDetails && (
              <div className="bg-white p-3 rounded border border-green-200 space-y-2 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-green-600">BMR (Mifflin-St Jeor):</span>
                  <span className="font-semibold text-green-700">{targets.calculation_details.bmr} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">כפל פעילות:</span>
                  <span className="font-semibold text-green-700">x{targets.calculation_details.activity_multiplier}</span>
                </div>
                <div className="flex justify-between border-t border-green-200 pt-1 mt-1">
                  <span className="text-green-600">TDEE:</span>
                  <span className="font-semibold text-green-700">{targets.calculation_details.tdee} kcal</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-green-600">גרעון:</span>
                  <span className="font-semibold text-green-700">{targets.calculation_details.deficit_percent}%</span>
                </div>
                {targets.calculation_details.safety_floor_applied && (
                  <div className="flex justify-between bg-amber-50 p-1.5 rounded border border-amber-200">
                    <span className="text-amber-700">דירוג בטיחות הופעל:</span>
                    <span className="font-semibold text-amber-700">✓</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-green-200 pt-1 mt-1">
                  <span className="text-green-600">סה"כ קלוריות ממאקרו:</span>
                  <span className="font-semibold text-green-700">{targets.calculation_details.macros_total_cals} kcal</span>
                </div>
              </div>
            )}
          </>
        )}

        {targets.calculation_details?.aggressive_warning && (
          <div className="bg-amber-50 border border-amber-200 rounded p-2 mt-2 flex items-start gap-2">
            <AlertOctagon className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-amber-700 text-xs font-semibold">{targets.calculation_details.aggressive_warning}</p>
          </div>
        )}
        
        {targets.updated_at && (
          <p className="text-gray-500 text-[10px] mt-2">
            עדכון אחרון: {new Date(targets.updated_at).toLocaleDateString('he-IL')}
          </p>
        )}
      </CardContent>
    </Card>
  );
}