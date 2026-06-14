import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from '@/api/base44Client';
import { Loader2, Sparkles, CheckCircle, AlertTriangle, Brain, Zap, Upload, Camera, X } from "lucide-react";

const MEAL_TYPES = [
  { value: 'breakfast', label: 'ארוחת בוקר' },
  { value: 'lunch', label: 'ארוחת צהריים' },
  { value: 'dinner', label: 'ארוחת ערב' },
  { value: 'snack', label: 'חטיף' },
];

// trainee prop is optional — used for target context in AI analysis
export default function AddMealWithAIImage({ open, onClose, onSave, traineeEmail, trainee }) {
  const [step, setStep] = useState('input'); // 'input' | 'analyzing' | 'review'
  const [freeText, setFreeText] = useState('');
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [mealType, setMealType] = useState('breakfast');
  const [analyzedItems, setAnalyzedItems] = useState([]);
  const [mealName, setMealName] = useState('');
  const [error, setError] = useState(null);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleImageSelect = (file) => {
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
      setError('אנא בחר קובץ תמונה');
      return;
    }

    setSelectedImage(file);
    
    const reader = new FileReader();
    reader.onload = (e) => {
      setImagePreview(e.target.result);
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  };

  const handleCameraCapture = (e) => {
    const file = e.target.files?.[0];
    if (file) handleImageSelect(file);
  };

  const removeImage = () => {
    setSelectedImage(null);
    setImagePreview(null);
  };

  const handleAnalyze = async () => {
    if (!selectedImage && !freeText.trim()) {
      setError('אנא העלה תמונה או תאר את הארוחה');
      return;
    }
    if (!traineeEmail) {
      setError('אין מידע על המשתמש. נסה להתחבר מחדש.');
      return;
    }

    setStep('analyzing');
    setError(null);

    try {
      let fileUrl = null;
      
      // Upload image if selected
      if (selectedImage) {
        const uploadResponse = await base44.integrations.Core.UploadFile({
          file: selectedImage
        });
        fileUrl = uploadResponse.file_url;
      }

      // Call analyze function with image or text
      const response = await base44.functions.invoke('analyzeAndEnrichMealPhoto', {
        meal_text: freeText || '',
        image_url: fileUrl,
        nutrition_targets: trainee ? {
          daily_calories: trainee.target_calories,
          daily_protein_g: trainee.target_protein,
          daily_carbs_g: trainee.target_carbs,
          daily_fat_g: trainee.target_fat,
        } : null
      });

      const result = response.data;

      if (!result.items || result.items.length === 0) {
        setError('לא זוהו מאכלים. נסה להעלות תמונה ברורה יותר או תאר בפירוט');
        setStep('input');
        return;
      }

      setMealName(result.meal_name || freeText);
      setAnalyzedItems(result.items.map(item => ({ ...item, grams: item.grams || 100 })));
      setStep('review');
    } catch (err) {
      console.error('[AddMealWithAIImage] Error:', err);
      setError(`שגיאה בניתוח: ${err?.message || 'שגיאה לא ידועה'}`);
      setStep('input');
    }
  };

  const handleUpdateItem = (index, field, value) => {
    const updated = [...analyzedItems];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'grams') {
      const item = updated[index];
      const g = parseFloat(value) || 0;
      updated[index].calories = Math.round((item.per100_kcal / 100) * g);
      updated[index].protein = Math.round(((item.per100_protein / 100) * g) * 10) / 10;
      updated[index].carbs = Math.round(((item.per100_carbs / 100) * g) * 10) / 10;
      updated[index].fat = Math.round(((item.per100_fat / 100) * g) * 10) / 10;
    }
    setAnalyzedItems(updated);
  };

  const handleRemoveItem = (index) => {
    setAnalyzedItems(analyzedItems.filter((_, i) => i !== index));
  };

  const calculateTotals = () => {
    return analyzedItems.reduce((acc, item) => ({
      calories: acc.calories + (item.calories || 0),
      protein: acc.protein + (item.protein || 0),
      carbs: acc.carbs + (item.carbs || 0),
      fat: acc.fat + (item.fat || 0),
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  };

  const handleSave = async () => {
    if (!traineeEmail) {
      setError('אין מידע על המשתמש.');
      return;
    }
    const totals = calculateTotals();
    if (!totals.calories) {
      setError('לא ניתן לשמור ארוחה עם 0 קלוריות.');
      return;
    }
    try {
      await onSave({
        trainee_email: traineeEmail,
        date: new Date().toISOString().split('T')[0],
        meal_type: mealType,
        food_name: mealName || analyzedItems.map(i => i.name).join(' + '),
        quantity: 1, unit: 'unit',
        calories: Math.round(totals.calories),
        protein: Math.round(totals.protein * 10) / 10,
        carbs: Math.round(totals.carbs * 10) / 10,
        fat: Math.round(totals.fat * 10) / 10,
      });
      resetForm(); onClose();
    } catch (err) {
      setError('שגיאה בשמירה. נסה שוב.');
    }
  };

  const resetForm = () => {
    setStep('input');
    setFreeText('');
    setSelectedImage(null);
    setImagePreview(null);
    setAnalyzedItems([]);
    setMealName('');
    setError(null);
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) { resetForm(); onClose(); } }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Sparkles className="w-6 h-6 text-purple-500" />
            ניתוח ארוחה עם AI
          </DialogTitle>
        </DialogHeader>

        {/* STEP: INPUT */}
        {step === 'input' && (
          <div className="space-y-4">
            <div>
              <Label>סוג ארוחה</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Image Upload */}
            <div className="border-2 border-dashed border-purple-300 rounded-lg p-4">
              <div className="space-y-3">
                <Label className="font-semibold">העלה תמונה או תאר</Label>
                
                {imagePreview ? (
                  <div className="relative">
                    <img src={imagePreview} alt="preview" className="w-full rounded-lg max-h-48 object-cover" />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={removeImage}
                      className="absolute top-2 right-2"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      גלריה
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex-1 gap-2"
                    >
                      <Camera className="w-4 h-4" />
                      מצלמה
                    </Button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                />
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handleCameraCapture}
                  className="hidden"
                />
              </div>
            </div>

            {/* Text Input */}
            <div>
              <Label>או תאר בטקסט</Label>
              <Textarea
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                placeholder='לדוגמה: "באגט עם 2 שניצל מטוגן כף חומוס וכרוב"'
                rows={3}
                className="text-base"
              />
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg flex items-start gap-2">
              <Brain className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-purple-700">
                <strong>GPT-4o + Claude Sonnet</strong> — ניתוח מדויק לפי USDA והתאמה למאגר המקומי
              </p>
            </div>

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Button
              onClick={handleAnalyze}
              disabled={!freeText.trim() && !selectedImage}
              className="w-full bg-purple-500 hover:bg-purple-600"
            >
              <Zap className="w-4 h-4 ml-2" />
              נתח עם AI מתקדם
            </Button>
          </div>
        )}

        {/* STEP: ANALYZING */}
        {step === 'analyzing' && (
          <div className="py-12 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-purple-500 mx-auto" />
            <p className="text-slate-700 font-medium">מנתח ארוחה...</p>
            <div className="text-xs text-slate-400 space-y-1">
              <p>🔍 GPT-4o מזהה רכיבים וכמויות</p>
              <p>🧪 Claude Sonnet מחשב ערכים תזונתיים לפי USDA</p>
              <p>📦 מתאים למאגר מזון מקומי</p>
            </div>
          </div>
        )}

        {/* STEP: REVIEW */}
        {step === 'review' && analyzedItems.length > 0 && (
          <div className="space-y-4">
            <div>
              <Label>סוג ארוחה</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg">
              <p className="text-xs font-medium text-purple-800">✨ {mealName}</p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto">
              <h4 className="text-sm font-medium text-slate-700">רכיבי הארוחה — ערכים ל-100 גרם</h4>
              {analyzedItems.map((item, index) => (
                <div key={index} className="p-3 border rounded-lg bg-white">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm text-slate-800">{item.name}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveItem(index)}
                      className="text-red-500 h-6 w-6 p-0"
                    >
                      ✕
                    </Button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={item.grams}
                      onChange={(e) => handleUpdateItem(index, 'grams', parseFloat(e.target.value) || 0)}
                      className="h-7 w-20 text-sm"
                      placeholder="100"
                    />
                    <span className="text-xs text-slate-500">גרם (= פי {(item.grams / 100).toFixed(1)})</span>
                    <span className="text-xs text-slate-600 mr-auto">
                      {item.calories} קל׳ | ח:{item.protein} פ:{item.carbs} ש:{item.fat}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            {(() => {
              const totals = calculateTotals();
              return (
                <div className="p-4 bg-slate-800 text-white rounded-xl">
                  <p className="text-sm font-medium mb-2">סה״כ:</p>
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div><p className="text-2xl font-bold">{Math.round(totals.calories)}</p><p className="text-xs opacity-80">קלוריות</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.protein * 10) / 10}</p><p className="text-xs opacity-80">חלבון</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.carbs * 10) / 10}</p><p className="text-xs opacity-80">פחמימות</p></div>
                    <div><p className="text-xl font-bold">{Math.round(totals.fat * 10) / 10}</p><p className="text-xs opacity-80">שומן</p></div>
                  </div>
                </div>
              );
            })()}

            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep('input')} className="flex-1">← ערוך</Button>
              <Button onClick={handleSave} className="flex-1 bg-emerald-500 hover:bg-emerald-600">
                <CheckCircle className="w-4 h-4 ml-1" />
                שמור ארוחה
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}