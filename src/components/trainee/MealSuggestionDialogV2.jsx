import React, { useState, useRef, useEffect } from 'react';
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
import { logEvent } from '../shared/UniversalEventLogger';
import DiagnosticsPanel from '../shared/DiagnosticsPanel';
import MealSuggestionProgress from './MealSuggestionProgress';
import { suggestMealWithWatchdog } from '../shared/mealSuggestDebugger';
import MealSuggestionErrorReport from '../shared/MealSuggestionErrorReport';
import MealSuggestDebugModal from './MealSuggestDebugModal';

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

// FEATURE FLAGS
const MEAL_SUGGEST_V2_ENABLED = true; // Stable version
const MEAL_SUGGEST_V2_EXPERIMENTAL = false; // Experimental changes

// VALIDATION: Ensure suggestion has valid structure
const validateSuggestion = (suggestion) => {
  if (!suggestion || typeof suggestion !== 'object') return false;
  if (!Array.isArray(suggestion.foods) || suggestion.foods.length === 0) return false;
  
  // Validate each food item
  for (const food of suggestion.foods) {
    if (!food.grams || food.grams <= 0) return false;
    if (!food.calories || food.calories < 0) return false;
    if (food.protein === undefined || food.protein < 0) return false;
    if (food.carbs === undefined || food.carbs < 0) return false;
    if (food.fat === undefined || food.fat < 0) return false;
    if (!food.name_he && !food.name && !food.food_name) return false;
  }
  
  // Validate totals
  if (!suggestion.totalCalories || suggestion.totalCalories <= 0) return false;
  
  return true;
};

