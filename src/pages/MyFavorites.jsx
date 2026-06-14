import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Star, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

const MEAL_TYPE_OPTIONS = [
  { value: 'all', label: 'כל הארוחות' },
  { value: 'any', label: 'כללי' },
  { value: 'breakfast', label: 'בוקר' },
  { value: 'lunch', label: 'צהריים' },
  { value: 'dinner', label: 'ערב' },
  { value: 'snack', label: 'חטיף' }
];

export default function MyFavorites() {
  const [searchTerm, setSearchTerm] = useState('');
  const [mealTypeFilter, setMealTypeFilter] = useState('all');
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      if (!user?.email) return null;
      const trainees = await base44.entities.Trainee.filter({ user_email: user.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email
  });

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['traineeFavorites', trainee?.id],
    queryFn: () => {
      if (!trainee?.id) return [];
      return base44.entities.TraineeFavoriteFood.filter({ trainee_id: trainee.id });
    },
    enabled: !!trainee?.id
  });

  const { data: allFoods = [] } = useQuery({
    queryKey: ['allFoods'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: favorites.length > 0
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: (favoriteId) => base44.entities.TraineeFavoriteFood.delete(favoriteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeFavorites'] });
      toast.success('הוסר מהמועדפים');
    },
    onError: () => {
      toast.error('שגיאה בהסרה');
    }
  });

  const favoritesWithFoods = useMemo(() => {
    if (!favorites || !allFoods) return [];
    
    return favorites.map(fav => {
      const food = allFoods.find(f => f.id === fav.food_item_id);
      return { ...fav, food };
    }).filter(fav => fav.food); // Remove favorites with missing foods
  }, [favorites, allFoods]);

  const filteredFavorites = useMemo(() => {
    return favoritesWithFoods.filter(fav => {
      const matchesSearch = !searchTerm || 
        fav.food?.name_he?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        fav.food?.brand?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesMealType = mealTypeFilter === 'all' || fav.meal_type === mealTypeFilter;
      
      return matchesSearch && matchesMealType;
    });
  }, [favoritesWithFoods, searchTerm, mealTypeFilter]);

  if (!user || !trainee) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">טוען...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Star className="w-8 h-8 text-amber-500 fill-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">המועדפים שלי</h1>
            <p className="text-sm text-slate-600">{favorites.length} מוצרים מועדפים</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>חיפוש</Label>
                <div className="relative">
                  <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="שם מוצר או מותג..."
                    className="pr-10"
                  />
                </div>
              </div>
              <div>
                <Label>סוג ארוחה</Label>
                <Select value={mealTypeFilter} onValueChange={setMealTypeFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MEAL_TYPE_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Favorites List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-8 h-8 border-4 border-slate-200 border-t-amber-600 rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-sm text-slate-600">טוען מועדפים...</p>
          </div>
        ) : filteredFavorites.length === 0 ? (
          <Card className="p-8 text-center">
            <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-600 mb-2">אין מועדפים להצגה</p>
            <p className="text-sm text-slate-500">הוסף מוצרים למועדפים בעת חיפוש מזון</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredFavorites.map(fav => (
              <Card key={fav.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Star className="w-5 h-5 text-amber-400 fill-amber-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-slate-800">{fav.food?.name_he}</h3>
                      {fav.food?.brand && (
                        <p className="text-xs text-slate-500">{fav.food.brand}</p>
                      )}
                      <div className="flex gap-2 mt-2 text-xs text-slate-600">
                        <span>{fav.food?.per100_kcal} קק"ל</span>
                        <span>•</span>
                        <span>{fav.food?.per100_protein}ג׳ חלבון</span>
                      </div>
                      <div className="mt-2">
                        <Badge variant="secondary" className="text-xs">
                          {MEAL_TYPE_OPTIONS.find(m => m.value === fav.meal_type)?.label}
                        </Badge>
                      </div>
                    </div>
                    <Button
                      onClick={() => removeFavoriteMutation.mutate(fav.id)}
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
    </div>
  );
}