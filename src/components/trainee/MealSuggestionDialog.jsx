import React, { useState, useMemo, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Sparkles, RefreshCw, Plus, Loader2, AlertTriangle, Wrench } from "lucide-react";
import { generateMealSuggestionsV4 } from '../shared/mealSuggestionEngineV4';
import { resolveUnitsForFood } from '../shared/unitsTestRunner';
import { toast } from 'sonner';
import { logEvent } from '../shared/diagnostics/logger';
import DiagnosticsPanel from '../shared/DiagnosticsPanel';
import MealSuggestionProgress from './MealSuggestionProgress';

const MEAL_TAGS = [
  { value: 'בוקר', label: '🌅 ארוחת בוקר', color: 'bg-amber-50 border-amber-300' },
  { value: 'צהריים', label: '☀️ ארוחת צהריים', color: 'bg-orange-50 border-orange-300' },
  { value: 'ערב', label: '🌙 ארוחת ערב', color: 'bg-indigo-50 border-indigo-300' },
  { value: 'ביניים', label: '🍎 חטיפים/ביניים', color: 'bg-green-50 border-green-300' }
];

const CALORIE_OPTIONS = [
  { value: 300, label: '300 קלוריות' },
  { value: 400, label: '400 קלוריות' },
  { value: 500, label: '500 קלוריות' },
  { value: 600, label: '600 קלוריות' }
];

const FOCUS_OPTIONS = [
  { value: 'מאוזן', label: 'מאוזן', icon: '⚖️' },
  { value: 'יותר חלבון', label: 'יותר חלבון', icon: '💪' },
  { value: 'יותר פחמימות', label: 'יותר פחמימות', icon: '🍞' },
  { value: 'יותר שומן', label: 'יותר שומן', icon: '🥑' }
];

