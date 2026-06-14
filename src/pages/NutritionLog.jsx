import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar, ChevronRight, ChevronLeft, Plus, Trash2, Utensils, Pencil, Database, Droplets, User, Sparkles, Check, X } from "lucide-react";
import MacroWheels from '@/components/mealplan/MacroWheels';
import EditPersonalInfo from '@/components/trainee/EditPersonalInfo';
import AddNewProductDialog from '@/components/trainee/AddNewProductDialog';

const UNITS = [
  { value: 'gram', label: 'גרם' },
  { value: '100g', label: '100 גרם' },
  { value: 'ml', label: 'מ"ל' },
  { value: 'tablespoon', label: 'כף' },
  { value: 'teaspoon', label: 'כפית' },
  { value: 'unit', label: 'יחידה' },
  { value: 'slice', label: 'פרוסה' },
  { value: 'half_slice', label: 'חצי פרוסה' },
  { value: 'cup', label: 'כוס' },
  { value: 'half_cup', label: 'חצי כוס' },
];
import AddMealManual from '../components/trainee/AddMealManual';
import AddMealWithAI from '../components/trainee/AddMealWithAI';
import MealSuggestionDialogV2 from '../components/trainee/MealSuggestionDialogV2';
import MealSuggestionErrorReport from '../components/shared/MealSuggestionErrorReport';
import MealSuggestionProgress from '../components/trainee/MealSuggestionProgress';
import AIMealSuggestionDialog from '../components/trainee/AIMealSuggestionDialog';
import AIAnalyzeMealDialog from '../components/trainee/AIAnalyzeMealDialog';
import AddMealFromPhoto from '../components/trainee/AddMealFromPhoto';
import RouteGuard from '../components/shared/RouteGuard';
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import SmartMealSuggestionsPanel from '@/components/trainee/SmartMealSuggestionsPanel';
import MealGroupList from '@/components/trainee/MealGroupList';
import QuickNutritionLogger from '@/components/trainee/QuickNutritionLogger';
import AddMealActionSheet from '@/components/trainee/AddMealActionSheet';
import DuplicateFoodDialog from '@/components/trainee/DuplicateFoodDialog';
import { batchUpdateNutritionMemory, normalizeFoodName, recordDeletedFoodInMemory, recordQuickFoodUse } from '@/components/trainee/nutritionLearning';
import { buildCanonicalTraineeFields, getIsraelDateString, invalidateCoachTraineeSyncQueries, logSyncEvent, nutritionRecordMatchesTrainee } from '@/utils/nutritionSync';

// Module-level debounce queue for TraineeNutritionProfile updates.
// Collects all MealEntry creates that arrive within 600ms (one logical meal event)
// then calls batchUpdateNutritionMemory ONCE so the profile is read and written exactly once.
const _nutritionFlushQueues = new Map(); // Map<trainee_id, { timer, meals, trainee }>
function _scheduleNutritionFlush(trainee, meal) {
  const id = trainee?.id;
  if (!id || !meal) return;
  if (!_nutritionFlushQueues.has(id)) _nutritionFlushQueues.set(id, { timer: null, meals: [], trainee });
  const q = _nutritionFlushQueues.get(id);
  q.meals.push(meal);
  if (q.timer) clearTimeout(q.timer);
  q.timer = setTimeout(() => {
    const { meals, trainee: t } = q;
    _nutritionFlushQueues.delete(id);
    batchUpdateNutritionMemory({ trainee: t, meals }).catch(err =>
      console.warn('[NON-FATAL] batchUpdateNutritionMemory failed — MealEntry already committed, profile will self-correct on next save.', err)
    );
  }, 2000);
}

const MEAL_TYPES = {
  breakfast: { label: 'ארוחת בוקר', icon: '🌅', color: 'bg-amber-50 border-amber-200' },
  lunch: { label: 'ארוחת צהריים', icon: '☀️', color: 'bg-orange-50 border-orange-200' },
  dinner: { label: 'ארוחת ערב', icon: '🌙', color: 'bg-indigo-50 border-indigo-200' },
  snack: { label: 'חטיפים', icon: '🍎', color: 'bg-green-50 border-green-200' },
};

const safeString = (value, fallback = '') => (value === null || value === undefined ? fallback : String(value));
const safeNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};
const safeArray = (value) => Array.isArray(value) ? value.filter(Boolean) : [];

