import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Star, Search, Plus, Trash2, Filter, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { logEvent, logError } from '../components/shared/diagnostics/logger';

const MEAL_TYPES = [
  { value: 'any', label: 'כל הארוחות', icon: '🍽️' },
  { value: 'breakfast', label: 'בוקר', icon: '🌅' },
  { value: 'lunch', label: 'צהריים', icon: '☀️' },
  { value: 'dinner', label: 'ערב', icon: '🌙' },
  { value: 'snack', label: 'חטיף', icon: '🍎' }
];

const GOAL_TYPES = [
  { value: 'any', label: 'כל המטרות', icon: '⚖️' },
  { value: 'balanced', label: 'מאוזן', icon: '🎯' },
  { value: 'fat_loss', label: 'הפחתת משקל', icon: '📉' },
  { value: 'muscle_gain', label: 'גידול שריר', icon: '💪' }
];

export default function CoachRecommendedFoods() {
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showPasteDialog, setShowPasteDialog] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pasteResult, setPasteResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMealType, setFilterMealType] = useState('all');
  const [filterGoalType, setFilterGoalType] = useState('all');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: recommendations = [] } = useQuery({
    queryKey: ['coachRecommendedFoods', user?.email],
    queryFn: () => base44.entities.CoachRecommendedFood.filter({ coach_email: user?.email }),
    enabled: !!user?.email
  });

  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const deleteRecommendationMutation = useMutation({
    mutationFn: (id) => base44.entities.CoachRecommendedFood.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachRecommendedFoods'] });
      toast.success('המלצה נמחקה');
    }
  });

  const deleteAllMutation = useMutation({
    mutationFn: async () => {
      const toDelete = recommendations.filter(r => r.coach_email === user?.email);
      await Promise.all(toDelete.map(r => base44.entities.CoachRecommendedFood.delete(r.id)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachRecommendedFoods'] });
      toast.success('כל ההמלצות נמחקו');
    }
  });

  const handleDeleteAll = () => {
    if (window.confirm(`למחוק את כל ${recommendations.length} ההמלצות?`)) {
      deleteAllMutation.mutate();
    }
  };

  const handlePasteImport = async () => {
    if (!pasteText.trim()) {
      toast.error('אנא הדבק רשימת מוצרים');
      return;
    }

    const lines = pasteText.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0);

    const unique = [...new Set(lines)];
    
    logEvent('COACH_REC_IMPORT_START', {
      lines: unique.length
    });
    
    const results = {
      added: [],
      alreadyExisted: [],
      notFound: [],
      ambiguous: []
    };

    const existingFoodIds = new Set(recommendations.map(r => r.food_item_id));
    
    logEvent('COACH_REC_IMPORT_NORMALIZED', {
      sample: unique.slice(0, 10)
    });

    for (const line of unique) {
      // Format: "שם מוצר | id" או "שם מוצר"
      const parts = line.split('|').map(p => p.trim());
      const nameOrId = parts[0];
      const explicitId = parts[1];

      let matchedFood = null;

      // Try explicit ID first
      if (explicitId) {
        matchedFood = allFoods.find(f => f.id === explicitId);
      }

      // Try exact ID match if looks like ID
      if (!matchedFood && /^[a-zA-Z0-9-]{20,}$/.test(nameOrId)) {
        matchedFood = allFoods.find(f => f.id === nameOrId);
      }

      // Fuzzy name matching
      if (!matchedFood) {
        const searchName = nameOrId.toLowerCase();
        
        // Exact name match
        const exactMatches = allFoods.filter(f => 
          f.name_he?.toLowerCase() === searchName
        );

        if (exactMatches.length === 1) {
          matchedFood = exactMatches[0];
        } else if (exactMatches.length > 1) {
          results.ambiguous.push({ 
            input: nameOrId, 
            matches: exactMatches.map(f => ({ id: f.id, name: f.name_he }))
          });
          continue;
        }

        // Contains match
        if (!matchedFood) {
          const containsMatches = allFoods.filter(f => 
            f.name_he?.toLowerCase().includes(searchName)
          );

          if (containsMatches.length === 1) {
            matchedFood = containsMatches[0];
          } else if (containsMatches.length > 1) {
            // Pick the shortest name (most likely exact match)
            matchedFood = containsMatches.sort((a, b) => 
              (a.name_he?.length || 999) - (b.name_he?.length || 999)
            )[0];
          }
        }
      }

      if (!matchedFood) {
        results.notFound.push(nameOrId);
        continue;
      }

      if (existingFoodIds.has(matchedFood.id)) {
        results.alreadyExisted.push(matchedFood.name_he);
        continue;
      }

      // Create recommendation
      try {
        await base44.entities.CoachRecommendedFood.create({
          coach_email: user.email,
          food_item_id: matchedFood.id,
          meal_type: 'any',
          goal_type: 'any',
          is_active: true
        });
        results.added.push(matchedFood.name_he);
        existingFoodIds.add(matchedFood.id);
      } catch (err) {
        console.error('Error creating recommendation:', err);
        logError('COACH_REC_IMPORT_ERROR', err, { nameOrId });
        results.notFound.push(`${nameOrId} (שגיאה)`);
      }
    }

    logEvent('COACH_REC_IMPORT_MATCH', {
      matchedCount: results.added.length,
      notFoundCount: results.notFound.length,
      ambiguousCount: results.ambiguous.length
    });

    logEvent('COACH_REC_IMPORT_SAVE', {
      savedCount: results.added.length
    });

    setPasteResult(results);
    queryClient.invalidateQueries({ queryKey: ['coachRecommendedFoods'] });

    // Summary toast
    const totalProcessed = results.added.length + results.alreadyExisted.length + results.notFound.length;
    toast.success(
      <div>
        <div className="font-bold mb-1">ייבוא הושלם</div>
        <div className="text-xs space-y-0.5">
          <div>✅ נוספו: {results.added.length}</div>
          <div>ℹ️ כבר קיימים: {results.alreadyExisted.length}</div>
          <div>⚠️ לא נמצאו: {results.notFound.length}</div>
        </div>
      </div>
    );
  };

  const recommendationsWithFoods = useMemo(() => {
    return recommendations.map(rec => {
      const food = allFoods.find(f => f.id === rec.food_item_id);
      return { ...rec, food, isInvalid: !food };
    });
  }, [recommendations, allFoods]);

  const stats = useMemo(() => {
    const active = recommendationsWithFoods.filter(r => r.is_active !== false && r.food).length;
    const invalid = recommendationsWithFoods.filter(r => !r.food).length;
    const lastUpdate = recommendations.length > 0 
      ? recommendations.reduce((latest, rec) => {
          const date = new Date(rec.updated_date || rec.created_date);
          return date > latest ? date : latest;
        }, new Date(0))
      : null;
    
    return { total: recommendations.length, active, invalid, lastUpdate };
  }, [recommendationsWithFoods, recommendations]);

  const categoryBreakdown = useMemo(() => {
    const categories = {
      'חלבון': 0,
      'פחמימה': 0,
      'שומן': 0,
      'מוצרי חלב': 0,
      'ירקות': 0,
      'פירות': 0,
      'מתוקים': 0
    };

    recommendationsWithFoods.filter(r => r.food).forEach(rec => {
      const cat = rec.food.category;
      if (cat === 'חלבון') categories['חלבון']++;
      else if (cat === 'פחמימה') categories['פחמימה']++;
      else if (cat === 'שומן') categories['שומן']++;
      else if (cat === 'חלב ומוצריו') categories['מוצרי חלב']++;
      else if (cat === 'ירקות') categories['ירקות']++;
      else if (cat === 'פירות') categories['פירות']++;
      else if (cat === 'מתוקים') categories['מתוקים']++;
    });

    return categories;
  }, [recommendationsWithFoods]);

  const filteredRecommendations = useMemo(() => {
    return recommendationsWithFoods.filter(rec => {
      if (!rec.food) return false;
      
      const matchesSearch = !searchTerm || 
        rec.food?.name_he?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMeal = filterMealType === 'all' || rec.meal_type === filterMealType;
      const matchesGoal = filterGoalType === 'all' || rec.goal_type === filterGoalType;
      
      return matchesSearch && matchesMeal && matchesGoal;
    });
  }, [recommendationsWithFoods, searchTerm, filterMealType, filterGoalType]);

  if (!user) {
    return <div className="p-8 text-center">טוען...</div>;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Star className="w-8 h-8 text-purple-600 fill-purple-500" />
            <div>
              <h1 className="text-2xl font-bold text-slate-800">מוצרים מומלצים</h1>
              <p className="text-sm text-slate-600">{recommendations.length} המלצות</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => setShowPasteDialog(true)} variant="outline" className="gap-2">
              📋 הדבק רשימה
            </Button>
            {recommendations.length > 0 && (
              <Button onClick={handleDeleteAll} variant="outline" className="gap-2 text-red-600 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
                נקה הכל
              </Button>
            )}
            <Button onClick={() => setShowAddDialog(true)} className="gap-2" style={{ backgroundColor: '#8B5CF6' }}>
              <Plus className="w-4 h-4" />
              הוסף
            </Button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Card className="p-4">
            <div className="text-2xl font-bold text-purple-600">{stats.total}</div>
            <div className="text-xs text-slate-600">סה״כ מוצרים</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-green-600">{stats.active}</div>
            <div className="text-xs text-slate-600">פעילים</div>
          </Card>
          <Card className="p-4">
            <div className="text-2xl font-bold text-red-600">{stats.invalid}</div>
            <div className="text-xs text-slate-600">לא תקינים</div>
          </Card>
          <Card className="p-4">
            <div className="text-xs text-slate-600 mb-1">עדכון אחרון</div>
            <div className="text-sm font-medium text-slate-800">
              {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString('he-IL') : '—'}
            </div>
          </Card>
        </div>

        {/* Category Breakdown */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">פילוח לפי קטגוריות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
              {Object.entries(categoryBreakdown).map(([category, count]) => (
                <div key={category} className="bg-purple-50 rounded-lg p-3 text-center border border-purple-100">
                  <div className="text-2xl font-bold text-purple-600">{count}</div>
                  <div className="text-xs text-slate-600 mt-1">{category}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label>חיפוש</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="שם מוצר..."
                    className="pr-10"
                  />
                </div>
              </div>
              <div>
                <Label>סוג ארוחה</Label>
                <Select value={filterMealType} onValueChange={setFilterMealType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {MEAL_TYPES.map(m => (
                      <SelectItem key={m.value} value={m.value}>{m.icon} {m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>מטרה</Label>
                <Select value={filterGoalType} onValueChange={setFilterGoalType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">הכל</SelectItem>
                    {GOAL_TYPES.map(g => (
                      <SelectItem key={g.value} value={g.value}>{g.icon} {g.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* List */}
        {filteredRecommendations.length === 0 ? (
          <Card className="p-8 text-center">
            <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-2">אין המלצות להצגה</p>
            <Button onClick={() => setShowAddDialog(true)} variant="outline">
              <Plus className="w-4 h-4 mr-2" />
              הוסף המלצה ראשונה
            </Button>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredRecommendations.map(rec => (
              <Card key={rec.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Star className="w-5 h-5 text-purple-500 fill-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800">{rec.food?.name_he}</h3>
                      {rec.food?.brand && (
                        <p className="text-xs text-slate-500">{rec.food.brand}</p>
                      )}
                      <div className="flex gap-2 mt-2 text-xs text-slate-600">
                        <span>{rec.food?.per100_kcal} קק"ל</span>
                        <span>•</span>
                        <span>{rec.food?.per100_protein}ג׳ חלבון</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {MEAL_TYPES.find(m => m.value === rec.meal_type)?.label || rec.meal_type}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {GOAL_TYPES.find(g => g.value === rec.goal_type)?.label || rec.goal_type}
                        </Badge>
                        {!rec.is_active && (
                          <Badge variant="destructive" className="text-xs">לא פעיל</Badge>
                        )}
                      </div>
                      {rec.notes && (
                        <p className="text-xs text-slate-500 mt-2">{rec.notes}</p>
                      )}
                    </div>
                    <Button
                      onClick={() => deleteRecommendationMutation.mutate(rec.id)}
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <AddRecommendationDialog 
        open={showAddDialog} 
        onClose={() => setShowAddDialog(false)} 
        coachEmail={user?.email}
      />

      {/* Paste Dialog */}
      <Dialog open={showPasteDialog} onOpenChange={(open) => {
        setShowPasteDialog(open);
        if (!open) {
          setPasteText('');
          setPasteResult(null);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>📋 הדבק רשימת מוצרים</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>הדבק רשימה (כל שורה = מוצר)</Label>
              <p className="text-xs text-slate-500 mb-2">
                פורמט נתמך: "שם מוצר" או "שם מוצר | id"
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="אורז לבן מבושל&#10;חזה עוף&#10;ביצה | abc123..."
                className="w-full h-64 p-3 border rounded-lg text-sm font-mono"
                dir="ltr"
              />
            </div>

            <div className="flex gap-2">
              <Button 
                onClick={handlePasteImport}
                disabled={!pasteText.trim()}
                className="flex-1"
                style={{ backgroundColor: '#8B5CF6' }}
              >
                ייבא מוצרים
              </Button>
              <Button 
                onClick={() => {
                  setShowPasteDialog(false);
                  setPasteText('');
                  setPasteResult(null);
                }}
                variant="outline"
              >
                ביטול
              </Button>
            </div>

            {pasteResult && (
              <div className="space-y-3 pt-4 border-t">
                <h3 className="font-semibold text-slate-800">תוצאות ייבוא:</h3>
                
                {pasteResult.added.length > 0 && (
                  <Card className="p-3 bg-green-50 border-green-200">
                    <p className="text-sm font-medium text-green-800 mb-1">
                      ✅ נוספו {pasteResult.added.length} מוצרים
                    </p>
                    <div className="text-xs text-green-700 max-h-32 overflow-y-auto">
                      {pasteResult.added.map((name, idx) => (
                        <div key={idx}>• {name}</div>
                      ))}
                    </div>
                  </Card>
                )}

                {pasteResult.alreadyExisted.length > 0 && (
                  <Card className="p-3 bg-blue-50 border-blue-200">
                    <p className="text-sm font-medium text-blue-800 mb-1">
                      ℹ️ כבר קיימים: {pasteResult.alreadyExisted.length}
                    </p>
                    <div className="text-xs text-blue-700 max-h-24 overflow-y-auto">
                      {pasteResult.alreadyExisted.map((name, idx) => (
                        <div key={idx}>• {name}</div>
                      ))}
                    </div>
                  </Card>
                )}

                {pasteResult.notFound.length > 0 && (
                  <Card className="p-3 bg-amber-50 border-amber-200">
                    <p className="text-sm font-medium text-amber-800 mb-1">
                      ⚠️ לא נמצאו במאגר: {pasteResult.notFound.length}
                    </p>
                    <div className="text-xs text-amber-700 max-h-24 overflow-y-auto">
                      {pasteResult.notFound.map((name, idx) => (
                        <div key={idx}>• {name}</div>
                      ))}
                    </div>
                  </Card>
                )}

                {pasteResult.ambiguous.length > 0 && (
                  <Card className="p-3 bg-orange-50 border-orange-200">
                    <p className="text-sm font-medium text-orange-800 mb-1">
                      🔀 התאמות לא ברורות: {pasteResult.ambiguous.length}
                    </p>
                    <div className="text-xs text-orange-700 max-h-24 overflow-y-auto">
                      {pasteResult.ambiguous.map((item, idx) => (
                        <div key={idx}>
                          • {item.input} → {item.matches.length} התאמות
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddRecommendationDialog({ open, onClose, coachEmail }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFood, setSelectedFood] = useState(null);
  const [mealType, setMealType] = useState('any');
  const [goalType, setGoalType] = useState('any');
  const [notes, setNotes] = useState('');
  const queryClient = useQueryClient();

  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: open
  });

  const { data: existingRecommendations = [] } = useQuery({
    queryKey: ['coachRecommendedFoods', coachEmail],
    queryFn: () => base44.entities.CoachRecommendedFood.filter({ coach_email: coachEmail }),
    enabled: open && !!coachEmail
  });

  const createRecommendationMutation = useMutation({
    mutationFn: (data) => base44.entities.CoachRecommendedFood.create(data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['coachRecommendedFoods'] });
      const food = allFoods.find(f => f.id === variables.food_item_id);
      toast.success(`✅ ${food?.name_he || 'מוצר'} נוסף להמלצות`);
      onClose();
      resetForm();
    }
  });

  const resetForm = () => {
    setSearchTerm('');
    setSelectedFood(null);
    setMealType('any');
    setGoalType('any');
    setNotes('');
  };

  const filteredFoods = useMemo(() => {
    if (!searchTerm) return [];
    return allFoods.filter(food => 
      food.name_he?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      food.brand?.toLowerCase().includes(searchTerm.toLowerCase())
    ).slice(0, 20);
  }, [allFoods, searchTerm]);

  const handleSubmit = () => {
    if (!selectedFood) {
      toast.error('בחר מוצר');
      return;
    }

    const alreadyExists = existingRecommendations.some(r => r.food_item_id === selectedFood.id);
    
    if (alreadyExists) {
      toast('ℹ️ המוצר כבר קיים ברשימת ההמלצות', { 
        style: { background: '#fef3c7', color: '#78350f' }
      });
      onClose();
      resetForm();
      return;
    }

    createRecommendationMutation.mutate({
      coach_email: coachEmail,
      food_item_id: selectedFood.id,
      meal_type: mealType,
      goal_type: goalType,
      is_active: true,
      notes
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוסף מוצר מומלץ</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Food Search */}
          <div>
            <Label>חפש מוצר</Label>
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="הקלד שם מוצר..."
            />
            {searchTerm && filteredFoods.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                {filteredFoods.map(food => (
                  <button
                    key={food.id}
                    onClick={() => {
                      setSelectedFood(food);
                      setSearchTerm('');
                    }}
                    className="w-full text-right p-2 rounded hover:bg-slate-100"
                  >
                    <p className="text-sm font-medium">{food.name_he}</p>
                    {food.brand && <p className="text-xs text-slate-500">{food.brand}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Selected Food */}
          {selectedFood && (
            <Card className="p-3 bg-purple-50 border-purple-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{selectedFood.name_he}</p>
                  {selectedFood.brand && <p className="text-xs text-slate-600">{selectedFood.brand}</p>}
                </div>
                <Button onClick={() => setSelectedFood(null)} variant="ghost" size="sm">
                  ✕
                </Button>
              </div>
            </Card>
          )}

          {/* Settings */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>סוג ארוחה</Label>
              <Select value={mealType} onValueChange={setMealType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.icon} {m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>מטרה</Label>
              <Select value={goalType} onValueChange={setGoalType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GOAL_TYPES.map(g => (
                    <SelectItem key={g.value} value={g.value}>{g.icon} {g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <Label>הערות (אופציונלי)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="למה מוצר זה מומלץ..."
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end">
            <Button onClick={onClose} variant="outline">ביטול</Button>
            <Button 
              onClick={handleSubmit} 
              disabled={!selectedFood}
              style={{ backgroundColor: '#8B5CF6' }}
            >
              הוסף המלצה
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}