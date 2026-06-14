import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Dumbbell } from 'lucide-react';

export default function ExercisePicker({ open, onClose, onSelect }) {
  const [search, setSearch] = useState('');

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exerciseLibrary'],
    queryFn: async () => {
      const ex = await base44.entities.Exercise.filter({ status: 'active' });
      return Array.isArray(ex) ? ex : [];
    },
  });

  const filteredExercises = exercises.filter(ex => {
    if (!search.trim()) return true;
    const searchLower = search.toLowerCase();
    return (
      ex?.name_he?.toLowerCase().includes(searchLower) ||
      ex?.muscle_group_primary?.toLowerCase().includes(searchLower) ||
      ex?.movement_pattern?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md max-h-[80vh] overflow-hidden flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Dumbbell className="w-5 h-5" />
            בחר תרגיל מהבנק
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
          <Input
            placeholder="חיפוש תרגיל..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
          />
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500"></div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2 py-2">
            {filteredExercises.length === 0 ? (
              <p className="text-center text-slate-500 py-8">
                לא נמצאו תרגילים
              </p>
            ) : (
              filteredExercises.map((exercise) => (
                <button
                  key={exercise.id}
                  onClick={() => {
                    onSelect(exercise);
                    onClose();
                  }}
                  className="w-full text-right p-3 rounded-lg border border-slate-200 hover:bg-orange-50 hover:border-orange-300 transition-colors"
                >
                  <div className="font-medium text-slate-800">
                    {exercise.name_he}
                  </div>
                  <div className="flex gap-2 mt-1 text-xs text-slate-500">
                    {exercise.muscle_group_primary && (
                      <span className="px-2 py-0.5 bg-slate-100 rounded">
                        {exercise.muscle_group_primary}
                      </span>
                    )}
                    {exercise.movement_pattern && (
                      <span className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded">
                        {exercise.movement_pattern}
                      </span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        )}

        <div className="border-t pt-3">
          <Button variant="outline" onClick={onClose} className="w-full">
            ביטול
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}