export default function NutritionLog() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [view, setView] = useState('day');
  const [showMealDialog, setShowMealDialog] = useState(false);
  const [showMealAIDialog, setShowMealAIDialog] = useState(false);
  const [editingMeal, setEditingMeal] = useState(null);
  const [showWaterLog, setShowWaterLog] = useState(false);
  const [addingMealType, setAddingMealType] = useState(null);
  const [loadingStatus, setLoadingStatus] = useState('loading'); // loading | ready | error
  const [errorMessage, setErrorMessage] = useState(null);
  const [barcodeSearchResult, setBarcodeSearchResult] = useState(null);
  const [barcodeSearching, setBarcodeSearching] = useState(false);
  const [showPersonalInfo, setShowPersonalInfo] = useState(false);
  const [showSuggestionDialog, setShowSuggestionDialog] = useState(false);
  const [showAnalyzeDialog, setShowAnalyzeDialog] = useState(false);
  const [showPhotoDialog, setShowPhotoDialog] = useState(false);
  const [photoMealType, setPhotoMealType] = useState('breakfast');
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [suggestStatusText, setSuggestStatusText] = useState('');
  const [showAddProductDialog, setShowAddProductDialog] = useState(false);
  const [showAddItemSheet, setShowAddItemSheet] = useState(false);
  const [showQuickAddDialog, setShowQuickAddDialog] = useState(false);
  const [manualInitialMode, setManualInitialMode] = useState('choose');
  const [quickAddTitle, setQuickAddTitle] = useState('הוספה מהירה');
  const [pendingDuplicateMeal, setPendingDuplicateMeal] = useState(null);
  
  const queryClient = useQueryClient();
  const dateStr = getIsraelDateString(selectedDate instanceof Date && !Number.isNaN(selectedDate.getTime()) ? selectedDate : new Date());

  const { data: user, isLoading: userLoading } = useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      try {
        const authUser = await base44.auth.me();
        console.log('NutritionLog authUser:', authUser?.id, authUser?.email);
        return authUser;
      } catch (err) {
        console.error('NutritionLog auth error:', err);
        setErrorMessage('שגיאה בטעינת פרטי משתמש');
        setLoadingStatus('error');
        throw err;
      }
    },
    retry: 2,
  });

  const { data: trainee, isLoading: traineeLoading } = useQuery({
    queryKey: ['trainee', user?.id, user?.email],
    queryFn: async () => {
      try {
        const userId = user?.id || user?.user_id;
        const normalizedEmail = safeString(user?.email).toLowerCase().trim();
        let result = userId ? await base44.entities.Trainee.filter({ user_id: userId }) : [];
        let traineeData = result?.[0] || null;

        if (!traineeData && normalizedEmail) {
          result = await base44.entities.Trainee.filter({ user_email: normalizedEmail });
          traineeData = result?.[0] || null;
        }

        if (traineeData && !traineeData.user_id && userId) {
          await base44.entities.Trainee.update(traineeData.id, { user_id: userId });
          traineeData = { ...traineeData, user_id: userId };
        }

        console.log('NutritionLog trainee:', traineeData?.id, traineeData?.user_id);
        return traineeData;
      } catch (err) {
        console.error('NutritionLog trainee error:', err);
        return null;
      }
    },
    enabled: !!user?.email,
    retry: 1,
  });

  const weekStart = startOfWeek(selectedDate, { weekStartsOn: 0 });
  const weekEnd = endOfWeek(selectedDate, { weekStartsOn: 0 });

  const { data: meals = [], isLoading: mealsLoading } = useQuery({
    queryKey: ['meals', user?.email, trainee?.id, view === 'day' ? dateStr : `${getIsraelDateString(weekStart)}-${getIsraelDateString(weekEnd)}`],
    staleTime: 10_000,
    queryFn: async () => {
      try {
        if (view === 'day') {
          const result = await base44.entities.MealEntry.filter({ date: dateStr });
          const filtered = safeArray(result).filter(record => nutritionRecordMatchesTrainee(record, trainee || { user_email: user?.email, user_id: user?.id }));
          console.log('NutritionLog meals count:', filtered.length);
          if (filtered.length > 0) {
            console.log('[TRACE-QUERY] all meals from DB:', filtered.map(m => ({
              id: m.id,
              food_name: m.food_name,
              meal_type: m.meal_type,
              calories: m.calories,
              grams_final: m.grams_final,
              per100_kcal: m.per100_kcal,         // undefined = not in schema, was stripped
              per100_missing: !m.per100_kcal,
              source_entity: 'MealEntry',
            })));
          }
          return filtered;
        } else {
          const allMeals = await base44.entities.MealEntry.list('-created_date', 1000);
          const filtered = safeArray(allMeals).filter(m => {
            if (!safeString(m?.date) || !nutritionRecordMatchesTrainee(m, trainee || { user_email: user?.email, user_id: user?.id })) return false;
            return m.date >= getIsraelDateString(weekStart) && m.date <= getIsraelDateString(weekEnd);
          });
          console.log('NutritionLog weekly meals count:', filtered.length);
          return filtered;
        }
      } catch (err) {
        console.error('NutritionLog meals error:', err);
        // Not critical - return empty array
        return [];
      }
    },
    enabled: !!user?.email,
    retry: 1,
  });

  const addMealMutation = useMutation({
    mutationFn: async ({ data, id }) => {
      try {
        console.log('💾 [MUTATION_START]', {
          hasId: !!id,
          traineeEmail: user?.email,
          currentDate: dateStr,
          incomingData: data
        });
        
        if (id) {
          const previousMeal = meals.find(m => m.id === id) || null;
          const updatePayload = { ...data, ...buildCanonicalTraineeFields(trainee, user) };
          console.log('💾 [MUTATION_UPDATE_PAYLOAD]', {
            id,
            food_name: updatePayload.food_name,
            meal_type: updatePayload.meal_type,
            date: updatePayload.date,
            grams_final: updatePayload.grams_final,
            calories: updatePayload.calories,
            per100_kcal: updatePayload.per100_kcal,
            // [TRACE] If food_name/meal_type/date are undefined here → PUT will wipe them (meal disappears)
            has_food_name: !!(updatePayload.food_name),
            has_date: !!(updatePayload.date),
            has_per100: !!(updatePayload.per100_kcal),
          });
          const result = await base44.entities.MealEntry.update(id, updatePayload);
          console.log('✅ [MUTATION_UPDATE_OK]', {
            id,
            food_name: result?.food_name,
            date: result?.date,
            calories: result?.calories,
            per100_kcal: result?.per100_kcal,
            per100_in_result: !!(result?.per100_kcal),
          });
          // Gram edits are not new meal events — do not update TraineeNutritionProfile here.
          return result;
        }
        
        // Prepare final data - preserve meal_type from incoming data, add trainee context
        const debugLogId = data?.debugLogId;
        const { debugLogId: _debugLogId, ...cleanData } = data || {};
        const finalData = { 
          ...cleanData,
          ...buildCanonicalTraineeFields(trainee, user),
          date: cleanData.date || dateStr  // Use incoming date if provided, fallback to current
        };
        
        console.log('💾 [MUTATION_CREATE_DATA]', {
          food_name: finalData.food_name,
          meal_type: finalData.meal_type,
          calories: finalData.calories,
          grams: finalData.grams_final,
          date: finalData.date,
          // [TRACE] per100 in payload sent to Base44 — if these are undefined, per100 never reaches the DB
          per100_kcal: finalData.per100_kcal,
          per100_protein: finalData.per100_protein,
          per100_carbs: finalData.per100_carbs,
          per100_fat: finalData.per100_fat,
          per100_in_payload: !!(finalData.per100_kcal),
        });
        
        const result = await base44.entities.MealEntry.create(finalData);
        if (debugLogId) {
          await base44.entities.NutritionAnalysisDebugLog.update(debugLogId, {
            status: 'SAVED_TO_DIARY',
            currentStep: 'saved_to_diary',
            updatedAt: new Date().toISOString(),
            debugNotes: { diarySave: { saved: true, recordIds: [result?.id], food_name: result?.food_name } }
          });
        }
        // Bug #1: batch all ingredient creates from one meal event into a single profile write.
        _scheduleNutritionFlush(trainee, result);
        // Bug #2: skip recordQuickFoodUse for 'correction' saves — saveAIFoodCorrection
        // (called from saveEditedIngredientsToMemory) already wrote UserRecentFoods for those.
        if (finalData.food_database_scope !== 'ai' && finalData.learning_event_type !== 'correction') {
          recordQuickFoodUse({ trainee, meal: result }).catch(err =>
            console.warn('[NON-FATAL] recordQuickFoodUse failed — MealEntry already committed, learning will retry on next save.', err)
          );
        }
        
        console.log('✅ [MUTATION_CREATE_OK]', {
          id: result?.id,
          food_name: result?.food_name,
          calories: result?.calories,
          // [TRACE] per100 in DB record returned by Base44 after create
          // If undefined/null here → Base44 schema does NOT have these fields
          per100_kcal: result?.per100_kcal,
          per100_protein: result?.per100_protein,
          per100_carbs: result?.per100_carbs,
          per100_fat: result?.per100_fat,
          per100_persisted: !!(result?.per100_kcal),
        });
        
        return result;
      } catch (err) {
        console.error('❌ [MUTATION_ERROR]', {
          message: err?.message,
          response: err?.response?.data,
          stack: safeString(err?.stack).split('\n').slice(0, 3)
        });
        if (data?.debugLogId) {
          await base44.entities.NutritionAnalysisDebugLog.update(data.debugLogId, {
            status: 'SAVE_FAILED',
            currentStep: 'diary_save_failed',
            updatedAt: new Date().toISOString(),
            errorMessage: err?.message || 'Diary save failed',
            errorStack: err?.stack || ''
          });
        }
        throw err;
      }
    },
    onSuccess: () => {
      console.log('✅ [MUTATION_SUCCESS] Invalidating meals query');
      queryClient.invalidateQueries({ queryKey: ['meals'] });
      logSyncEvent({ entity: 'MealEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'trainee_nutrition', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      setShowMealDialog(false);
      setEditingMeal(null);
    },
    onError: (error) => {
      console.error('❌ [MUTATION_ON_ERROR]', error);
      alert(`❌ שגיאה בשמירת הפריט:\n${error.message || 'שגיאה לא ידועה'}`);
    }
  });

  const deleteMealMutation = useMutation({
    mutationFn: async (id) => {
      const meal = safeArray(meals).find(m => m?.id === id);
      await recordDeletedFoodInMemory({ trainee, meal });
      return base44.entities.MealEntry.delete(id);
    },
    onSuccess: () => invalidateCoachTraineeSyncQueries(queryClient),
  });

  const { data: todayWater = [], isLoading: waterLoading } = useQuery({
    queryKey: ['water', user?.email, trainee?.id, dateStr],
    queryFn: async () => {
      try {
        const result = await base44.entities.WaterEntry.filter({
          date: dateStr,
          trainee_email: trainee?.user_email || user?.email,
        });
        const filtered = safeArray(result).filter(record => nutritionRecordMatchesTrainee(record, trainee || { user_email: user?.email, user_id: user?.id }));
        console.log('NutritionLog water entries:', filtered.length);
        return filtered;
      } catch (err) {
        console.error('NutritionLog water error:', err);
        return [];
      }
    },
    enabled: !!user?.email,
    retry: 1,
  });

  // Status management - resolve after data loads or timeout
  React.useEffect(() => {
    if (loadingStatus !== 'loading') return;

    const timeout = setTimeout(() => {
      if (userLoading || traineeLoading || mealsLoading) {
        console.warn('NutritionLog timeout - forcing ready state');
        setLoadingStatus('ready');
      }
    }, 5000);

    if (!userLoading && !mealsLoading) {
      setLoadingStatus('ready');
    }

    return () => clearTimeout(timeout);
  }, [userLoading, traineeLoading, mealsLoading, waterLoading, loadingStatus]);

  // Handle direct meal logging link from WhatsApp reminders
  React.useEffect(() => {
    const shouldOpenAddMeal = searchParams.get('openAddMeal') === '1';
    if (!shouldOpenAddMeal) return;

    const mealTypeParam = searchParams.get('mealType');
    const mealType = MEAL_TYPES[mealTypeParam] ? mealTypeParam : 'snack';
    setAddingMealType(mealType);
    setView('day');
    setShowAddItemSheet(true);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('openAddMeal');
    nextParams.delete('mealType');
    setSearchParams(nextParams, { replace: true });
  }, [searchParams, setSearchParams]);

  // Handle barcode search from URL parameter
  React.useEffect(() => {
    const barcode = searchParams.get('barcode');
    if (!barcode || !user?.email) return;

    const searchBarcode = async () => {
      setBarcodeSearching(true);
      console.log('[NutritionLog] Searching for barcode:', barcode);
      
      try {
        // Load ALL foods (not filtered) and search client-side
        const allFoods = await base44.entities.FoodItem.list();
        console.log('[NutritionLog] Total foods loaded:', safeArray(allFoods).length);
        
        // Find food where barcode exists in the barcodes array
        const matchedFood = safeArray(allFoods).find(food => {
          if (!food.barcodes) return false;
          
          // Handle both array and string formats
          if (Array.isArray(food.barcodes)) {
            return safeArray(food.barcodes).map(String).includes(safeString(barcode));
          } else if (typeof food.barcodes === 'string') {
            return safeString(food.barcodes) === safeString(barcode);
          }
          
          return false;
        });
        
        console.log('[NutritionLog] Matched food:', matchedFood?.name_he || matchedFood?.name || 'NOT FOUND');
        
        if (matchedFood) {
          setBarcodeSearchResult({
            found: true,
            food: matchedFood,
            barcode: barcode
          });
        } else {
          setBarcodeSearchResult({
            found: false,
            barcode: barcode
          });
        }
      } catch (err) {
        console.error('[NutritionLog] Barcode search error:', err);
        setBarcodeSearchResult({
          found: false,
          barcode: barcode,
          error: safeString(err?.message, 'שגיאה לא ידועה')
        });
      } finally {
        setBarcodeSearching(false);
        // Remove barcode from URL
        searchParams.delete('barcode');
        setSearchParams(searchParams, { replace: true });
      }
    };

    searchBarcode();
  }, [searchParams, user?.email]);

  const deleteWaterMutation = useMutation({
    mutationFn: (id) => base44.entities.WaterEntry.delete(id),
    onSuccess: () => invalidateCoachTraineeSyncQueries(queryClient),
  });

  const updateWaterMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.WaterEntry.update(id, data),
    onSuccess: () => invalidateCoachTraineeSyncQueries(queryClient),
  });

  React.useEffect(() => {
    let debounceTimer;
    const refresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => invalidateCoachTraineeSyncQueries(queryClient), 600);
    };
    const unsubMeal    = base44.entities.MealEntry.subscribe(refresh);
    const unsubWater   = base44.entities.WaterEntry.subscribe(refresh);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => {
      clearTimeout(debounceTimer);
      unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee();
    };
  }, [queryClient]);

  const addWaterMutation = useMutation({
    mutationFn: (amount) => base44.entities.WaterEntry.create({
      ...buildCanonicalTraineeFields(trainee, user),
      date: dateStr,
      amount_ml: amount,
      time: format(new Date(), 'HH:mm')
    }),
    onSuccess: () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      logSyncEvent({ entity: 'WaterEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'trainee_water', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      toast.success('מים התווספו בהצלחה ✓');
    }
  });

  const mealsByType = useMemo(() => {
    const grouped = { breakfast: [], lunch: [], dinner: [], snack: [] };
    safeArray(meals).filter(m => safeString(m?.date) === dateStr).forEach(meal => {
      const mealType = safeString(meal?.meal_type, 'snack');
      if (grouped[mealType]) {
        grouped[mealType].push(meal);
      }
    });
    return grouped;
  }, [meals, dateStr]);

  const findDuplicateMeal = (data) => {
    if (!data?.food_name || !data?.meal_type) return null;
    return safeArray(meals).find((meal) =>
      safeString(meal?.date) === safeString(data.date || dateStr) &&
      safeString(meal?.meal_type) === safeString(data.meal_type) &&
      normalizeFoodName(meal?.food_name) === normalizeFoodName(data.food_name)
    );
  };

  const saveMealWithDuplicateCheck = (data) => {
    const duplicate = findDuplicateMeal(data);
    console.log('[SMOKE] saveMealWithDuplicateCheck:', {
      food_name: data?.food_name,
      grams_final: data?.grams_final,
      per100_kcal: data?.per100_kcal?.toFixed?.(2),
      isDuplicate: !!duplicate,
      duplicateId: duplicate?.id,
    });
    if (duplicate) {
      setPendingDuplicateMeal({ duplicate, incoming: data });
      return;
    }
    addMealMutation.mutate({ data });
  };

  // Awaitable save for multi-ingredient loops (AI analysis, saved-meal restore).
  // Bypasses duplicate-check intentionally — batch saves must not open a dialog mid-loop.
  const handleAddMealAsync = (data) => addMealMutation.mutateAsync({ data });

  const openAddItemSheet = (mealType) => {
    setAddingMealType(mealType || addingMealType || 'snack');
    setShowAddItemSheet(true);
  };

  const openManualAdd = (mode = 'choose') => {
    setManualInitialMode(mode);
    setShowAddItemSheet(false);
    setShowMealDialog(true);
  };

  const openQuickAdd = (title = 'הוספה מהירה') => {
    setQuickAddTitle(title);
    setShowAddItemSheet(false);
    setShowQuickAddDialog(true);
  };

  const mergeDuplicateMeal = () => {
    const { duplicate, incoming } = pendingDuplicateMeal || {};
    if (!duplicate || !incoming) return;

    const mergedGrams    = safeNumber(duplicate.grams_final || duplicate.grams_equivalent) + safeNumber(incoming.grams_final || incoming.grams_equivalent);
    const mergedCalories = safeNumber(duplicate.calories) + safeNumber(incoming.calories);
    const mergedProtein  = Math.round((safeNumber(duplicate.protein) + safeNumber(incoming.protein)) * 10) / 10;
    const mergedCarbs    = Math.round((safeNumber(duplicate.carbs)   + safeNumber(incoming.carbs))   * 10) / 10;
    const mergedFat      = Math.round((safeNumber(duplicate.fat)     + safeNumber(incoming.fat))     * 10) / 10;

    // Preserve the canonical per100 anchor from the existing duplicate record.
    // Per100 is food-intrinsic and must not change when the user logs more of the same food.
    // If the existing record already has a canonical per100, keep it exactly.
    // If it is missing (pre-fix record), derive it from the merged totals as a best-effort.
    const per100_kcal    = duplicate.per100_kcal    || (mergedGrams > 0 ? mergedCalories / mergedGrams * 100 : 0);
    const per100_protein = duplicate.per100_protein || (mergedGrams > 0 ? mergedProtein  / mergedGrams * 100 : 0);
    const per100_carbs   = duplicate.per100_carbs   || (mergedGrams > 0 ? mergedCarbs    / mergedGrams * 100 : 0);
    const per100_fat     = duplicate.per100_fat     || (mergedGrams > 0 ? mergedFat      / mergedGrams * 100 : 0);

    console.log('[MERGE-TRACE] mergeDuplicateMeal:', {
      food_name: duplicate.food_name,
      before:   { grams: safeNumber(duplicate.grams_final || duplicate.grams_equivalent), calories: duplicate.calories, per100_kcal: duplicate.per100_kcal },
      incoming: { grams: safeNumber(incoming.grams_final  || incoming.grams_equivalent),  calories: incoming.calories,  per100_kcal: incoming.per100_kcal  },
      after:    { grams: mergedGrams, calories: mergedCalories, per100_kcal },
    });

    addMealMutation.mutate({
      id: duplicate.id,
      data: {
        quantity:        safeNumber(duplicate.quantity) + safeNumber(incoming.quantity),
        amount:          safeNumber(duplicate.amount || duplicate.quantity) + safeNumber(incoming.amount || incoming.quantity),
        grams_equivalent: mergedGrams,
        grams_final:      mergedGrams,
        calories:         mergedCalories,
        protein:          mergedProtein,
        carbs:            mergedCarbs,
        fat:              mergedFat,
        per100_kcal,
        per100_protein,
        per100_carbs,
        per100_fat,
      }
    });
    setPendingDuplicateMeal(null);
  };

  const dayTotals = useMemo(() => {
    const dayMeals = safeArray(meals).filter(m => safeString(m?.date) === dateStr);
    const totals = dayMeals.reduce((acc, m) => ({
      calories: acc.calories + safeNumber(m?.calories),
      protein: acc.protein + safeNumber(m?.protein),
      carbs: acc.carbs + safeNumber(m?.carbs),
      fat: acc.fat + safeNumber(m?.fat),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
    
    console.log('📊 [JOURNAL_TOTALS]', {
      date: dateStr,
      mealsCount: dayMeals.length,
      totals,
      meals: dayMeals.map(m => ({ food_name: safeString(m?.food_name, 'פריט לא שלם'), calories: safeNumber(m?.calories), grams: safeNumber(m?.grams_final || m?.grams_equivalent) }))
    });
    
    return totals;
  }, [meals, dateStr]);

  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const weekTotals = useMemo(() => {
    return weekDays.map(day => {
      const dayStr = getIsraelDateString(day);
      const dayMeals = safeArray(meals).filter(m => safeString(m?.date) === dayStr);
      return {
        date: day,
        calories: dayMeals.reduce((sum, m) => sum + safeNumber(m?.calories), 0),
        protein: dayMeals.reduce((sum, m) => sum + safeNumber(m?.protein), 0),
        carbs: dayMeals.reduce((sum, m) => sum + safeNumber(m?.carbs), 0),
        fat: dayMeals.reduce((sum, m) => sum + safeNumber(m?.fat), 0),
      };
    });
  }, [meals, weekDays]);

  const targets = {
    calories: safeNumber(trainee?.target_calories, 2000),
    protein: safeNumber(trainee?.target_protein, 150),
    carbs: safeNumber(trainee?.target_carbs, 200),
    fat: safeNumber(trainee?.target_fat, 70),
  };

  // Loading state
  if (loadingStatus === 'loading') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-sm text-slate-600">טוען יומן תזונה...</p>
          <p className="text-xs text-slate-400 mt-1">אם זה לוקח יותר מדי, רענן את הדף</p>
        </div>
      </div>
    );
  }

  // Error state
  if (loadingStatus === 'error') {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md w-full p-6 border-2 border-red-200">
          <div className="text-center mb-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-3xl">⚠️</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">לא הצלחנו לטעון את מסך התזונה</h2>
            {errorMessage && (
              <p className="text-sm text-red-600 mb-4">{errorMessage}</p>
            )}
            <div className="space-y-2">
              <Button
                onClick={() => {
                  setLoadingStatus('loading');
                  setErrorMessage(null);
                  window.location.reload();
                }}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                נסה שוב
              </Button>
              <Button
                onClick={() => {
                  setLoadingStatus('ready');
                  setErrorMessage(null);
                }}
                variant="outline"
                className="w-full"
              >
                המשך בלי הרשאות (ברירת מחדל)
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <RouteGuard moduleName="nutrition" trainee={trainee}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-lg mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">יומן תזונה</h1>
              <button
                onClick={() => setShowPersonalInfo(true)}
                className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 transition-colors"
                title="פרטים אישיים ויעדים"
              >
                <User className="w-4 h-4 text-slate-500" />
              </button>
            </div>
            <button
              onClick={() => setShowPersonalInfo(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 hover:bg-teal-100 border border-teal-200 text-teal-700 text-sm font-medium transition-colors"
            >
              <User className="w-3.5 h-3.5" />
              הגדרת ערכים
            </button>
          </div>
          
          {/* AI Buttons Row */}
          <div className="grid grid-cols-4 gap-2">
            <Button
              onClick={() => {
                setAddingMealType('snack');
                const panel = document.querySelector('[data-nutrition-smart-recommendations]');
                if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                else setShowSuggestionDialog(true);
              }}
              className="bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-white shadow-lg text-xs"
            >
              <span className="text-lg mr-0.5">✨</span>
              הצע
            </Button>
            <Button
              onClick={() => setShowAnalyzeDialog(true)}
              className="bg-gradient-to-r from-teal-400 to-teal-500 hover:from-teal-500 hover:to-teal-600 text-white shadow-lg text-xs"
            >
              <span className="text-lg mr-0.5">🔍</span>
              נתח
            </Button>
            <Button
              onClick={() => { setPhotoMealType(null); setShowPhotoDialog(true); }}
              className="bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white shadow-lg text-xs"
            >
              <span className="text-lg mr-0.5">📸</span>
              צלם
            </Button>
            <Button
              onClick={() => setShowAddProductDialog(true)}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg text-xs"
            >
              <span className="text-lg mr-0.5">➕</span>
              חדש
            </Button>
          </div>
        </div>

        {/* Barcode Search Result */}
        {barcodeSearching && (
          <Card className="p-4 mb-4 bg-blue-50 border-blue-200">
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-blue-700">מחפש מוצר לפי ברקוד...</p>
            </div>
          </Card>
        )}
        
        {barcodeSearchResult && (
          <Card className={`p-4 mb-4 ${barcodeSearchResult.found ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
            {barcodeSearchResult.found ? (
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-lg">✓</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-green-800 mb-1">נמצא מוצר!</h3>
                    <p className="text-sm text-green-700">{safeString(barcodeSearchResult?.food?.name_he || barcodeSearchResult?.food?.name, 'מוצר')}</p>
                    <p className="text-xs text-green-600 mt-1">ברקוד: {barcodeSearchResult.barcode}</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setBarcodeSearchResult(null)}
                    variant="ghost"
                    className="text-green-600 hover:text-green-800"
                  >
                    ✕
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      // Auto-fill meal dialog with this food
                      const food = barcodeSearchResult.food;
                      setEditingMeal({
                        food_name: food.name_he || food.name,
                        quantity: 100,
                        unit: 'gram',
                        grams_equivalent: 100,
                        calories: food.per100_kcal,
                        protein: food.per100_protein,
                        carbs: food.per100_carbs,
                        fat: food.per100_fat,
                        // per100 fields enable AddMealDialog to re-scale correctly when
                        // the user changes gram quantity before saving.
                        per100_kcal: food.per100_kcal,
                        per100_protein: food.per100_protein,
                        per100_carbs: food.per100_carbs,
                        per100_fat: food.per100_fat,
                        meal_type: 'snack'
                      });
                      setBarcodeSearchResult(null);
                      setShowMealDialog(true);
                    }}
                  >
                    הוסף לארוחה
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center flex-shrink-0">
                    <span className="text-white text-lg">✕</span>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-red-800 mb-1">מוצר לא נמצא</h3>
                    <p className="text-sm text-red-700">ברקוד {barcodeSearchResult.barcode} לא קיים במאגר</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setBarcodeSearchResult(null)}
                    variant="ghost"
                    className="text-red-600 hover:text-red-800"
                  >
                    ✕
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1"
                    variant="outline"
                    onClick={() => {
                      setBarcodeSearchResult(null);
                      setShowMealDialog(true);
                    }}
                  >
                    הוסף ידנית
                  </Button>
                  <Button
                    size="sm"
                    className="flex-1"
                    variant="outline"
                    onClick={() => navigate(createPageUrl('BarcodeScan') + '?returnTo=NutritionLog')}
                  >
                    נסה שוב
                  </Button>
                </div>
              </div>
            )}
          </Card>
        )}

        {/* View Tabs */}
        <Tabs value={view} onValueChange={setView} className="mb-4">
          <TabsList className="w-full bg-white">
            <TabsTrigger value="day" className="flex-1">יומי</TabsTrigger>
            <TabsTrigger value="week" className="flex-1">שבועי</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Date Navigation */}
        <Card className="p-3 mb-4 bg-white border-0 shadow-sm">
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(subDays(selectedDate, view === 'day' ? 1 : 7))}>
              <ChevronRight className="w-5 h-5" />
            </Button>
            <div className="text-center">
              <p className="font-bold text-slate-800">
                {view === 'day' 
                  ? format(selectedDate, 'EEEE, d בMMMM', { locale: he })
                  : `${format(weekStart, 'd/M')} - ${format(weekEnd, 'd/M')}`
                }
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedDate(addDays(selectedDate, view === 'day' ? 1 : 7))}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </div>
        </Card>

        {view === 'day' ? (
          <>
            <div className="mb-3">
              <QuickNutritionLogger
                trainee={trainee}
                dateStr={dateStr}
                defaultMealType={addingMealType || 'snack'}
                onAddMeal={(data) => saveMealWithDuplicateCheck(data)}
              />
            </div>

            {/* Smart Meal Suggestions */}
            {user?.email && (
              <SmartMealSuggestionsPanel
                traineeEmail={user.email}
                dateStr={dateStr}
                defaultMealType={addingMealType || 'snack'}
                onAddMeal={(data) => saveMealWithDuplicateCheck(data)}
              />
            )}

            {/* Macro Wheels */}
            <MacroWheels
              calories={dayTotals.calories}
              protein={dayTotals.protein}
              carbs={dayTotals.carbs}
              fat={dayTotals.fat}
              targetCalories={targets.calories}
              targetProtein={targets.protein}
              targetCarbs={targets.carbs}
              targetFat={targets.fat}
              title="סיכום יומי"
              onEditTargets={() => setShowPersonalInfo(true)}
            />

                {/* Water Log */}
                <Card className="p-4 mb-4 bg-white border-0 shadow-sm" onClick={() => setShowWaterLog(!showWaterLog)} style={{ cursor: 'pointer' }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Droplets className="w-5 h-5 text-blue-500" />
                      <div>
                        <h3 className="font-bold text-slate-700">יומן מים</h3>
                        <p className="text-xs text-slate-500">{safeArray(todayWater).reduce((s, w) => s + safeNumber(w?.amount_ml), 0)} מ״ל</p>
                      </div>
                    </div>
                    <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform ${showWaterLog ? 'rotate-90' : ''}`} />
                  </div>

                  {showWaterLog && (
                      <div className="mt-4 space-y-2 border-t pt-4">
                        <div className="grid grid-cols-3 gap-2 mb-4">
                          <Button size="sm" variant="outline" onClick={() => addWaterMutation.mutate(250)} className="text-xs">
                            250 מ״ל
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => addWaterMutation.mutate(500)} className="text-xs">
                            500 מ״ל
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => addWaterMutation.mutate(750)} className="text-xs">
                            750 מ״ל
                          </Button>
                        </div>
                         {safeArray(todayWater).length === 0 ? (
                          <p className="text-sm text-slate-400 text-center py-2">לא נוספו נוזלים היום</p>
                         ) : (
                           safeArray(todayWater).map(entry => (
                             <div key={entry.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg">
                               <div>
                                 <p className="font-medium text-slate-700">{safeNumber(entry?.amount_ml)} מ״ל</p>
                                 <p className="text-xs text-slate-400">{safeString(entry?.time, 'ללא שעה')}</p>
                               </div>
                               <div className="flex items-center gap-2">
                                 <Button 
                                   variant="ghost" 
                                   size="icon" 
                                   className="h-8 w-8 text-slate-400 hover:text-red-500"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     deleteWaterMutation.mutate(entry.id);
                                   }}
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </Button>
                               </div>
                             </div>
                           ))
                         )}
                      </div>
                    )}
                </Card>

            {/* Meals by Type — ingredient-level list */}
            <MealGroupList
              mealsByType={mealsByType}
              deleteMealMutation={deleteMealMutation}
              addMealMutation={addMealMutation}
              setAddingMealType={setAddingMealType}
              setShowMealDialog={setShowMealDialog}
              setEditingMeal={setEditingMeal}
              user={user}
              trainee={trainee}
              dateStr={dateStr}
              onAddItem={openAddItemSheet}
            />
          </>
        ) : (
          /* Weekly View */
          <Card className="p-4 bg-white border-0 shadow-sm">
            <div className="space-y-3">
              {weekTotals.map((day, i) => {
                const isToday = format(day.date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                const progress = Math.min((day.calories / targets.calories) * 100, 100);
                return (
                  <div 
                    key={i} 
                    className={`p-3 rounded-lg cursor-pointer transition-all ${isToday ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 hover:bg-slate-100'}`}
                    onClick={() => { setSelectedDate(day.date); setView('day'); }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium text-slate-700">
                        {format(day.date, 'EEEE', { locale: he })}
                      </span>
                      <span className="text-sm text-slate-500">{format(day.date, 'd/M')}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${progress >= 80 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-400'}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="text-sm font-medium text-slate-600 w-20 text-left">
                        {day.calories} / {targets.calories}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      <AddMealWithAI
        open={showMealAIDialog}
        onClose={() => setShowMealAIDialog(false)}
        onSave={(data) => saveMealWithDuplicateCheck(data)}
        onSaveAsync={handleAddMealAsync}
        traineeEmail={user?.email}
      />
      <AddMealManual
        open={showMealDialog}
        onClose={() => {
          setShowMealDialog(false);
          setEditingMeal(null);
          setManualInitialMode('choose');
          setAddingMealType(null);
        }}
        onSave={(data) => saveMealWithDuplicateCheck(data)}
        traineeEmail={user?.email}
        editingMeal={editingMeal}
        defaultMealType={addingMealType}
        initialMode={manualInitialMode}
      />
      <MealSuggestionDialogV2
        open={false}
        onClose={() => {}}
        onAddMeal={() => {}}
        traineeEmail={user?.email}
      />
      <AIAnalyzeMealDialog
        open={showAnalyzeDialog}
        onClose={() => setShowAnalyzeDialog(false)}
        onSave={(data) => saveMealWithDuplicateCheck(data)}
        onSaveAsync={handleAddMealAsync}
        selectedDate={selectedDate}
        defaultMealType={addingMealType}
      />
      <AddMealFromPhoto
        open={showPhotoDialog}
        onClose={() => setShowPhotoDialog(false)}
        onSuccess={() => { queryClient.invalidateQueries({ queryKey: ['meals'] }); setShowPhotoDialog(false); }}
        mealType={photoMealType}
        traineeEmail={user?.email}
      />
      <QuickNutritionLogger
        trainee={trainee}
        dateStr={dateStr}
        defaultMealType={addingMealType || 'snack'}
        onAddMeal={(data) => saveMealWithDuplicateCheck(data)}
        onAddMealAsync={handleAddMealAsync}
        open={showQuickAddDialog}
        onOpenChange={setShowQuickAddDialog}
        hideTrigger
        title={quickAddTitle}
      />
      <AddMealActionSheet
        open={showAddItemSheet}
        mealType={addingMealType || 'snack'}
        onClose={() => setShowAddItemSheet(false)}
        onPhoto={() => {
          setPhotoMealType(addingMealType || 'snack');
          setShowAddItemSheet(false);
          setShowPhotoDialog(true);
        }}
        onText={() => {
          setShowAddItemSheet(false);
          setShowAnalyzeDialog(true);
        }}
        onSearch={() => openManualAdd('search')}
        onQuick={() => openQuickAdd('הוספה מהירה')}
        onSaved={() => openQuickAdd('המאכלים שלי / אחרונים')}
      />
      <AIMealSuggestionDialog
        open={showSuggestionDialog}
        onClose={() => setShowSuggestionDialog(false)}
        onSave={(data) => saveMealWithDuplicateCheck(data)}
        traineeEmail={user?.email}
        selectedDate={selectedDate}
      />
      <DuplicateFoodDialog
         open={!!pendingDuplicateMeal}
         duplicate={pendingDuplicateMeal?.duplicate}
         incoming={pendingDuplicateMeal?.incoming}
         onMerge={mergeDuplicateMeal}
         onAddNew={() => {
           addMealMutation.mutate({ data: pendingDuplicateMeal.incoming });
           setPendingDuplicateMeal(null);
         }}
         onCancel={() => setPendingDuplicateMeal(null)}
       />
      <EditPersonalInfo
         open={showPersonalInfo}
         onClose={() => setShowPersonalInfo(false)}
         trainee={trainee}
       />
       <AddNewProductDialog
         open={showAddProductDialog}
         onClose={() => setShowAddProductDialog(false)}
         onSuccess={() => queryClient.invalidateQueries({ queryKey: ['meals'] })}
       />
       </div>
      </RouteGuard>
      );
      }