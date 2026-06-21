import React, { useState, useRef, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera, Upload, Loader2, Check, X, Edit2, Search, AlertCircle, Plus, Trash2, RefreshCw, Sparkles, ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQuery } from '@tanstack/react-query';
import { applyCanonicalLock, batchUpdateNutritionMemory, saveAIFoodCorrection } from './nutritionLearning';
import { toast } from 'sonner';
import { getIsraelDateString } from '@/utils/nutritionSync';

const ANALYZING_MESSAGES = [
  '🔍 GPT-4o סורק ומזהה מאכלים...',
  '🧪 Claude מחשב ערכי תזונה מדויקים...',
  '🗄️ מחפש התאמה במאגר המקומי...',
  '✨ מסיים ומרכיב תוצאות...',
];

const CONFIDENCE_CONFIG = {
  high:   { label: 'זיהוי בטוח', color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300', icon: '✅', pct: 90, barColor: '#22c55e' },
  medium: { label: 'זיהוי סביר', color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300', icon: '⚠️', pct: 60, barColor: '#f59e0b' },
  low:    { label: 'זיהוי לא בטוח', color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300', icon: '❓', pct: 30, barColor: '#ef4444' },
};

const MEAL_TYPE_OPTIONS = [
  { value: 'breakfast', label: 'ארוחת בוקר', emoji: '🌅' },
  { value: 'lunch', label: 'צהריים', emoji: '☀️' },
  { value: 'dinner', label: 'ארוחת ערב', emoji: '🌙' },
  { value: 'snack', label: 'חטיף', emoji: '🍎' },
];

export default function AddMealFromPhoto({ open, onClose, onSuccess, mealType, traineeEmail }) {
  const [step, setStep] = useState('upload');
  const [selectedMealType, setSelectedMealType] = useState(mealType || 'breakfast');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [editedItems, setEditedItems] = useState([]);
  const [originalAiItems, setOriginalAiItems] = useState([]);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [analyzingMessageIdx, setAnalyzingMessageIdx] = useState(0);
  const [expandedItems, setExpandedItems] = useState({});
  const [correctingItem, setCorrectingItem] = useState(null); // index of item being corrected
  const [correctionSearch, setCorrectionSearch] = useState('');
  const [correctionLoading, setCorrectionLoading] = useState(false);
  // Clarification state
  const [clarifyingQuestions, setClarifyingQuestions] = useState([]);
  const [userAnswers, setUserAnswers] = useState({});
  const [userNotes, setUserNotes] = useState('');
  // Duplicate detection state
  const [duplicates, setDuplicates] = useState([]); // [{indices: [i,j], name}]
  const [duplicateDecisions, setDuplicateDecisions] = useState({}); // name -> 'merge' | 'keep_both'

  useEffect(() => {
    if (open) setSelectedMealType(mealType || 'breakfast');
  }, [open, mealType]);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const analyzeIntervalRef = useRef(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    enabled: open,
  });

  const { data: trainee } = useQuery({
    queryKey: ['photoCorrectionTrainee', traineeEmail],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: traineeEmail });
      return trainees[0] || null;
    },
    enabled: !!traineeEmail && open,
  });

  const { data: personalFoods = [] } = useQuery({
    queryKey: ['photoCorrectionPersonalFoods', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee?.id, visibility: 'personal', active: true }),
    enabled: !!trainee?.id && open,
  });

  const { data: allFoodItems = [] } = useQuery({
    queryKey: ['allFoodItems'],
    queryFn: () => base44.entities.FoodItem.filter({ active: true }),
    enabled: open,
  });

  useEffect(() => {
    if (step === 'analyzing') {
      setAnalyzingMessageIdx(0);
      analyzeIntervalRef.current = setInterval(() => {
        setAnalyzingMessageIdx(i => (i + 1) % ANALYZING_MESSAGES.length);
      }, 2200);
    } else {
      clearInterval(analyzeIntervalRef.current);
    }
    return () => clearInterval(analyzeIntervalRef.current);
  }, [step]);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('יש להעלות קובץ תמונה בלבד'); return; }
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    setError(null);
  };

  // Step 1: Upload image and do first analysis pass
  const analyzeImage = async (answersOverride = null, notesOverride = '') => {
    if (!imageFile && !imageUrl) return;
    setStep('analyzing');
    setError(null);

    try {
      let uploadedUrl = imageUrl;
      if (!uploadedUrl) {
        // Convert image to compressed base64 data URL (no external upload service needed)
        uploadedUrl = await new Promise((resolve, reject) => {
          const img = new Image();
          const objectUrl = URL.createObjectURL(imageFile);
          img.onload = () => {
            URL.revokeObjectURL(objectUrl);
            const MAX_DIM = 1024;
            let { width, height } = img;
            if (width > MAX_DIM || height > MAX_DIM) {
              const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.8));
          };
          img.onerror = reject;
          img.src = objectUrl;
        });
        setImageUrl(uploadedUrl);
      }

      const payload = { image_url: uploadedUrl };
      if (answersOverride) payload.user_answers = answersOverride;
      if (notesOverride?.trim()) payload.user_notes = notesOverride.trim();

      const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', payload);
      // Server wraps result under data.response — use same path as AIAnalyzeMealDialog
      const result = response?.data?.response ?? response?.data;

      // If backend says it needs clarification — show questions
      if (result.needs_clarification && result.clarifying_questions?.length > 0) {
        setClarifyingQuestions(result.clarifying_questions);
        const defaults = {};
        result.clarifying_questions.forEach(q => { defaults[q.id] = q.default_value || ''; });
        setUserAnswers(defaults);
        setStep('clarify');
        return;
      }

      // Normalize items: AI returns `amount` field, component expects `grams`
      const normalizedItems = (result.items || []).map(item => {
        const grams = item.grams || item.amount || item.quantity_grams || 100;
        // If calories are 0 but total_calories is set, distribute evenly as fallback
        let calories = item.calories || 0;
        let protein  = item.protein  || 0;
        let carbs    = item.carbs    || 0;
        let fat      = item.fat      || 0;
        if (calories === 0 && (result.total_calories || 0) > 0 && (result.items || []).length > 0) {
          const n = result.items.length;
          calories = Math.round((result.total_calories || 0) / n);
          protein  = Math.round((result.total_protein  || 0) / n);
          carbs    = Math.round((result.total_carbs    || 0) / n);
          fat      = Math.round((result.total_fat      || 0) / n);
        }
        return { ...item, grams, calories, protein, carbs, fat };
      });
      const items = applyCanonicalLock(normalizedItems, personalFoods);
      setAnalysis(result);
      setOriginalAiItems(normalizedItems);
      setEditedItems(items);
      setExpandedItems({});

      // Detect duplicates before showing review
      const dups = detectDuplicates(items);
      if (dups.length > 0) {
        setDuplicates(dups);
        setDuplicateDecisions({});
        setStep('dedup');
        return;
      }
      setDuplicates([]);
      setStep(mealType ? 'review' : 'pick_meal');
    } catch (err) {
      const isRateLimit = err?.status === 429 || err?.message?.includes('Rate limit') || err?.message?.includes('429');
      setError(isRateLimit
        ? 'המערכת עמוסה כרגע — נסה שוב בעוד כמה שניות 🙏'
        : `שגיאה בניתוח התמונה: ${err?.message || 'שגיאה לא ידועה'}`
      );
      setStep('upload');
    }
  };

  // Normalize ingredient name for duplicate detection
  const normalizeName = (name) => {
    return (name || '')
      .replace(/[\u0591-\u05C7]/g, '') // remove Hebrew niqqud
      .replace(/[^\u0590-\u05FFa-zA-Z0-9\s]/g, '') // remove emojis/punctuation
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  };

  // Detect duplicates in items list
  const detectDuplicates = (items) => {
    const found = [];
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const a = normalizeName(items[i].name);
        const b = normalizeName(items[j].name);
        if (a === b || (a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a)))) {
          // Check if already grouped
          const existing = found.find(d => d.indices.includes(i) || d.indices.includes(j));
          if (existing) {
            if (!existing.indices.includes(j)) existing.indices.push(j);
          } else {
            found.push({ indices: [i, j], name: items[i].name });
          }
        }
      }
    }
    return found;
  };

  // Step 2: User answered clarifying questions — re-analyze with answers + notes
  const handleClarifySubmit = () => {
    analyzeImage(userAnswers, userNotes);
  };

  // Handle duplicate resolution
  const handleDedupConfirm = () => {
    let items = [...editedItems];
    // Process decisions in reverse index order to not mess up indices
    for (const dup of duplicates) {
      const decision = duplicateDecisions[dup.name] || 'merge';
      if (decision === 'merge') {
        // Keep the first, remove the rest
        const toRemove = dup.indices.slice(1);
        items = items.filter((_, i) => !toRemove.includes(i));
      }
      // 'keep_both' → do nothing
    }
    setEditedItems(items);
    setDuplicates([]);
    setStep(mealType ? 'review' : 'pick_meal');
  };

  const handleEditItem = (index, field, value) => {
    const updated = [...editedItems];
    // Capture current grams BEFORE the field assignment (needed if field === 'grams')
    const prevGrams = updated[index].grams || 100;
    updated[index][field] = field === 'name' ? value : parseFloat(value) || 0;
    updated[index]._corrected = true;
    if (field === 'grams') {
      const newGrams = parseFloat(value) || 0;
      if (newGrams > 0) {
        // Use canonical per100 anchor if available; otherwise derive from previous absolute values.
        // This ensures canonical-matched items stay consistent across gram edits.
        const p100kcal    = updated[index].per100_kcal    || (prevGrams > 0 ? (updated[index].calories || 0) / prevGrams * 100 : 0);
        const p100protein = updated[index].per100_protein || (prevGrams > 0 ? (updated[index].protein  || 0) / prevGrams * 100 : 0);
        const p100carbs   = updated[index].per100_carbs   || (prevGrams > 0 ? (updated[index].carbs    || 0) / prevGrams * 100 : 0);
        const p100fat     = updated[index].per100_fat     || (prevGrams > 0 ? (updated[index].fat      || 0) / prevGrams * 100 : 0);
        // Lock in the per100 anchor so subsequent gram edits remain consistent
        updated[index].per100_kcal    = p100kcal;
        updated[index].per100_protein = p100protein;
        updated[index].per100_carbs   = p100carbs;
        updated[index].per100_fat     = p100fat;
        updated[index].calories = Math.round((p100kcal    / 100) * newGrams);
        updated[index].protein  = Math.round(((p100protein / 100) * newGrams) * 10) / 10;
        updated[index].carbs    = Math.round(((p100carbs   / 100) * newGrams) * 10) / 10;
        updated[index].fat      = Math.round(((p100fat     / 100) * newGrams) * 10) / 10;
      }
    }
    setEditedItems(updated);
  };

  const removeItem = (index) => setEditedItems(editedItems.filter((_, i) => i !== index));
  const addItem = () => setEditedItems([...editedItems, { name: '', grams: 100, calories: 0, protein: 0, carbs: 0, fat: 0 }]);

  const calculateTotals = () =>
    editedItems.reduce((acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fat: acc.fat + (item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  const handleSaveMeal = async () => {
    if (!editedItems || editedItems.length === 0) return;
    setStep('saving');
    const today = getIsraelDateString();
    let learnedCorrection = false;
    let failedItemName = null;
    const savedMeals = [];
    try {
      for (let index = 0; index < editedItems.length; index++) {
        const item = editedItems[index];
        if (!item.name || item.calories === 0) continue;
        const originalItem = originalAiItems[index] || {};
        const grams = item.grams || 100;
        // Derive per100 from canonical values if available; fall back to item absolute / grams
        const per100_kcal    = item.per100_kcal    || (grams > 0 ? (item.calories || 0) / grams * 100 : 0);
        const per100_protein = item.per100_protein || (grams > 0 ? (item.protein  || 0) / grams * 100 : 0);
        const per100_carbs   = item.per100_carbs   || (grams > 0 ? (item.carbs    || 0) / grams * 100 : 0);
        const per100_fat     = item.per100_fat     || (grams > 0 ? (item.fat      || 0) / grams * 100 : 0);
        console.log(`[PHOTO-SAVE] "${item.name}" grams=${grams} kcal=${item.calories} per100_kcal=${per100_kcal.toFixed(2)} source=${item.nutrition_source || 'ai'}`);
        const mealData = {
          trainee_id: trainee?.id,
          user_id: user?.id,
          trainee_email: trainee?.user_email || traineeEmail,
          date: today,
          meal_type: selectedMealType,
          food_name: item.name,
          user_food_item_id: item.user_food_item_id,
          // user_food_item_id is set by applyCanonicalLock for matched items — use as scope indicator
          food_database_scope: item.user_food_item_id ? 'personal' : 'ai',
          learning_event_type: item._corrected || item.user_food_item_id ? 'correction' : 'photo',
          ai_original_food_name: originalItem.name || originalItem.name_he || item.name,
          quantity: grams,
          unit: 'gram',
          grams_equivalent: grams,
          grams_final: grams,
          calories: Math.round((per100_kcal    / 100) * grams),
          protein:  Math.round(((per100_protein / 100) * grams) * 10) / 10,
          carbs:    Math.round(((per100_carbs   / 100) * grams) * 10) / 10,
          fat:      Math.round(((per100_fat     / 100) * grams) * 10) / 10,
          per100_kcal,
          per100_protein,
          per100_carbs,
          per100_fat,
        };
        if (item._corrected && trainee) {
          const savedFood = await saveAIFoodCorrection({ user, trainee, originalItem, correctedMeal: mealData, imageContext: imageUrl || '', notes: userNotes });
          mealData.user_food_item_id = savedFood?.id || mealData.user_food_item_id;
          mealData.food_database_scope = 'personal';
          learnedCorrection = true;
        }
        failedItemName = item.name;
        await base44.entities.MealEntry.create(mealData);
        failedItemName = null;
        savedMeals.push(mealData);
      }
      // Update TraineeNutritionProfile so photo meals count toward total_meals_logged,
      // average_calories_per_meal, and meal_timing_habits — same as NutritionLog-routed saves.
      // All ingredients are passed at once so batchUpdateNutritionMemory counts them as ONE meal.
      if (trainee && savedMeals.length > 0) {
        batchUpdateNutritionMemory({ trainee, meals: savedMeals }).catch(err =>
          console.warn('[NON-FATAL] photo meal profile flush failed — MealEntry already committed.', err)
        );
      }
      if (learnedCorrection) toast.success('נשמר — אלמד להשתמש בזה בפעם הבאה ✅');
      onSuccess();
      handleClose();
    } catch (err) {
      console.error('[AddMealFromPhoto] partial save failure', err);
      toast.error(`שגיאה בשמירת${failedItemName ? ` "${failedItemName}"` : ' הארוחה'} — חלק מהמרכיבים לא נשמרו`);
      setStep('review');
    }
  };

  const handleProductSelect = (product) => {
    if (editedItems.length > 0) {
      const updatedItems = [...editedItems];
      const grams = updatedItems[0].grams || 100;
      updatedItems[0] = {
        name: product.name_he,
        grams,
        _corrected: true,
        per100_kcal:    product.per100_kcal,
        per100_protein: product.per100_protein,
        per100_carbs:   product.per100_carbs,
        per100_fat:     product.per100_fat,
        calories: Math.round((product.per100_kcal / 100) * grams),
        protein: Math.round(((product.per100_protein / 100) * grams) * 10) / 10,
        carbs: Math.round(((product.per100_carbs / 100) * grams) * 10) / 10,
        fat: Math.round(((product.per100_fat / 100) * grams) * 10) / 10,
        nutrition_source: 'local_database',
      };
      setEditedItems(updatedItems);
    }
    setShowProductSearch(false);
    setSearchQuery('');
  };

  // Replace a specific item with a product from DB, or re-calculate with AI by name
  const handleCorrectItem = async (index, product) => {
    const updatedItems = [...editedItems];
    const grams = updatedItems[index].grams || 100;
    updatedItems[index] = {
      name: product.name_he,
      grams,
      _corrected: true,
      per100_kcal:    product.per100_kcal,
      per100_protein: product.per100_protein,
      per100_carbs:   product.per100_carbs,
      per100_fat:     product.per100_fat,
      calories: Math.round((product.per100_kcal / 100) * grams),
      protein: Math.round(((product.per100_protein / 100) * grams) * 10) / 10,
      carbs: Math.round(((product.per100_carbs / 100) * grams) * 10) / 10,
      fat: Math.round(((product.per100_fat / 100) * grams) * 10) / 10,
      nutrition_source: 'local_database',
    };
    setEditedItems(updatedItems);
    setCorrectingItem(null);
    setCorrectionSearch('');
  };

  const handleCorrectItemByText = async (index, foodName) => {
    if (!foodName.trim()) return;
    setCorrectionLoading(true);
    const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
      meal_text: `${foodName} ${editedItems[index].grams}g`
    });
    const result = response?.data?.response ?? response?.data;
    if (result?.items?.length > 0) {
      const updatedItems = [...editedItems];
      const newItem = result.items[0];
      updatedItems[index] = { ...newItem, name: newItem.name, grams: editedItems[index].grams, _corrected: true };
      setEditedItems(updatedItems);
    }
    setCorrectionLoading(false);
    setCorrectingItem(null);
    setCorrectionSearch('');
  };

  const getProductSuggestions = () => {
    if (!analysis?.items?.[0]?.name) return [];
    const keywords = analysis.items[0].name.toLowerCase().split(' ');
    return allFoodItems.filter(item => keywords.some(kw => item.name_he.toLowerCase().includes(kw))).slice(0, 5);
  };

  const handleClose = () => {
    setStep('upload');
    setSelectedMealType(mealType || 'breakfast');
    setImageFile(null);
    setImagePreview(null);
    setImageUrl(null);
    setAnalysis(null);
    setEditedItems([]);
    setOriginalAiItems([]);
    setError(null);
    setSearchQuery('');
    setShowProductSearch(false);
    setExpandedItems({});
    setClarifyingQuestions([]);
    setUserAnswers({});
    setUserNotes('');
    setDuplicates([]);
    setDuplicateDecisions({});
    onClose();
  };

  const toggleItemExpand = (index) => setExpandedItems(prev => ({ ...prev, [index]: !prev[index] }));
  const getMealTypeLabel = () => ({ breakfast: 'ארוחת בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'חטיף' })[mealType] || mealType;

  const confidenceCfg = CONFIDENCE_CONFIG[analysis?.confidence] || CONFIDENCE_CONFIG.medium;
  const totals = calculateTotals();

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2" style={{ color: '#79DBD6' }}>
            <Sparkles className="w-5 h-5" />
            הוסף ארוחה מתמונה
          </DialogTitle>
          <p className="text-sm text-slate-500">{MEAL_TYPE_OPTIONS.find(o => o.value === selectedMealType)?.label || getMealTypeLabel()} • ניתוח AI אוטומטי</p>
        </DialogHeader>

        {/* ─── UPLOAD ─── */}
        {step === 'upload' && (
          <div className="space-y-4">
            {!imagePreview ? (
              <div className="space-y-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="w-full h-36 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 flex flex-col items-center justify-center gap-2 text-white transition-all shadow-md"
                >
                  <Camera className="w-9 h-9" />
                  <span className="text-lg font-semibold">צלם ארוחה</span>
                  <span className="text-xs opacity-80">מצלמה אחורית</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-20 rounded-2xl border-2 border-dashed border-slate-300 hover:border-slate-400 bg-slate-50 hover:bg-slate-100 flex flex-col items-center justify-center gap-1 text-slate-600 transition-all"
                >
                  <Upload className="w-6 h-6" />
                  <span className="text-sm font-medium">העלה מהגלריה</span>
                </button>
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={handleFileSelect} className="hidden" />
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex gap-2">
                  <span>💡</span>
                  <span>צלם/י מלמעלה עם תאורה טובה לתוצאה מדויקת יותר</span>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative rounded-xl overflow-hidden border-2 border-slate-200">
                  <img src={imagePreview} alt="Preview" className="w-full h-64 object-cover" />
                  <button
                    onClick={() => { setImageFile(null); setImagePreview(null); setImageUrl(null); }}
                    className="absolute top-2 left-2 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <Button onClick={() => analyzeImage()} className="w-full h-12 text-base font-semibold rounded-xl gap-2" style={{ backgroundColor: '#79DBD6' }}>
                  <Sparkles className="w-5 h-5" />
                  נתח עם AI
                </Button>
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-800 flex gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* ─── ANALYZING ─── */}
        {step === 'analyzing' && (
          <div className="flex flex-col items-center justify-center py-10 space-y-6">
            <div className="relative">
              <div className="w-20 h-20 rounded-full border-4 border-slate-100 flex items-center justify-center bg-white shadow-md">
                <Sparkles className="w-9 h-9" style={{ color: '#79DBD6' }} />
              </div>
              <Loader2 className="w-20 h-20 animate-spin absolute inset-0" style={{ color: '#79DBD6', opacity: 0.25 }} />
            </div>
            <div className="text-center space-y-1 px-4">
              <p className="text-lg font-bold text-slate-800">{ANALYZING_MESSAGES[analyzingMessageIdx]}</p>
              <p className="text-sm text-slate-400">GPT-4o Vision · Claude Nutrition</p>
            </div>
            <div className="w-full space-y-2 px-2">
              {ANALYZING_MESSAGES.map((msg, i) => {
                const done = i < analyzingMessageIdx;
                const active = i === analyzingMessageIdx;
                return (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all duration-300 ${active ? 'bg-teal-50 border border-teal-200' : done ? 'opacity-60' : 'opacity-30'}`}>
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold transition-all ${done ? 'bg-teal-500 text-white' : active ? 'border-2 border-teal-400 text-teal-600' : 'border-2 border-slate-200 text-slate-300'}`}>
                      {done ? '✓' : i + 1}
                    </div>
                    <span className={`text-sm ${active ? 'font-semibold text-teal-800' : done ? 'text-slate-500 line-through' : 'text-slate-300'}`}>{msg.replace(/^.{2}/, '')}</span>
                    {active && <Loader2 className="w-3.5 h-3.5 animate-spin text-teal-500 mr-auto" />}
                  </div>
                );
              })}
            </div>
            {imagePreview && (
              <div className="w-full rounded-xl overflow-hidden border-2 border-slate-100 h-32">
                <img src={imagePreview} alt="Analyzing" className="w-full h-full object-cover opacity-70" />
              </div>
            )}
          </div>
        )}

        {/* ─── CLARIFY ─── */}
        {step === 'clarify' && (
          <div className="space-y-5">
            {imagePreview && (
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-100">
                <img src={imagePreview} alt="Meal" className="w-full h-36 object-cover" />
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">🤔</span>
                <h3 className="font-bold text-amber-800">כמה שאלות לדיוק</h3>
              </div>
              <p className="text-sm text-amber-700">כדי לחשב נכון, עזור לנו לדייק את הכמויות:</p>
            </div>

            <div className="space-y-4">
              {clarifyingQuestions.map((q) => (
                <div key={q.id} className="bg-white border-2 border-slate-200 rounded-xl p-4 space-y-2">
                  <p className="font-semibold text-slate-800 text-sm">{q.question}</p>
                  <div className="space-y-2">
                    {q.type === 'choice' && q.options?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {q.options.map(opt => (
                          <button
                            key={opt}
                            onClick={() => setUserAnswers(prev => ({ ...prev, [q.id]: opt }))}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium border-2 transition-all ${
                              userAnswers[q.id] === opt
                                ? 'border-teal-400 bg-teal-50 text-teal-700'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                    <Input
                      type={q.type === 'number' ? 'number' : 'text'}
                      min={q.type === 'number' ? '0' : undefined}
                      value={userAnswers[q.id] || ''}
                      onChange={e => setUserAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                      placeholder={q.default_value || (q.type === 'number' ? '0' : 'הקלד תשובה חופשית...')}
                      className="w-full h-10 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* User notes field */}
            <div className="bg-white border-2 border-slate-200 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-slate-500" />
                <p className="font-semibold text-slate-800 text-sm">📝 הערות ל-AI</p>
              </div>
              <Textarea
                value={userNotes}
                onChange={e => setUserNotes(e.target.value)}
                placeholder="הוסף הערה שתעזור ל-AI לדייק את החישוב... לדוגמה: &quot;המאפה היה קטן&quot;, &quot;היו 2 ביצים שלא זיהית&quot;, &quot;הקפה היה עם חלב 3%&quot;"
                rows={3}
                className="text-sm resize-none"
              />
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => { setStep('upload'); }} className="flex-1 rounded-xl">
                בטל
              </Button>
              <Button
                onClick={handleClarifySubmit}
                className="flex-1 h-12 text-base font-semibold rounded-xl gap-2"
                style={{ backgroundColor: '#79DBD6' }}
              >
                <Sparkles className="w-5 h-5" />
                נתח עכשיו
              </Button>
            </div>
          </div>
        )}

        {/* ─── DEDUP ─── */}
        {step === 'dedup' && (
          <div className="space-y-5">
            {imagePreview && (
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-100">
                <img src={imagePreview} alt="Meal" className="w-full h-36 object-cover" />
              </div>
            )}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xl">⚠️</span>
                <h3 className="font-bold text-amber-800">זיהינו רכיבים כפולים</h3>
              </div>
              <p className="text-sm text-amber-700">נראה שהAI זיהה את אותו מוצר פעמיים. איחוד ימנע ספירה כפולה של קלוריות.</p>
            </div>

            <div className="space-y-3">
              {duplicates.map((dup) => {
                const decision = duplicateDecisions[dup.name] || 'merge';
                const items = dup.indices.map(i => editedItems[i]);
                return (
                  <div key={dup.name} className="bg-white border-2 border-orange-200 rounded-xl p-4 space-y-3">
                    <p className="font-semibold text-slate-800 text-sm">
                      זיהינו את <span className="text-orange-600">"{dup.name}"</span> פעמיים:
                    </p>
                    <div className="space-y-1 text-xs text-slate-500">
                      {items.map((item, i) => (
                        <div key={i} className="flex justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                          <span>{item.name}</span>
                          <span className="font-medium text-slate-700">{item.calories} קל׳ | {item.grams}ג׳</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setDuplicateDecisions(prev => ({ ...prev, [dup.name]: 'merge' }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                          decision === 'merge'
                            ? 'border-teal-400 bg-teal-50 text-teal-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        ✅ אותו מוצר — איחוד
                      </button>
                      <button
                        onClick={() => setDuplicateDecisions(prev => ({ ...prev, [dup.name]: 'keep_both' }))}
                        className={`flex-1 py-2 rounded-xl text-sm font-medium border-2 transition-all ${
                          decision === 'keep_both'
                            ? 'border-orange-400 bg-orange-50 text-orange-700'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        🔢 שתי יחידות שונות
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={handleDedupConfirm}
              className="w-full h-12 text-base font-semibold rounded-xl gap-2"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Check className="w-5 h-5" />
              המשך
            </Button>
          </div>
        )}

        {/* ─── PICK MEAL TYPE ─── */}
        {step === 'pick_meal' && (
          <div className="space-y-5">
            {imagePreview && (
              <div className="relative rounded-xl overflow-hidden border-2 border-slate-100">
                <img src={imagePreview} alt="Meal" className="w-full h-36 object-cover" />
              </div>
            )}
            <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 text-center">
              <p className="font-bold text-teal-800 text-base">לאיזו ארוחה לשייך?</p>
              <p className="text-sm text-teal-600 mt-0.5">בחר את סוג הארוחה שצילמת</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {MEAL_TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setSelectedMealType(opt.value)}
                  className={`p-4 rounded-2xl border-2 text-center transition-all ${
                    selectedMealType === opt.value
                      ? 'border-teal-400 bg-teal-50'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-3xl mb-1">{opt.emoji}</div>
                  <div className={`text-sm font-bold ${selectedMealType === opt.value ? 'text-teal-700' : 'text-slate-700'}`}>{opt.label}</div>
                </button>
              ))}
            </div>
            <Button
              onClick={() => setStep('review')}
              className="w-full h-12 text-base font-semibold rounded-xl gap-2"
              style={{ backgroundColor: '#79DBD6' }}
            >
              <Check className="w-5 h-5" />
              המשך לאישור
            </Button>
          </div>
        )}

        {/* ─── REVIEW ─── */}
        {step === 'review' && analysis && (
          <div className="space-y-4">
            <div className="relative rounded-xl overflow-hidden border-2 border-slate-100">
              <img src={imagePreview} alt="Meal" className="w-full h-44 object-cover" />
            </div>

            {/* Confidence banner */}
            <div className={`rounded-xl border-2 p-3 space-y-2 ${confidenceCfg.bg} ${confidenceCfg.border}`}>
              <div className="flex items-center gap-3">
                <span className="text-xl">{confidenceCfg.icon}</span>
                <div className="flex-1">
                  <p className={`font-bold text-sm ${confidenceCfg.color}`}>{confidenceCfg.label}</p>
                  {analysis.notes && <p className={`text-xs mt-0.5 ${confidenceCfg.color} opacity-80`}>{analysis.notes}</p>}
                </div>
                <Button variant="ghost" size="sm" onClick={() => { setStep('upload'); setAnalysis(null); setImageUrl(null); }} className="text-slate-500 hover:text-slate-700 gap-1 text-xs">
                  <RefreshCw className="w-3 h-3" />
                  נתח מחדש
                </Button>
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-xs opacity-60">
                  <span className={confidenceCfg.color}>רמת ביטחון</span>
                  <span className={confidenceCfg.color}>{confidenceCfg.pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-white/60 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${confidenceCfg.pct}%`, backgroundColor: confidenceCfg.barColor }} />
                </div>
              </div>
            </div>

            {/* Product search */}
            <div>
              {!showProductSearch ? (
                <button
                  onClick={() => setShowProductSearch(true)}
                  className="w-full py-2 text-sm text-blue-600 hover:text-blue-700 border border-blue-200 rounded-xl bg-blue-50 hover:bg-blue-100 transition-all flex items-center justify-center gap-2"
                >
                  <Search className="w-4 h-4" />
                  בחר מוצר מדויק מהמאגר
                </button>
              ) : (
                <div className="border-2 border-blue-300 rounded-xl p-3 space-y-2 bg-white">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-slate-700">חיפוש מוצר</span>
                    <button onClick={() => setShowProductSearch(false)}><X className="w-4 h-4 text-slate-400" /></button>
                  </div>
                  <Input
                    placeholder="חפש במאגר..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="h-9 text-sm"
                  />
                  <div className="max-h-52 overflow-y-auto space-y-1">
                    {(searchQuery
                      ? allFoodItems.filter(i => i.name_he.toLowerCase().includes(searchQuery.toLowerCase())).slice(0, 10)
                      : getProductSuggestions()
                    ).map(product => (
                      <button
                        key={product.id}
                        onClick={() => handleProductSelect(product)}
                        className="w-full text-right p-2 rounded-lg hover:bg-blue-50 border border-slate-100 transition-colors"
                      >
                        <p className="text-sm font-medium text-slate-800">{product.name_he}</p>
                        <p className="text-xs text-slate-400">{product.per100_kcal} קל׳ / 100ג׳ · {product.category}</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Meal items */}
            <div className="bg-slate-50 rounded-xl border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-800">{analysis.meal_name}</h3>
                <Button variant="ghost" size="sm" onClick={() => setStep('edit')} className="text-blue-600 gap-1 text-xs">
                  <Edit2 className="w-3 h-3" /> ערוך
                </Button>
              </div>

              <div className="space-y-2">
                {editedItems.map((item, index) => (
                  <div key={index} className="bg-white border rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between px-3 py-2.5 text-right"
                      onClick={() => toggleItemExpand(index)}
                    >
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-800">{item.name}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{item.grams}ג׳</span>
                        {item.nutrition_source === 'local_database' && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full">✓ מאגר</span>
                        )}
                        {item.nutrition_source === 'ai_enriched' && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">✦ AI</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold" style={{ color: '#79DBD6' }}>{item.calories} קל׳</span>
                        {expandedItems[index] ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </button>
                    {!expandedItems[index] && (
                      <div className="px-3 pb-2 flex justify-start">
                        <button
                          type="button"
                          onClick={() => {
                            setCorrectingItem(index);
                            setCorrectionSearch('');
                            setExpandedItems(prev => ({ ...prev, [index]: true }));
                          }}
                          className="min-h-0 min-w-0 h-7 px-3 rounded-full border border-blue-200 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 transition-all flex items-center gap-1.5"
                        >
                          <Sparkles className="w-3 h-3" />
                          תקן עם AI
                        </button>
                      </div>
                    )}
                    {expandedItems[index] && (
                      <div className="px-3 pb-3 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-blue-50 rounded-lg p-2">
                            <div className="font-bold text-blue-700">{item.protein}ג׳</div>
                            <div className="text-slate-500">חלבון</div>
                          </div>
                          <div className="bg-amber-50 rounded-lg p-2">
                            <div className="font-bold text-amber-700">{item.carbs}ג׳</div>
                            <div className="text-slate-500">פחמימות</div>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-2">
                            <div className="font-bold text-purple-700">{item.fat}ג׳</div>
                            <div className="text-slate-500">שומן</div>
                          </div>
                        </div>
                        {/* Correct item button */}
                        {correctingItem !== index ? (
                          <button
                            onClick={() => { setCorrectingItem(index); setCorrectionSearch(''); }}
                            className="w-full py-1.5 text-xs text-orange-600 hover:text-orange-700 border border-orange-200 rounded-lg bg-orange-50 hover:bg-orange-100 transition-all flex items-center justify-center gap-1.5"
                          >
                            <Edit2 className="w-3 h-3" />
                            תקן מוצר שגוי
                          </button>
                        ) : (
                          <div className="space-y-2 border border-orange-200 rounded-lg p-2 bg-orange-50">
                            <p className="text-xs font-semibold text-orange-700">מה המוצר הנכון?</p>
                            <div className="flex gap-1.5">
                              <Input
                                autoFocus
                                value={correctionSearch}
                                onChange={e => setCorrectionSearch(e.target.value)}
                                placeholder="הקלד שם מוצר..."
                                className="flex-1 h-8 text-sm"
                                onKeyDown={e => e.key === 'Enter' && correctionSearch.trim() && handleCorrectItemByText(index, correctionSearch)}
                              />
                              <Button
                                size="sm"
                                onClick={() => handleCorrectItemByText(index, correctionSearch)}
                                disabled={!correctionSearch.trim() || correctionLoading}
                                className="h-8 px-2 text-xs gap-1"
                                style={{ backgroundColor: '#79DBD6' }}
                              >
                                {correctionLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                                חשב
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setCorrectingItem(null)} className="h-8 px-2">
                                <X className="w-3 h-3" />
                              </Button>
                            </div>
                            {/* DB suggestions */}
                            {correctionSearch.length > 1 && (
                              <div className="max-h-32 overflow-y-auto space-y-1">
                                {allFoodItems.filter(f => f.name_he.toLowerCase().includes(correctionSearch.toLowerCase())).slice(0, 5).map(product => (
                                  <button
                                    key={product.id}
                                    onClick={() => handleCorrectItem(index, product)}
                                    className="w-full text-right p-1.5 rounded-lg hover:bg-white border border-orange-100 bg-white/60 transition-colors text-xs"
                                  >
                                    <span className="font-medium text-slate-800">{product.name_he}</span>
                                    <span className="text-slate-400 mr-2">{product.per100_kcal} קל׳/100ג׳</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals */}
              <div className="pt-3 border-t grid grid-cols-4 gap-2 text-center">
                <div>
                  <div className="text-2xl font-bold" style={{ color: '#79DBD6' }}>{Math.round(totals.calories)}</div>
                  <div className="text-xs text-slate-500">קלוריות</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-blue-600">{Math.round(totals.protein)}ג׳</div>
                  <div className="text-xs text-slate-500">חלבון</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-amber-600">{Math.round(totals.carbs)}ג׳</div>
                  <div className="text-xs text-slate-500">פחמימות</div>
                </div>
                <div>
                  <div className="text-xl font-bold text-purple-600">{Math.round(totals.fat)}ג׳</div>
                  <div className="text-xs text-slate-500">שומן</div>
                </div>
              </div>
            </div>

            <Button onClick={handleSaveMeal} className="w-full h-12 text-base font-semibold rounded-xl gap-2" style={{ backgroundColor: '#79DBD6' }}>
              <Check className="w-5 h-5" />
              שמור ארוחה
            </Button>
          </div>
        )}

        {/* ─── EDIT ─── */}
        {step === 'edit' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">ערוך רכיבים</h3>
              <Button variant="ghost" size="sm" onClick={() => setStep('review')} className="text-slate-500 text-xs gap-1">
                <X className="w-3 h-3" /> סגור
              </Button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {editedItems.map((item, index) => (
                <div key={index} className="bg-slate-50 rounded-xl p-3 space-y-2 border">
                  <div className="flex items-center gap-2">
                    <Input
                      type="text"
                      value={item.name}
                      onChange={e => { const u = [...editedItems]; u[index].name = e.target.value; u[index]._corrected = true; setEditedItems(u); }}
                      placeholder="שם רכיב"
                      className="flex-1 h-8 text-sm font-medium"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeItem(index)} className="h-8 w-8 text-red-400 hover:text-red-600">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['grams','גרם'],['calories','קלוריות'],['protein','חלבון (ג׳)'],['carbs','פחמימות (ג׳)'],['fat','שומן (ג׳)']].map(([field, lbl]) => (
                      <div key={field}>
                        <Label className="text-xs text-slate-500">{lbl}</Label>
                        <Input
                          type="number"
                          step={field === 'grams' || field === 'calories' ? '1' : '0.1'}
                          value={item[field]}
                          onChange={e => handleEditItem(index, field, e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Button onClick={addItem} variant="outline" className="w-full rounded-xl gap-2">
              <Plus className="w-4 h-4" /> הוסף רכיב
            </Button>
            <div className="p-4 bg-slate-800 text-white rounded-xl grid grid-cols-4 gap-2 text-center">
              {[
                { val: Math.round(totals.calories), lbl: 'קלוריות' },
                { val: `${Math.round(totals.protein)}ג׳`, lbl: 'חלבון' },
                { val: `${Math.round(totals.carbs)}ג׳`, lbl: 'פחמימות' },
                { val: `${Math.round(totals.fat)}ג׳`, lbl: 'שומן' },
              ].map(({ val, lbl }) => (
                <div key={lbl}>
                  <p className="text-xl font-bold">{val}</p>
                  <p className="text-xs opacity-70">{lbl}</p>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setStep('review')} variant="outline" className="flex-1 rounded-xl">חזור לסיכום</Button>
              <Button onClick={handleSaveMeal} className="flex-1 rounded-xl gap-2" style={{ backgroundColor: '#79DBD6' }}>
                <Check className="w-4 h-4" /> שמור
              </Button>
            </div>
          </div>
        )}

        {/* ─── SAVING ─── */}
        {step === 'saving' && (
          <div className="flex flex-col items-center justify-center py-16 space-y-4">
            <Loader2 className="w-12 h-12 animate-spin" style={{ color: '#79DBD6' }} />
            <p className="text-lg font-semibold text-slate-700">שומר את הארוחה...</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}