export default function MealSuggestionDialog({ open, onClose, onAddMeal, traineeEmail }) {
  const [mealTag, setMealTag] = useState('בוקר');
  const [targetCalories, setTargetCalories] = useState(400);
  const [focus, setFocus] = useState('מאוזן');
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Get trainee
  const { data: trainee } = useQuery({
    queryKey: ['trainee', traineeEmail],
    queryFn: async () => {
      if (!traineeEmail) return null;
      const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
      return trainees[0] || null;
    },
    enabled: !!traineeEmail && open
  });

  // Fetch trainee's personal favorites
  const { data: personalFavorites = [] } = useQuery({
    queryKey: ['traineeFavorites', trainee?.id],
    queryFn: async () => {
      if (!trainee?.id) return [];
      return base44.entities.TraineeFavoriteFood.filter({ trainee_id: trainee.id });
    },
    enabled: !!trainee?.id && open
  });

  // Fetch corresponding food items
  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: open
  });

  // Fetch meal templates
  const { data: templates = [] } = useQuery({
    queryKey: ['mealTemplates'],
    queryFn: () => base44.entities.MealTemplate.list().catch(() => []),
    enabled: open
  });

  // Fetch coach recommended foods
  const { data: coachRecommended = [] } = useQuery({
    queryKey: ['coachRecommendedFoods', trainee?.coach_email],
    queryFn: async () => {
      if (!trainee?.coach_email) return [];
      return base44.entities.CoachRecommendedFood.filter({ 
        coach_email: trainee.coach_email,
        is_active: true 
      });
    },
    enabled: !!trainee?.coach_email && open
  });

  // Filter foods based on personal favorites and meal tag
  const { favoriteFoods, usedCoachRecommended } = React.useMemo(() => {
    const mealTypeMap = {
      'בוקר': 'breakfast',
      'צהריים': 'lunch',
      'ערב': 'dinner',
      'ביניים': 'snack'
    };
    
    const currentMealTypeEng = mealTypeMap[mealTag];
    
    // Get personal favorites filtered by meal type
    const allPersonalFavIds = new Set(
      (personalFavorites || []).map(f => f.food_item_id)
    );
    const filteredFavorites = (personalFavorites || []).filter(
      fav => fav.meal_type === currentMealTypeEng || fav.meal_type === 'any'
    );
    const filteredFavIds = new Set(filteredFavorites.map(f => f.food_item_id));
    const personalFavFoods = allFoods.filter(food => filteredFavIds.has(food.id));
    
    if (personalFavFoods.length >= 5) {
      return { favoriteFoods: personalFavFoods, usedCoachRecommended: false };
    }
    
    // Use coach recommended if available
    if (coachRecommended.length > 0) {
      const coachFiltered = coachRecommended.filter(rec => 
        !rec.meal_type || rec.meal_type === 'any' || rec.meal_type === currentMealTypeEng
      );
      const coachFoodIds = new Set(coachFiltered.map(rec => rec.food_item_id));
      const coachFoods = allFoods.filter(food => coachFoodIds.has(food.id));
      
      if (coachFoods.length > 0) {
        return { favoriteFoods: coachFoods, usedCoachRecommended: true };
      }
    }
    
    return { favoriteFoods: [], usedCoachRecommended: false };
  }, [personalFavorites, allFoods, mealTag, coachRecommended, trainee]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSuggestions(null);

    logEvent('UI_CLICK_SUGGEST', {
      mealType: mealTag,
      targetCalories,
      focus
    });

    try {
      // Call V4 engine
      const result = await generateMealSuggestionsV4(
        mealTag,
        targetCalories,
        traineeEmail,
        () => Promise.resolve(templates || []),
        () => Promise.resolve(favoriteFoods || []),
        () => Promise.resolve(coachRecommended || []),
        () => Promise.resolve(allFoods || [])
      );
      
      console.log('[MealSuggestionDialog] V4 result:', result);
      
      logEvent('MEAL_SUGGEST_RESULT', { 
        exitReason: result?.exitReason,
        elapsedMs: result?.elapsedMs,
        dataLength: result?.data?.length || 0
      });
      
      if (!result || typeof result !== 'object') {
        setError('Invalid engine result');
        setLoading(false);
        return;
      }
      
      if (result.exitReason !== 'SUCCESS') {
        setError(`${result.exitReason} (${result.lastStep}) - ${result.elapsedMs}ms`);
        setLoading(false);
        return;
      }
      
      if (result.data && Array.isArray(result.data) && result.data.length > 0) {
        setSuggestions(result.data);
        setError(null);
      } else {
        setError('לא נמצאו הצעות מתאימות');
        setSuggestions(null);
      }
    } catch (err) {
      console.error('[MealSuggestionDialog]', err);
      setError(err?.message || 'שגיאה לא צפויה');
    } finally {
      setLoading(false);
    }
  };

  const handleAddCombo = async (combo) => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const mealTypeMap = {
        'בוקר': 'breakfast',
        'צהריים': 'lunch',
        'ערב': 'dinner',
        'ביניים': 'snack'
      };

      const mealEntry = {
        trainee_email: traineeEmail,
        date: today,
        meal_type: mealTypeMap[mealTag],
        foods: combo.foods || [],
        calories: Math.round(combo.totalCalories || 0),
        protein: Math.round(combo.totalProtein || 0),
        carbs: Math.round(combo.totalCarbs || 0),
        fat: Math.round(combo.totalFat || 0)
      };

      await base44.entities.MealEntry.create(mealEntry);
      
      toast.success('ארוחה נוספה בהצלחה');
      onAddMeal();
      onClose();
    } catch (err) {
      console.error('Error adding meal:', err);
      toast.error('שגיאה בהוספת הארוחה');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>✨ הצעות ארוחות מ-AI</DialogTitle>
        </DialogHeader>

        {!suggestions && !loading && (
          <div className="space-y-4 py-4">
            {/* Meal Tag Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">סוג הארוחה</label>
              <div className="grid grid-cols-2 gap-2">
                {MEAL_TAGS.map(tag => (
                  <button
                    key={tag.value}
                    onClick={() => setMealTag(tag.value)}
                    className={`p-3 rounded-lg border-2 transition ${
                      mealTag === tag.value 
                        ? `${tag.color} border-current` 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {tag.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Calorie Selection */}
            <div>
              <label className="text-sm font-medium mb-2 block">קלוריות יעד</label>
              <Select value={targetCalories.toString()} onValueChange={(v) => setTargetCalories(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALORIE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value.toString()}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Error Display */}
            {error && (
              <Card className="p-4 bg-red-50 border-red-200">
                <div className="flex gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-800">{error}</p>
                  </div>
                </div>
              </Card>
            )}

            {/* Generate Button */}
            <Button 
              onClick={handleGenerate} 
              disabled={loading || favoriteFoods.length === 0}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  טוען...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {favoriteFoods.length === 0 ? 'אין מועדפים' : 'יצור הצעות'}
                </>
              )}
            </Button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="py-8">
            <MealSuggestionProgress />
          </div>
        )}

        {/* Suggestions List */}
        {suggestions && suggestions.length > 0 && (
          <div className="space-y-3 py-4">
            <h3 className="font-bold text-lg">הצעות:</h3>
            {suggestions.map((combo, idx) => (
              <Card key={idx} className="p-4 hover:shadow-md transition">
                <div className="mb-3">
                  <h4 className="font-semibold mb-2">{combo.template || `הצעה ${idx + 1}`}</h4>
                  <div className="grid grid-cols-4 gap-2 text-sm">
                    <div className="bg-green-50 p-2 rounded">
                      <p className="text-green-700 font-bold">{combo.totalCalories}</p>
                      <p className="text-green-600 text-xs">קלוריות</p>
                    </div>
                    <div className="bg-blue-50 p-2 rounded">
                      <p className="text-blue-700 font-bold">{combo.totalProtein}ג׳</p>
                      <p className="text-blue-600 text-xs">חלבון</p>
                    </div>
                    <div className="bg-orange-50 p-2 rounded">
                      <p className="text-orange-700 font-bold">{combo.totalCarbs}ג׳</p>
                      <p className="text-orange-600 text-xs">פחמימות</p>
                    </div>
                    <div className="bg-purple-50 p-2 rounded">
                      <p className="text-purple-700 font-bold">{combo.totalFat}ג׳</p>
                      <p className="text-purple-600 text-xs">שומן</p>
                    </div>
                  </div>
                </div>

                {combo.foods && combo.foods.length > 0 && (
                  <div className="mb-3 text-sm">
                    {combo.foods.map((food, foodIdx) => (
                      <div key={foodIdx} className="text-gray-700">
                        • {food.name_he} ({food.grams}ג׳)
                      </div>
                    ))}
                  </div>
                )}

                <Button 
                  onClick={() => handleAddCombo(combo)}
                  size="sm"
                  className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  הוסף הצעה זו
                </Button>
              </Card>
            ))}

            {/* New Search Button */}
            <Button 
              onClick={() => setSuggestions(null)}
              variant="outline"
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              חיפוש נוסף
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}