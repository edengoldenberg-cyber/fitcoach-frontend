import React from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, LayoutList } from 'lucide-react';

export default function SetBySetInput({ exercise, onUpdate }) {
  const [useDetailed, setUseDetailed] = React.useState(
    exercise.setsData && exercise.setsData.length > 0
  );

  React.useEffect(() => {
    if (useDetailed && (!exercise.setsData || exercise.setsData.length === 0)) {
      // Initialize with default sets
      const defaultSets = Array.from({ length: exercise.sets || 3 }, (_, i) => ({
        set: i + 1,
        reps: parseInt(exercise.reps) || 10,
        weight: exercise.weight || 0
      }));
      onUpdate('setsData', defaultSets);
    }
  }, [useDetailed]);

  const toggleDetailedMode = () => {
    if (!useDetailed) {
      // Switch to detailed
      const defaultSets = Array.from({ length: exercise.sets || 3 }, (_, i) => ({
        set: i + 1,
        reps: parseInt(exercise.reps) || 10,
        weight: exercise.weight || 0
      }));
      onUpdate('setsData', defaultSets);
    } else {
      // Switch to simple
      onUpdate('setsData', []);
    }
    setUseDetailed(!useDetailed);
  };

  const updateSet = (index, field, value) => {
    const updated = [...(exercise.setsData || [])];
    updated[index][field] = field === 'set' ? parseInt(value) : parseFloat(value) || 0;
    onUpdate('setsData', updated);
  };

  const addSet = () => {
    const currentSets = exercise.setsData || [];
    const newSet = {
      set: currentSets.length + 1,
      reps: parseInt(exercise.reps) || 10,
      weight: exercise.weight || 0
    };
    onUpdate('setsData', [...currentSets, newSet]);
    onUpdate('sets', currentSets.length + 1);
  };

  const removeSet = (index) => {
    const updated = (exercise.setsData || []).filter((_, i) => i !== index);
    // Re-number sets
    updated.forEach((s, i) => s.set = i + 1);
    onUpdate('setsData', updated);
    onUpdate('sets', updated.length);
  };

  if (!useDetailed) {
    return (
      <div>
        <div className="grid grid-cols-4 gap-2 mb-2">
          <Input
            type="number"
            placeholder="סטים"
            value={exercise.sets}
            onChange={(e) => onUpdate('sets', parseInt(e.target.value))}
            className="h-10"
          />
          <Input
            placeholder="חזרות"
            value={exercise.reps}
            onChange={(e) => onUpdate('reps', e.target.value)}
            className="h-10"
          />
          <Input
            type="number"
            placeholder="משקל"
            value={exercise.weight}
            onChange={(e) => onUpdate('weight', parseFloat(e.target.value))}
            className="h-10"
          />
          <Input
            type="number"
            placeholder="מנוחה"
            value={exercise.rest_seconds}
            onChange={(e) => onUpdate('rest_seconds', parseInt(e.target.value))}
            className="h-10"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={toggleDetailedMode}
          className="w-full h-9 text-xs"
        >
          <LayoutList className="w-3 h-3 ml-1" />
          עבור למילוי לפי סטים
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold text-slate-700">מילוי לפי סטים:</p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={toggleDetailedMode}
          className="h-7 text-xs"
        >
          חזור למצב רגיל
        </Button>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto mb-2">
        {(exercise.setsData || []).map((setData, index) => (
          <Card key={index} className="p-2 bg-slate-50">
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-full bg-teal-600 text-white text-xs font-bold flex-shrink-0">
                {setData.set}
              </div>
              <Input
                type="number"
                placeholder="חזרות"
                value={setData.reps}
                onChange={(e) => updateSet(index, 'reps', e.target.value)}
                className="h-8 text-sm"
              />
              <Input
                type="number"
                placeholder="משקל"
                value={setData.weight}
                onChange={(e) => updateSet(index, 'weight', e.target.value)}
                className="h-8 text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSet(index)}
                className="h-8 w-8 flex-shrink-0"
              >
                <Trash2 className="w-3 h-3 text-red-500" />
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addSet}
          className="h-9"
        >
          <Plus className="w-3 h-3 ml-1" />
          הוסף סט
        </Button>
        <Input
          type="number"
          placeholder="מנוחה (שניות)"
          value={exercise.rest_seconds}
          onChange={(e) => onUpdate('rest_seconds', parseInt(e.target.value))}
          className="h-9"
        />
      </div>
    </div>
  );
}