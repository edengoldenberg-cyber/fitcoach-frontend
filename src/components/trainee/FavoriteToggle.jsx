import React, { useState } from 'react';
import { Star } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const MEAL_TYPE_OPTIONS = [
  { value: 'any', label: 'כללי (כל ארוחה)' },
  { value: 'breakfast', label: 'בוקר' },
  { value: 'lunch', label: 'צהריים' },
  { value: 'dinner', label: 'ערב' },
  { value: 'snack', label: 'חטיף' }
];

export default function FavoriteToggle({ foodId, traineeId, currentMealType = null }) {
  const [showDialog, setShowDialog] = useState(false);
  const [selectedMealType, setSelectedMealType] = useState('any');
  const queryClient = useQueryClient();

  const { data: favorites = [], isLoading } = useQuery({
    queryKey: ['traineeFavorites', traineeId],
    queryFn: () => {
      if (!traineeId) return [];
      return base44.entities.TraineeFavoriteFood.filter({ trainee_id: traineeId });
    },
    enabled: !!traineeId
  });

  const addFavoriteMutation = useMutation({
    mutationFn: ({ trainee_id, food_item_id, meal_type }) => 
      base44.entities.TraineeFavoriteFood.create({
        trainee_id,
        food_item_id,
        meal_type
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeFavorites'] });
      toast.success('נוסף למועדפים ✨');
      setShowDialog(false);
    },
    onError: (err) => {
      console.error('Error adding favorite:', err);
      toast.error('שגיאה בהוספה למועדפים');
    }
  });

  const removeFavoriteMutation = useMutation({
    mutationFn: (favoriteId) => 
      base44.entities.TraineeFavoriteFood.delete(favoriteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeFavorites'] });
      toast.success('הוסר מהמועדפים');
    },
    onError: (err) => {
      console.error('Error removing favorite:', err);
      toast.error('שגיאה בהסרה מהמועדפים');
    }
  });

  if (!traineeId) {
    return (
      <Button variant="ghost" size="icon" disabled className="flex-shrink-0">
        <Star className="w-4 h-4 text-slate-300" />
      </Button>
    );
  }

  if (isLoading) {
    return (
      <Button variant="ghost" size="icon" disabled className="flex-shrink-0">
        <Star className="w-4 h-4 text-slate-400" />
      </Button>
    );
  }

  const existingFavorite = favorites.find(
    f => f.food_item_id === foodId && (f.meal_type === currentMealType || f.meal_type === 'any')
  );

  const isFavorite = !!existingFavorite;

  const handleClick = () => {
    if (isFavorite) {
      removeFavoriteMutation.mutate(existingFavorite.id);
    } else {
      if (currentMealType) {
        addFavoriteMutation.mutate({
          trainee_id: traineeId,
          food_item_id: foodId,
          meal_type: currentMealType
        });
      } else {
        setShowDialog(true);
      }
    }
  };

  const handleAddWithMealType = () => {
    addFavoriteMutation.mutate({
      trainee_id: traineeId,
      food_item_id: foodId,
      meal_type: selectedMealType
    });
  };

  return (
    <>
      <Button 
        variant="ghost" 
        size="icon" 
        onClick={handleClick}
        className="flex-shrink-0"
      >
        <Star 
          className={`w-4 h-4 ${isFavorite ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`}
        />
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>בחר סוג ארוחה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-slate-600">לאיזו ארוחה להוסיף את המוצר למועדפים?</p>
            <div className="space-y-2">
              {MEAL_TYPE_OPTIONS.map(option => (
                <label key={option.value} className="flex items-center gap-2 cursor-pointer p-2 rounded hover:bg-slate-50">
                  <input
                    type="radio"
                    name="meal_type"
                    value={option.value}
                    checked={selectedMealType === option.value}
                    onChange={(e) => setSelectedMealType(e.target.value)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm">{option.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleAddWithMealType} className="flex-1" style={{ backgroundColor: '#79DBD6' }}>
                הוסף למועדפים
              </Button>
              <Button onClick={() => setShowDialog(false)} variant="outline" className="flex-1">
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}