export default function MealSuggestionDialogV2({ open, onClose, onAddMeal, traineeEmail }) {
  const [mealTag, setMealTag] = useState('בוקר');
  const [targetCalories, setTargetCalories] = useState(400);
  const [focus, setFocus] = useState('מאוזן');
  const [suggestions, setSuggestions] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const [progressStep, setProgressStep] = useState('FETCH_SOURCES');
  const [elapsed, setElapsed] = useState(0);
  const [diagnosticReport, setDiagnosticReport] = useState(null);
  const [showErrorReport, setShowErrorReport] = useState(false);
  const [showDebugModal, setShowDebugModal] = useState(false);
  const [addingIndex, setAddingIndex] = useState(null);
  const cancelRef = useRef(null);
  const timerRef = useRef(null);
  const runIdRef = useRef(null);
  const watchdogRef = useRef(null);
  const lastStepRef = useRef('INIT');
  
  // CRITICAL: Clear suggestions when targetCalories, mealTag, or focus changes
  React.useEffect(() => {
    setSuggestions(null);
    setError(null);
    console.log('[MEAL_SUGGEST_PARAMS_CHANGED]', { mealTag, targetCalories, focus });
  }, [targetCalories, mealTag, focus]);

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

  // Fetch all foods
  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: open
  });

  // Fetch templates
  const { data: templates = [] } = useQuery({
    queryKey: ['mealTemplates'],
    queryFn: async () => {
      console.log('📡 [FETCH_TEMPLATES_START]');
      const result = await base44.entities.MealTemplate.list().catch(err => {
        console.error('❌ [FETCH_TEMPLATES_ERROR]', err?.message);
        return [];
      });
      
      console.log('🔍 [FETCH_TEMPLATES_RESULT]', {
        count: result?.length || 0,
        isArray: Array.isArray(result),
        activeCount: result?.filter(t => t.is_active).length || 0,
        sample: result?.[0] ? {
          id: result[0].id,
          name: result[0].name,
          meal_type: result[0].meal_type,
          is_active: result[0].is_active,
          rolesCount: result[0]?.roles?.length || 0
        } : null
      });
      
      return result || [];
    },
    enabled: open,
    refetchOnMount: true
  });

  // Fetch coach recommended
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

  // Filter foods
  const { favoriteFoods, usedFallback, usedCoachRecommended } = React.useMemo(() => {
    const mealTypeMap = {
      'בוקר': 'breakfast',
      'צהריים': 'lunch',
      'ערב': 'dinner',
      'ביניים': 'snack'
    };
    
    const currentMealTypeEng = mealTypeMap[mealTag];
    const allPersonalFavoriteIds = new Set((personalFavorites || []).map(f => f.food_item_id));
    const allPersonalFavoriteFoods = allFoods.filter(food => allPersonalFavoriteIds.has(food.id));
    
    const filteredFavorites = (personalFavorites || []).filter(
      fav => fav.meal_type === currentMealTypeEng || fav.meal_type === 'any'
    );
    const filteredFavoriteFoods = allFoods.filter(food => 
      filteredFavorites.map(f => f.food_item_id).includes(food.id)
    );
    
    if (filteredFavoriteFoods.length >= 5) {
      return { favoriteFoods: filteredFavoriteFoods, usedFallback: false, usedCoachRecommended: false };
    }
    
    if (allPersonalFavoriteFoods.length >= 5) {
      return { favoriteFoods: allPersonalFavoriteFoods, usedFallback: true, usedCoachRecommended: false };
    }
    
    if (allPersonalFavoriteFoods.length > 0 && coachRecommended.length > 0) {
      const coachFoodIds = new Set(coachRecommended.map(rec => rec.food_item_id));
      const combinedIds = new Set([...allPersonalFavoriteIds, ...coachFoodIds]);
      const combinedFoods = allFoods.filter(food => combinedIds.has(food.id));
      return { 
        favoriteFoods: combinedFoods.length >= 5 ? combinedFoods : allPersonalFavoriteFoods, 
        usedFallback: true, 
        usedCoachRecommended: combinedFoods.length >= 5 
      };
    }
    
    if (coachRecommended.length > 0) {
      const coachFoodIds = new Set(coachRecommended.map(rec => rec.food_item_id));
      const coachFoods = allFoods.filter(food => coachFoodIds.has(food.id));
      return { favoriteFoods: coachFoods, usedFallback: false, usedCoachRecommended: true };
    }
    
    return { favoriteFoods: [], usedFallback: false, usedCoachRecommended: false };
  }, [personalFavorites, allFoods, mealTag, coachRecommended]);

  const { data: allUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
    enabled: open
  });

  const { data: allOverrides = [] } = useQuery({
    queryKey: ['allProductUnitOverrides'],
    queryFn: () => base44.entities.ProductUnitOverride.list(),
    enabled: open
  });

  const { data: allCategoryDefaults = [] } = useQuery({
    queryKey: ['allCategoryUnitDefaults'],
    queryFn: () => base44.entities.CategoryUnitDefault.list(),
    enabled: open
  });

  const getUnitsForFood = (food) => {
    if (!food || !allUnits.length || !allCategoryDefaults.length) {
      return { 'גרם': 1 };
    }
    const productOverrides = allOverrides.filter(o => o.product_id === food.id);
    const categoryDefaults = allCategoryDefaults.filter(c => c.category === food.category);
    return resolveUnitsForFood(food, productOverrides, categoryDefaults, allUnits);
  };

  const favoriteFoodsData = React.useMemo(
    () => ({ 
      favoriteFoods,
      source: usedCoachRecommended ? 'coach' : usedFallback ? 'fallback' : 'personal'
    }),
    [favoriteFoods, usedFallback, usedCoachRecommended]
  );

  // SINGLE SOURCE OF TRUTH: Compute totals for a meal combo
  const computeMealTotals = (foods) => {
    if (!Array.isArray(foods) || foods.length === 0) {
      return { calories: 0, protein: 0, carbs: 0, fat: 0, gramsTotal: 0 };
    }
    
    const totals = foods.reduce((acc, food) => {
      const grams = Number(food.grams) || 0;
      const cals = Number(food.calories) || 0;
      const prot = Number(food.protein) || 0;
      const carb = Number(food.carbs) || 0;
      const f = Number(food.fat) || 0;
      
      return {
        calories: acc.calories + cals,
        protein: acc.protein + prot,
        carbs: acc.carbs + carb,
        fat: acc.fat + f,
        gramsTotal: acc.gramsTotal + grams
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0, gramsTotal: 0 });
    
    console.log('[COMPUTE_TOTALS]', { 
      foodsCount: foods.length, 
      totals,
      foodsPreview: foods.map(f => ({ name: f.name_he || f.name, grams: f.grams, cals: f.calories }))
    });
    
    return totals;
  };

  const handleGenerate = async () => {
    console.log('EVENT: UI_CLICK_SUGGEST', {
      mealType: mealTag,
      targetCalories,
      focus
    });
    
    logEvent('UI_VALIDATE_START', { candidateCount: favoriteFoodsData.favoriteFoods?.length || 0 });
    
    // Validation 1: Check templates exist - AUTO-SEED IF MISSING
    const templatesCount = templates?.length || 0;
    const activeTemplatesCount = templates?.filter(t => t.is_active).length || 0;
    
    console.log('🔎 [VALIDATION_TEMPLATES]', {
      total: templatesCount,
      active: activeTemplatesCount,
      isArray: Array.isArray(templates)
    });
    
    if (templatesCount === 0) {
      logEvent('UI_AUTO_SEED_TEMPLATES', { reason: 'NO_TEMPLATES', mealTag });
      toast.info('מאתחל תבניות ארוחה...');
      
      try {
        console.log('🌱 [SEED_INVOKE_START]');
        const { data: seedResult } = await base44.functions.invoke('seedMealTemplates', {});
        console.log('🌱 [SEED_INVOKE_RESULT]', seedResult);
        
        if (seedResult?.success) {
          toast.success(`תבניות נוצרו: ${seedResult.count}`);
          
          // Force refetch templates
          console.log('🔄 [REFETCH_START]');
          const refetchedTemplates = await base44.entities.MealTemplate.list();
          console.log('🔄 [REFETCH_RESULT]', {
            count: refetchedTemplates?.length || 0,
            activeCount: refetchedTemplates?.filter(t => t.is_active).length || 0
          });
          
          // Retry generation after seeding
          setTimeout(() => handleGenerate(), 1000);
          return;
        } else {
          throw new Error(seedResult?.error || 'Seed failed');
        }
      } catch (err) {
        console.error('❌ [SEED_FAIL]', err?.message);
        logEvent('UI_AUTO_SEED_FAIL', { error: err?.message });
        setError('❌ נכשל באתחול תבניות. פנה למאמן.');
        setShowErrorReport(true);
        return;
      }
    }
    
    // Validation 2: Check candidate foods
    const candidatesCount = favoriteFoodsData.favoriteFoods?.length || 0;
    if (candidatesCount === 0) {
      logEvent('UI_VALIDATE_FAIL', { reason: 'NO_CANDIDATES' });
      toast.error('אין מוצרים מועדפים. הוסף מוצרים קודם לכן');
      return;
    }
    
    logEvent('UI_VALIDATE_OK', { 
      candidateCount: candidatesCount,
      templatesCount: templatesCount 
    });

    // ===== HARD SAFETY: UI WATCHDOG SETUP =====
    const newRunId = `UI-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    runIdRef.current = newRunId;
    lastStepRef.current = 'GENERATE_START';
    
    const startTime = Date.now();
    setLoading(true);
    setError(null);
    setSuggestions(null);
    setProgressStep('FETCH_SOURCES');
    setElapsed(0);
    setDiagnosticReport(null);
    cancelRef.current = false;

    // 6-second watchdog: force exit if loading never clears
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    watchdogRef.current = setTimeout(() => {
      if (runIdRef.current === newRunId && loading === true) {
        console.error('[WATCHDOG] UI FREEZE DETECTED after 6s', { runId: newRunId, lastStep: lastStepRef.current });
        setLoading(false);
        setError('⏱️ TIMEOUT_UI_WATCHDOG: מנוע לא הגיב. פרט: ' + lastStepRef.current);
        setDiagnosticReport({
          error: 'UI_WATCHDOG_TIMEOUT',
          runId: newRunId,
          lastStep: lastStepRef.current,
          elapsed: Date.now() - startTime
        });
        setShowErrorReport(true);
        logEvent('WATCHDOG_TIMEOUT', { runId: newRunId, lastStep: lastStepRef.current });
      }
    }, 6000);

    timerRef.current = setInterval(() => {
      const newElapsed = Date.now() - startTime;
      setElapsed(newElapsed);
    }, 100);

    try {
      lastStepRef.current = 'BEFORE_ENGINE_CALL';
      logEvent('UI_BEFORE_ENGINE_CALL', {
        candidatesCount,
        sourceType: favoriteFoodsData.source,
        timestamp: Date.now(),
        useExperimental: MEAL_SUGGEST_V2_EXPERIMENTAL
      });

      setProgressStep('BUILD_COMBINATIONS');
      lastStepRef.current = 'BUILD_COMBINATIONS';

      // V4: Template-based hybrid approach
      const mealTypeMap = { 'בוקר': 'breakfast', 'צהריים': 'lunch', 'ערב': 'dinner', 'ביניים': 'snack' };
      const mealTypeEng = mealTypeMap[mealTag] || 'breakfast';

      lastStepRef.current = 'ENGINE_CALL_START';
      
      // FEATURE FLAG: Try experimental first, fallback to stable on error
      let engineResult = null;
      let usedVersion = 'stable';
      
      if (MEAL_SUGGEST_V2_EXPERIMENTAL) {
        try {
          console.log('[MEAL_SUGGEST] Trying EXPERIMENTAL engine...');
          // TODO: Replace with experimental engine when ready
          engineResult = await generateMealSuggestionsV4(
            mealTypeEng,
            targetCalories,
            traineeEmail,
            async (q) => {
              const t = await base44.entities.MealTemplate.filter(q);
              return Array.isArray(t) ? t : [];
            },
            async () => {
              if (!trainee?.id) return [];
              const favs = await base44.entities.TraineeFavoriteFood.filter({ trainee_id: trainee.id });
              return allFoods.filter(f => favs.map(x => x.food_item_id).includes(f.id));
            },
            async () => {
              if (!trainee?.coach_email) return [];
              const recs = await base44.entities.CoachRecommendedFood.filter({ coach_email: trainee.coach_email, is_active: true });
              return allFoods.filter(f => recs.map(x => x.food_item_id).includes(f.id));
            },
            async () => allFoods
          );
          usedVersion = 'experimental';
          console.log('[MEAL_SUGGEST] ✅ EXPERIMENTAL succeeded');
        } catch (expErr) {
          console.warn('[MEAL_SUGGEST] ⚠️ EXPERIMENTAL failed, falling back to STABLE', expErr?.message);
          engineResult = null; // Will fallback below
        }
      }
      
      if (!engineResult && MEAL_SUGGEST_V2_ENABLED) {
        console.log('[MEAL_SUGGEST] Using STABLE engine...');
        engineResult = await generateMealSuggestionsV4(
          mealTypeEng,
          targetCalories,
          traineeEmail,
        async (q) => {
          const t = await base44.entities.MealTemplate.filter(q);
          return Array.isArray(t) ? t : [];
        },
        async () => {
          if (!trainee?.id) return [];
          const favs = await base44.entities.TraineeFavoriteFood.filter({ trainee_id: trainee.id });
          return allFoods.filter(f => favs.map(x => x.food_item_id).includes(f.id));
        },
          async () => {
            if (!trainee?.coach_email) return [];
            const recs = await base44.entities.CoachRecommendedFood.filter({ coach_email: trainee.coach_email, is_active: true });
            return allFoods.filter(f => recs.map(x => x.food_item_id).includes(f.id));
          },
          async () => allFoods
        );
        usedVersion = 'stable';
      }

      lastStepRef.current = 'ENGINE_CALL_AWAIT';
      
      // GUARD: Verify we have a result
      if (!engineResult) {
        lastStepRef.current = 'NO_ENGINE_RESULT';
        setError('❌ המנגנון לא החזיר תוצאה');
        setShowErrorReport(true);
        setLoading(false);
        return;
      }
      // Type safety - V4 always returns structured object
      if (!engineResult || typeof engineResult !== 'object') {
        lastStepRef.current = 'INVALID_RESULT_FORMAT';
        logEvent('INVALID_RESULT_FORMAT', { engineResult });
        setError('שגיאה פנימית: תוצאה לא תקינה');
        setShowErrorReport(true);
        return;
      }

      lastStepRef.current = 'PROCESSING_ENGINE_RESULT';
      const finalExitReason = engineResult.exitReason || 'ERROR';
      const finalLastStep = engineResult.lastStep || 'UNKNOWN_STEP';
      const finalElapsedMs = Number.isFinite(engineResult.elapsedMs) ? engineResult.elapsedMs : 0;
      const finalData = Array.isArray(engineResult.data) ? engineResult.data : [];

      logEvent('UI_AFTER_ENGINE_CALL', {
        exitReason: finalExitReason,
        lastStep: finalLastStep,
        elapsedMs: finalElapsedMs,
        dataCount: finalData.length,
        usedVersion,
        timestamp: Date.now()
      });

      clearInterval(timerRef.current);

      // Store diagnostics for debugging
      if (engineResult.debug) {
        const fullReport = {
          exitReason: finalExitReason,
          lastStep: finalLastStep,
          elapsedMs: finalElapsedMs,
          uiLastStep: lastStepRef.current,
          runId: engineResult.runId,
          ...engineResult.debug
        };
        setDiagnosticReport(fullReport);
        window.__mealSuggestLastReport = engineResult;
        console.log('📊 DIAGNOSTIC REPORT:', engineResult);
      }

      setProgressStep('COMPLETE');
      lastStepRef.current = 'CHECKING_RESULTS';

      // Handle all exit reasons deterministically
      if (finalExitReason !== 'SUCCESS' && finalData.length === 0) {
        lastStepRef.current = 'RESULT_FAIL_PATH';
        logEvent('ENGINE_FAILURE', { exitReason: finalExitReason, lastStep: finalLastStep });
        
        // User-friendly error messages
        let userMessage = 'לא הצלחנו להכין הצעות – נסה שוב';
        
        if (finalExitReason === 'NO_TEMPLATES_FOUND') {
          userMessage = 'לא נמצאו תבניות ארוחה מתאימות';
        } else if (finalExitReason === 'NO_FOODS_IN_DATABASE') {
          userMessage = 'מאגר המזון ריק';
        } else if (finalExitReason === 'NO_VALID_FOODS') {
          userMessage = 'אין מזון תקין במאגר';
        } else if (finalExitReason === 'NO_VALID_SUGGESTIONS') {
          userMessage = 'לא נמצאו הצעות בטווח הקלוריות המבוקש';
        } else if (finalExitReason === 'TIMEOUT') {
          userMessage = 'הפעולה ארכה יותר מדי – נסה שוב';
        }
        
        setError(userMessage);
        setShowErrorReport(true);
        setLoading(false);
        return;
      }

      lastStepRef.current = 'RESULT_SUCCESS_PATH';
      
      // FALLBACK: Handle specific error cases gracefully
      if (finalExitReason === 'NO_TEMPLATES_FOUND') {
        lastStepRef.current = 'NO_TEMPLATES_FOUND';
        logEvent('NO_TEMPLATES_FOUND', { mealType: mealTag });
        setError('לא נמצאו תבניות ארוחה מתאימות');
        setLoading(false);
        return;
      }
      
      if (finalExitReason === 'NO_FOODS_IN_DATABASE' || finalExitReason === 'NO_VALID_FOODS') {
        lastStepRef.current = finalExitReason;
        logEvent(finalExitReason, { mealType: mealTag });
        setError('מאגר המזון אינו זמין כרגע');
        setLoading(false);
        return;
      }

      // VALIDATION: Filter out invalid suggestions
      const validSuggestions = finalData.filter((suggestion, idx) => {
        const isValid = validateSuggestion(suggestion);
        if (!isValid) {
          console.warn('[MEAL_SUGGEST_INVALID_SUGGESTION]', { 
            index: idx, 
            suggestion,
            reason: 'Failed validation'
          });
        }
        return isValid;
      });

      console.log('[MEAL_SUGGEST_VALIDATION]', {
        totalSuggestions: finalData.length,
        validSuggestions: validSuggestions.length,
        invalidCount: finalData.length - validSuggestions.length
      });

      // GUARD: Check if we have any valid suggestions after filtering
      if (validSuggestions.length === 0 && finalData.length > 0) {
        console.error('[MEAL_SUGGEST_ALL_INVALID]', { 
          rawSuggestions: finalData,
          mealType: mealTag
        });
        setError('❌ ההצעות שנוצרו אינן תקינות - נסה שוב');
        setShowErrorReport(true);
        setLoading(false);
        return;
      }

      // GUARD: Check if we have zero suggestions after all processing
      if (!Array.isArray(validSuggestions) || validSuggestions.length === 0) {
        lastStepRef.current = 'NO_VALID_SUGGESTIONS';
        logEvent('NO_VALID_SUGGESTIONS', { 
          mealType: mealTag, 
          exitReason: finalExitReason,
          targetCalories,
          templatesCount: templates?.length || 0
        });
        
        // User-friendly message based on context
        let errorMsg = 'לא נמצאו הצעות כרגע – נסה שוב';
        
        if (templates?.length === 0) {
          errorMsg = 'אין טמפלטים זמינים למאמן – פנה למאמן ליצירת טמפלטים';
        } else {
          errorMsg = 'לא הצלחנו להתאים הצעה ליעד שנבחר – נסה יעד אחר';
        }
        
        setError(errorMsg);
        setLoading(false);
        return;
      }
      
      // Log generated suggestions with computed totals
      console.log('[MEAL_SUGGEST_GENERATE]', {
        mealType: mealTag,
        targetCalories,
        focus,
        usedVersion,
        suggestionsCount: validSuggestions.length,
        suggestions: validSuggestions.map((combo, idx) => ({
          index: idx,
          foodsCount: combo.foods?.length || 0,
          totalsComputed: computeMealTotals(combo.foods || [])
        }))
      });
      
      console.log('[MEAL_SUGGESTIONS_READY]', { count: validSuggestions.length });
      
      setSuggestions(validSuggestions);
      setLoading(false);

    } catch (err) {
      lastStepRef.current = 'CATCH_BLOCK';
      clearInterval(timerRef.current);
      const errMsg = err?.message || 'Unknown error';
      logEvent('EXCEPTION', { message: errMsg });
      console.error('Exception in handleGenerate:', err);
      setError(errMsg);
      setLoading(false);
    } finally {
      // ===== HARD SAFETY: ALWAYS CLEAR WATCHDOG =====
      if (watchdogRef.current) clearTimeout(watchdogRef.current);
      clearInterval(timerRef.current);
      if (runIdRef.current === newRunId) {
        setLoading(false);
      }
    }
  };

  const handleAddCombo = async (combo, comboIndex) => {
    // NORMALIZE: Map meal tag to meal_type enum (ALWAYS use English key)
    const MEAL_TYPE_MAP = {
      'בוקר': 'breakfast',
      'צהריים': 'lunch',
      'ערב': 'dinner',
      'ביניים': 'snack'
    };
    const mealTypeRaw = mealTag;
    const mealTypeKey = MEAL_TYPE_MAP[mealTag] || 'breakfast';
    const targetDate = new Date().toISOString().split('T')[0]; // Today's date YYYY-MM-DD
    
    // GUARD 1: Validate inputs
    if (!combo || !onAddMeal) {
      console.error('[MEAL_SUGGEST_ADD_GUARD_FAIL]', { hasCombo: !!combo, hasOnAddMeal: !!onAddMeal });
      toast.error('❌ שגיאה פנימית: חסרים נתונים');
      setError('שגיאה פנימית: חסרים נתונים');
      return;
    }
    
    if (!combo.foods || combo.foods.length === 0) {
      console.error('[MEAL_SUGGEST_ADD_GUARD_FAIL]', { reason: 'NO_FOODS', comboIndex });
      toast.error('❌ אין מוצרים להוסיף');
      setError('אין מוצרים להוסיף');
      return;
    }
    
    // GUARD 2: Validate save path parameters
    if (!mealTypeKey || !targetDate || !traineeEmail) {
      console.error('[MEAL_SUGGEST_SAVE_PATH_INVALID]', { 
        reason: 'MISSING_REQUIRED_FIELDS',
        mealTypeRaw,
        mealTypeKey,
        date: targetDate,
        traineeEmail 
      });
      toast.error('❌ חסרים נתונים נדרשים למסלול שמירה');
      setError('SAVE_PATH_INVALID: חסרים נתונים נדרשים');
      return;
    }
    
    // LOG: Selection + path details
    console.log('[MEAL_SUGGEST_SELECT]', { 
      comboIndex, 
      foodsCount: combo.foods?.length,
      mealTag: mealTypeRaw,
      mealTypeKey,
      targetDate,
      traineeEmail,
      templateId: combo.template_id || null,
      templateName: combo.template || null
    });
    
    const totalsComputed = computeMealTotals(combo.foods || []);
    
    console.log('[MEAL_SUGGEST_CALC_TOTALS]', {
      selectedMealIndex: comboIndex,
      totalsShown: {
        calories: combo.totalCalories,
        protein: combo.totalProtein,
        carbs: combo.totalCarbs,
        fat: combo.totalFat
      },
      totalsComputed,
      foodsPreview: (combo.foods || []).map(f => ({
        name: f.name_he || f.name,
        grams: f.grams,
        calories: f.calories
      }))
    });

    // CONSISTENCY CHECK: Verify calorie accuracy (±5%)
    const shownCals = Number(combo.totalCalories) || 0;
    const computedCals = totalsComputed.calories;
    const calorieDiscrepancy = Math.abs(shownCals - computedCals);
    const discrepancyPercent = shownCals > 0 ? (calorieDiscrepancy / shownCals) * 100 : 0;
    
    if (discrepancyPercent > 5) {
      console.warn('[MEAL_SUGGEST_CALORIE_MISMATCH]', {
        shownCalories: shownCals,
        computedCalories: computedCals,
        discrepancy: calorieDiscrepancy,
        discrepancyPercent: discrepancyPercent.toFixed(1) + '%',
        foods: combo.foods?.map(f => ({
          name: f.name_he || f.name,
          grams: f.grams,
          calories: f.calories,
          source: f.per100_kcal ? 'per100' : 'direct'
        }))
      });
    }

    // VALIDATION: Validate and normalize foods - ensure ALL required fields
    const normalizedFoods = (combo.foods || []).map((food, idx) => {
      const foodName = food.food_name || food.name_he || food.name;
      const grams = Number(food.grams);
      const calories = Number(food.calories);
      
      // Validate required fields
      if (!foodName) {
        console.warn(`[MEAL_SUGGEST_VALIDATION] Food ${idx}: missing name, using fallback`);
      }
      if (!grams || grams <= 0) {
        console.warn(`[MEAL_SUGGEST_VALIDATION] Food ${idx} (${foodName}): invalid grams=${food.grams}, using 0`);
      }
      if (!calories || calories < 0) {
        console.warn(`[MEAL_SUGGEST_VALIDATION] Food ${idx} (${foodName}): invalid calories=${food.calories}, using 0`);
      }
      
      const normalized = {
        food_id: food.id || '',
        food_name: foodName || 'Unknown Food',
        name_he: food.name_he || foodName || 'Unknown',
        grams: grams || 0,
        calories: calories || 0,
        protein: Number(food.protein) || 0,
        carbs: Number(food.carbs) || 0,
        fat: Number(food.fat) || 0,
        category: food.category || '',
        role: food.role || '',
        unit: 'גרם'
      };
      
      return normalized;
    });

    // Create individual meal entries for each food (MealEntry schema expects one entry per food)
    const mealEntries = normalizedFoods.map(food => ({
      meal_type: mealTypeKey,
      food_item_id: food.food_id || '',
      food_name: food.food_name,
      quantity: food.grams,
      unit: 'גרם',
      unit_name: 'גרם',
      grams_final: food.grams,
      grams_equivalent: food.grams,
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat
    }));

    const totalCaloriesFromEntries = mealEntries.reduce((sum, e) => sum + e.calories, 0);
    
    // LOG: SAVE_START with full path details
    console.log('[MEAL_SUGGEST_SAVE_START]', {
      dateKey: targetDate,
      mealTypeRaw,
      mealTypeKey,
      path: `${traineeEmail}/${targetDate}/${mealTypeKey}`,
      targetCalories: Math.round(totalCaloriesFromEntries),
      templateId: combo.template_id || null,
      itemsCount: mealEntries.length,
      entries: mealEntries.map(e => ({
        food_name: e.food_name,
        grams: e.grams_final,
        calories: e.calories
      }))
    });

    // CIRCUIT BREAKER: Try-catch wrapper for save path
    try {
      // CHECK: Do we have existing meals for this meal_type+date (UPDATE scenario)?
      let existingMeals = [];
      try {
        console.log('[MEAL_SUGGEST_CHECK_EXISTING]', {
          mealType: mealTypeKey,
          date: targetDate,
          traineeEmail
        });
        
        existingMeals = []; // TODO: Pass existing meals as prop if replace is needed
      } catch (checkErr) {
        console.warn('[MEAL_SUGGEST_CHECK_EXISTING_FAIL]', { error: checkErr?.message });
      }

      const operationType = existingMeals.length > 0 ? 'REPLACE' : 'CREATE';
      // GUARD: Validate onAddMeal callback exists
      if (!onAddMeal || typeof onAddMeal !== 'function') {
        throw new Error('SAVE_PATH_INVALID: onAddMeal callback not available');
      }

      // Save each entry individually with detailed error handling
      const savedEntries = [];
      const failedEntries = [];
      
      for (let i = 0; i < mealEntries.length; i++) {
        const entry = mealEntries[i];
        
        console.log(`[MEAL_SUGGEST_SAVE_ENTRY_${i}_START]`, {
          food_name: entry.food_name,
          grams: entry.grams_final,
          calories: entry.calories,
          meal_type: entry.meal_type,
          date: targetDate,
          hasOnAddMeal: !!onAddMeal
        });
        
        try {
          const saved = await onAddMeal(entry);
          
          console.log(`[MEAL_SUGGEST_SAVE_ENTRY_${i}_OK]`, { 
            id: saved?.data?.id || saved?.id,
            response: saved 
          });
          
          savedEntries.push(saved);
        } catch (itemErr) {
          console.error(`[MEAL_SUGGEST_SAVE_ENTRY_${i}_FAIL]`, {
            food_name: entry.food_name,
            errorMessage: itemErr?.message,
            errorResponse: itemErr?.response?.data,
            errorStack: itemErr?.stack?.split('\n').slice(0, 3),
            entry
          });
          
          failedEntries.push({ index: i, food_name: entry.food_name, error: itemErr?.message });
          throw itemErr; // Re-throw to trigger outer catch
        }
      }
      
      // Verify all entries saved
      if (savedEntries.length !== mealEntries.length) {
        console.error('[MEAL_SUGGEST_SAVE_INCOMPLETE]', {
          requested: mealEntries.length,
          saved: savedEntries.length,
          failed: failedEntries.length
        });
        throw new Error(`שמירה חלקית: ${savedEntries.length}/${mealEntries.length} פריטים נשמרו`);
      }
      
      // TODO: If this was a REPLACE operation, delete old entries here
      // For now, we create new entries - parent component should handle cleanup if needed
      
      // LOG: SAVE_RESULT SUCCESS
      console.log('[MEAL_SUGGEST_SAVE_RESULT]', {
        ok: true,
        operation: operationType,
        createdEntriesCount: savedEntries.length,
        requestedCount: mealEntries.length,
        totalCalories: totalCaloriesFromEntries,
        resolvedPath: `${traineeEmail}/${targetDate}/${mealTypeKey}`,
        savedIds: savedEntries.map(s => s?.data?.id || s?.id)
      });
      
      console.log('[MEAL_ADDED_SUCCESS]', {
        mealType: mealTypeKey,
        itemsCount: savedEntries.length,
        totalCalories: Math.round(totalCaloriesFromEntries),
        templateId: combo.template_id || null
      });
      
      console.log('[MEAL_ADDED_SUCCESS]', {
        mealType: mealTypeKey,
        itemsCount: savedEntries.length,
        totalCalories: Math.round(totalCaloriesFromEntries),
        templateId: combo.template_id || null
      });
      
      const actionText = existingMeals.length > 0 ? 'עודכנה' : 'נוספה';
      toast.success(`✅ ארוחה ${actionText}: ${mealEntries.length} פריטים, ${Math.round(totalCaloriesFromEntries)} קל׳`);
      onClose();
    } catch (err) {
      // CIRCUIT BREAKER: Don't close dialog, keep suggestion in state
      
      // LOG: SAVE_RESULT FAILURE
      const errorMessage = err?.message || 'UNKNOWN_ERROR';
      const errorStack = err?.stack?.split('\n').slice(0, 5) || [];
      
      console.error('[MEAL_SUGGEST_SAVE_RESULT]', {
        ok: false,
        errorMessage,
        errorStack,
        errorResponse: err?.response?.data,
        resolvedPath: `${traineeEmail}/${targetDate}/${mealTypeKey}`,
        context: {
          mealTypeRaw,
          mealTypeKey,
          itemsCount: mealEntries.length,
          traineeEmail
        }
      });
      
      // GUARD: Handle undefined/null errors
      if (!err || err === null || err === undefined) {
        setError('SAVE_UNKNOWN_FAIL: שגיאה לא ידועה');
        toast.error('❌ שגיאה לא ידועה בשמירה - נסה שוב');
        return;
      }
      
      // GUARD: Handle SAVE_PATH_INVALID
      if (errorMessage.includes('SAVE_PATH_INVALID')) {
        setError('SAVE_PATH_INVALID: מסלול שמירה לא תקין');
        toast.error('❌ מסלול שמירה לא תקין - פנה למאמן');
        return;
      }
      
      // Generic error
      const userMessage = err?.response?.data?.message || errorMessage || 'לא ידוע';
      setError(`שגיאה בשמירה: ${userMessage}`);
      toast.error(`❌ שגיאה בשמירה: ${userMessage}`);
      // Don't close dialog - let user retry
    }
  };

  const handleClose = () => {
    clearInterval(timerRef.current);
    if (watchdogRef.current) clearTimeout(watchdogRef.current);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl bg-white p-0" dir="rtl">
        <form 
        onSubmit={(e) => {
                    e.preventDefault();
                    if (!loading && !suggestions) {
                      handleGenerate();
                    }
                  }}
        className="p-6"
        >
          <DialogHeader className="mb-6">
            <DialogTitle className="text-2xl font-bold" style={{ color: '#79DBD6' }}>
              ✨ הצעות ארוחה
            </DialogTitle>
          </DialogHeader>

          {!suggestions && (
            <button
              type="submit"
              disabled={loading}
              className="w-full h-14 text-white font-bold text-lg mb-6 rounded-md transition-all hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: '#79DBD6' }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  מכין הצעות ארוחה...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Sparkles className="w-5 h-5" />
                  צור הצעות ✨
                </span>
              )}
            </button>
          )}

        <div className="space-y-6 max-h-[60vh] overflow-y-auto">
          {!suggestions ? (
            <>
              <Card className="p-6 bg-gradient-to-br from-teal-50 to-cyan-50 border-teal-200">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">סוג ארוחה</label>
                      <Select value={mealTag} onValueChange={setMealTag}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {MEAL_TAGS.map(tag => (
                            <SelectItem key={tag.value} value={tag.value}>
                              {tag.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-sm font-medium text-slate-700 block mb-2">קלוריות יעד</label>
                      <Select value={targetCalories.toString()} onValueChange={(v) => setTargetCalories(parseInt(v))}>
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

                    <div className="col-span-2">
                      <label className="text-sm font-medium text-slate-700 block mb-2">מיקוד</label>
                      <Select value={focus} onValueChange={setFocus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {FOCUS_OPTIONS.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.icon} {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
              </Card>

              {error && (
                <Card className="bg-amber-50 border-amber-300 p-4">
                  <div className="flex gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-amber-800">{error}</p>
                      {error.includes('טמפלטים') && (
                        <p className="text-xs text-amber-700 mt-2">
                          💡 פנה למאמן שלך כדי ליצור טמפלטי ארוחות
                        </p>
                      )}
                      {error.includes('יעד') && (
                        <p className="text-xs text-amber-700 mt-2">
                          💡 נסה לשנות את יעד הקלוריות או סוג הארוחה
                        </p>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setError(null);
                          setShowErrorReport(false);
                        }}
                        className="mt-3 text-xs"
                      >
                        הבנתי
                      </Button>
                    </div>
                  </div>
                </Card>
              )}

              {showDiagnostics && (
                <div className="bg-slate-100 p-4 rounded text-xs font-mono space-y-2">
                  <div><strong>Favorite Foods:</strong> {favoriteFoodsData.favoriteFoods.length}</div>
                  <div><strong>Source:</strong> {favoriteFoodsData.source}</div>
                  <div><strong>Loading:</strong> {loading ? 'Yes' : 'No'}</div>
                  {diagnosticReport && (
                    <pre className="bg-white p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(diagnosticReport, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center mb-4">
                <div>
                  <h3 className="font-bold text-lg">הצעות:</h3>
                  <p className="text-sm text-slate-500">יעד: {targetCalories} קלוריות</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    console.log('[MEAL_SUGGEST_BACK_TO_SELECTION]');
                    setSuggestions(null);
                    setError(null);
                  }}
                  className="text-slate-600 hover:text-slate-800"
                >
                  ← חזרה לבחירה
                </Button>
              </div>
              {suggestions.length > 0 ? (
                suggestions.map((combo, idx) => {
                  // GUARD: Skip invalid suggestions that somehow passed validation
                  if (!validateSuggestion(combo)) {
                    console.warn('[MEAL_SUGGEST_RENDER_SKIP]', { index: idx, combo });
                    return null;
                  }
                  
                  const safeFoods = Array.isArray(combo?.foods) ? combo.foods : [];
                  const computedTotals = computeMealTotals(safeFoods);
                  const isAdding = addingIndex === idx;
                  const deltaFromTarget = computedTotals.calories - targetCalories;
                  const deltaSign = deltaFromTarget >= 0 ? '+' : '';
                  const deltaColor = Math.abs(deltaFromTarget) <= 25 ? 'text-green-600' : 'text-orange-600';
                  
                  return (
                    <Card key={idx} className="p-4 border-l-4" style={{ borderColor: '#79DBD6' }}>
                      <div className="mb-3">
                        {safeFoods.length > 0 ? (
                          safeFoods.map((food, foodIdx) => (
                            <div key={foodIdx} className="flex justify-between text-sm mb-1">
                              <span>{food.name_he || food.name || 'מוצר'}</span>
                              <span className="text-slate-600">{Math.round(food.grams || 0)} ג׳</span>
                            </div>
                          ))
                        ) : (
                          <p className="text-sm text-slate-500 italic">אין פרטים על מוצרים</p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs mb-3 pb-3 border-b">
                        <div className="text-center">
                          <p className="font-medium">{Math.round(computedTotals.protein)}ג׳</p>
                          <p className="text-slate-500">חלבון</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{Math.round(computedTotals.carbs)}ג׳</p>
                          <p className="text-slate-500">פחמימות</p>
                        </div>
                        <div className="text-center">
                          <p className="font-medium">{Math.round(computedTotals.fat)}ג׳</p>
                          <p className="text-slate-500">שומן</p>
                        </div>
                      </div>
                      <div className="flex justify-between items-center mb-2">
                        <div>
                          <span className="font-bold text-lg" style={{ color: '#79DBD6' }}>
                            {Math.round(computedTotals.calories)} cal
                          </span>
                          <p className={`text-xs font-medium ${deltaColor}`}>
                            Δ מיעד: {deltaSign}{deltaFromTarget} cal
                          </p>
                        </div>
                        <Button
                          type="button"
                          onClick={async (e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            
                            if (isAdding) return; // Prevent double submit
                            
                            setAddingIndex(idx);
                            try {
                              await handleAddCombo(combo, idx);
                            } catch (err) {
                              console.error('[MEAL_SUGGEST_ADD_ERROR]', err);
                              // Error already handled in handleAddCombo
                            } finally {
                              setAddingIndex(null);
                            }
                          }}
                          disabled={isAdding}
                          size="sm"
                          className="text-white min-w-[80px]"
                          style={{ backgroundColor: '#79DBD6' }}
                        >
                          {isAdding ? (
                            <>
                              <Loader2 className="w-4 h-4 ml-1 animate-spin" />
                              מוסיף...
                            </>
                          ) : (
                            <>
                              <Plus className="w-4 h-4 ml-1" />
                              הוסף
                            </>
                          )}
                        </Button>
                      </div>
                    </Card>
                  );
                })
              ) : (
                <Card className="bg-amber-50 border-amber-300 p-6 text-center">
                  <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
                  <p className="text-amber-900 font-bold mb-2">לא נמצאו הצעות כרגע</p>
                  <p className="text-sm text-amber-700 mb-4">
                    נסה לשנות את יעד הקלוריות, סוג הארוחה או המיקוד
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSuggestions(null);
                      setError(null);
                    }}
                    className="text-amber-800 border-amber-400 hover:bg-amber-100"
                  >
                    ← חזרה לבחירה
                  </Button>
                </Card>
              )}
            </div>
          )}

          {showErrorReport && (
            <MealSuggestionErrorReport 
              open={showErrorReport} 
              onClose={() => setShowErrorReport(false)}
              error={error}
              diagnosticReport={diagnosticReport}
              elapsedMs={elapsed}
              progressStep={lastStepRef.current}
            />
          )}
          {showDebugModal && <MealSuggestDebugModal open={showDebugModal} onClose={() => setShowDebugModal(false)} />}
        </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}