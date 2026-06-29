import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  GripVertical,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Link2,
} from 'lucide-react';
import { ExerciseSupersetBadge, getGroups, GROUP_COLORS, GROUP_LABELS } from '../coach/SupersetManager';

const WorkoutExerciseCard = React.memo(
  React.forwardRef(function WorkoutExerciseCard(
    {
      exercise,
      index,
      onUpdate,
      onRemove,
      onDuplicate,
      exercises,
      onUpdateList,
      draggableProps,
      dragHandleProps,
      isDragging,
    },
    ref
  ) {
    const [collapsed, setCollapsed] = useState(false);

    const isGrouped = !!exercise.group_id;
    const groups = isGrouped ? getGroups(exercises) : {};
    const groupMeta = isGrouped ? groups[exercise.group_id] : null;
    const isFirstInGroup = isGrouped && groupMeta?.indices?.[0] === index;
    const colors = isGrouped ? GROUP_COLORS[exercise.group_type] || GROUP_COLORS.superset : null;

    // Local handlers — all stable via useCallback
    const handleNameChange = useCallback(
      (e) => onUpdate(index, 'exercise_name', e.target.value),
      [index, onUpdate]
    );

    const handleSetsChange = useCallback(
      (e) => onUpdate(index, 'default_sets_count', parseInt(e.target.value) || 4),
      [index, onUpdate]
    );

    const handleSetTypeChange = useCallback(
      (value) => onUpdate(index, 'set_type', value),
      [index, onUpdate]
    );

    const handleRepsMinChange = useCallback(
      (e) => onUpdate(index, 'target_reps_min', e.target.value ? parseInt(e.target.value) : null),
      [index, onUpdate]
    );

    const handleRepsMaxChange = useCallback(
      (e) => onUpdate(index, 'target_reps_max', e.target.value ? parseInt(e.target.value) : null),
      [index, onUpdate]
    );

    const handleTimeChange = useCallback(
      (e) => onUpdate(index, 'target_time_seconds', e.target.value ? parseInt(e.target.value) : null),
      [index, onUpdate]
    );

    const handleNotesChange = useCallback(
      (e) => onUpdate(index, 'notes_he', e.target.value),
      [index, onUpdate]
    );

    const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);
    const handleDuplicate = useCallback(() => onDuplicate(index), [index, onDuplicate]);
    const toggleCollapse = useCallback(() => setCollapsed((c) => !c), []);

    const handleAddDetailedSets = useCallback(() => {
      const defaultSets = [];
      for (let i = 0; i < (exercise.default_sets_count || 4); i++) {
        defaultSets.push({
          set_index: i + 1,
          target_weight: null,
          target_reps_min: exercise.target_reps_min || null,
          target_reps_max: exercise.target_reps_max || null,
          target_rir: null,
          notes: null,
        });
      }
      onUpdate(index, 'sets', defaultSets);
    }, [index, onUpdate, exercise]);

    const handleRemoveSets = useCallback(() => onUpdate(index, 'sets', null), [index, onUpdate]);

    const handleSetWeightChange = useCallback(
      (setIdx, val) => {
        const newSets = [...exercise.sets];
        newSets[setIdx] = { ...newSets[setIdx], target_weight: val ? parseFloat(val) : null };
        onUpdate(index, 'sets', newSets);
      },
      [index, onUpdate, exercise.sets]
    );

    const handleSetRepsChange = useCallback(
      (setIdx, val) => {
        const newSets = [...exercise.sets];
        newSets[setIdx] = { ...newSets[setIdx], target_reps_min: val ? parseInt(val) : null };
        onUpdate(index, 'sets', newSets);
      },
      [index, onUpdate, exercise.sets]
    );

    const handleGroupRoundCountChange = useCallback(
      (e) => {
        const val = parseInt(e.target.value) || 3;
        onUpdateList(
          exercises.map((item) =>
            item.group_id === exercise.group_id ? { ...item, round_count: val } : item
          )
        );
      },
      [exercises, exercise.group_id, onUpdateList]
    );

    const handleGroupRestChange = useCallback(
      (e) => {
        const val = parseInt(e.target.value) || 60;
        onUpdateList(
          exercises.map((item) =>
            item.group_id === exercise.group_id ? { ...item, rest_after_round_seconds: val } : item
          )
        );
      },
      [exercises, exercise.group_id, onUpdateList]
    );

    return (
      <div
        ref={ref}
        {...draggableProps}
        className={`
          bg-white rounded-xl border transition-all duration-150
          ${isDragging
            ? 'shadow-2xl border-orange-300 scale-[1.02] z-50'
            : isGrouped
            ? `${colors.bg} ${colors.border} border-2`
            : 'border-slate-200 shadow-sm'
          }
        `}
      >
        {/* Superset group header — first in group only */}
        {isFirstInGroup && (
          <div
            className={`flex flex-wrap items-center gap-2 rounded-t-xl border-b bg-white/70 px-3 py-2 ${colors.border}`}
          >
            <Link2 className={`w-4 h-4 ${colors.text}`} />
            <span className={`text-sm font-bold ${colors.text}`}>
              {GROUP_LABELS[exercise.group_type]} {exercise.group_label}
            </span>
            <span className="text-xs text-slate-500">סבבים</span>
            <Input
              type="number"
              value={exercise.round_count || 3}
              onChange={handleGroupRoundCountChange}
              className="h-8 w-16 text-center"
              min={1}
              max={10}
            />
            <span className="text-xs text-slate-500">מנוחה בין סבבים</span>
            <Input
              type="number"
              value={exercise.rest_after_round_seconds || 60}
              onChange={handleGroupRestChange}
              className="h-8 w-20 text-center"
              min={0}
              max={300}
              step={15}
            />
            <span className="text-xs text-slate-400">שניות</span>
          </div>
        )}

        {/* Card header row */}
        <div className="flex items-center gap-2 p-3">
          {/* Drag handle */}
          <div
            {...dragHandleProps}
            className="flex items-center justify-center w-11 h-11 cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-500 shrink-0 -ml-1"
            title="גרור לסידור מחדש"
          >
            <GripVertical className="w-5 h-5" />
          </div>

          {/* Index badge */}
          <div className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-orange-600">{index + 1}</span>
          </div>

          {/* Exercise name */}
          <Input
            value={exercise.exercise_name || ''}
            onChange={handleNameChange}
            className="flex-1 font-semibold text-slate-800 border-0 shadow-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 px-1 h-9"
          />

          {/* Action buttons */}
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleCollapse}
            className="w-8 h-8 text-slate-400 hover:text-slate-600 shrink-0"
            title={collapsed ? 'הרחב' : 'כווץ'}
          >
            {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDuplicate}
            className="w-8 h-8 text-slate-400 hover:text-slate-600 shrink-0"
            title="שכפל"
          >
            <Copy className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            className="w-8 h-8 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
            title="מחק"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>

        {/* Superset badge (below name row, always visible) */}
        <div className="px-3 pb-1">
          <ExerciseSupersetBadge
            exercise={exercise}
            idx={index}
            exercises={exercises}
            onUpdate={onUpdateList}
          />
        </div>

        {/* Collapsible body */}
        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              key="body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              style={{ overflow: 'hidden' }}
            >
              <div className="px-3 pb-3 space-y-3 border-t border-slate-100 pt-3">
                {/* Sets + Type row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-slate-500">מספר סטים</Label>
                    <Input
                      type="number"
                      value={exercise.default_sets_count || 4}
                      onChange={handleSetsChange}
                      min={1}
                      max={20}
                      className="h-9 mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">סוג סט</Label>
                    <Select
                      value={exercise.set_type || 'reps'}
                      onValueChange={handleSetTypeChange}
                    >
                      <SelectTrigger className="h-9 mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="reps">חזרות</SelectItem>
                        <SelectItem value="time">זמן עבודה</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Reps range */}
                {(!exercise.set_type || exercise.set_type === 'reps') && (
                  <div>
                    <Label className="text-xs text-slate-500">חזרות מומלצות (טווח)</Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        type="number"
                        value={exercise.target_reps_min || ''}
                        onChange={handleRepsMinChange}
                        placeholder="מינ'"
                        className="h-9"
                      />
                      <Input
                        type="number"
                        value={exercise.target_reps_max || ''}
                        onChange={handleRepsMaxChange}
                        placeholder="מקס'"
                        className="h-9"
                      />
                    </div>
                  </div>
                )}

                {/* Time */}
                {exercise.set_type === 'time' && (
                  <div>
                    <Label className="text-xs text-slate-500">זמן עבודה (שניות)</Label>
                    <Input
                      type="number"
                      value={exercise.target_time_seconds || ''}
                      onChange={handleTimeChange}
                      placeholder="לדוגמה: 60"
                      className="h-9 mt-1"
                    />
                  </div>
                )}

                {/* Detailed sets */}
                {!exercise.sets && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleAddDetailedSets}
                    className="w-full text-slate-500"
                  >
                    הוסף סטים מפורטים (אופציונלי)
                  </Button>
                )}

                {exercise.sets && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <Label className="text-xs text-slate-500">סטים מפורטים</Label>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={handleRemoveSets}
                        className="h-6 text-xs text-slate-400"
                      >
                        הסר
                      </Button>
                    </div>
                    <div className="space-y-1 max-h-40 overflow-y-auto">
                      {exercise.sets.map((set, setIdx) => (
                        <div key={setIdx} className="flex gap-2 items-center text-xs">
                          <span className="w-10 text-slate-500 shrink-0">סט {setIdx + 1}:</span>
                          <Input
                            type="number"
                            value={set.target_weight || ''}
                            onChange={(e) => handleSetWeightChange(setIdx, e.target.value)}
                            placeholder="משקל"
                            className="h-7 w-16"
                          />
                          <Input
                            type="number"
                            value={set.target_reps_min || ''}
                            onChange={(e) => handleSetRepsChange(setIdx, e.target.value)}
                            placeholder="חזרות"
                            className="h-7 w-16"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Notes */}
                <div>
                  <Label className="text-xs text-slate-500">הערות / הנחיות</Label>
                  <Textarea
                    value={exercise.notes_he || ''}
                    onChange={handleNotesChange}
                    placeholder="למשל: 'שמור על טכניקה נכונה', 'מקסימום משקל'"
                    rows={2}
                    className="mt-1 text-sm resize-none"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }),
  (prev, next) => {
    return (
      prev.exercise === next.exercise &&
      prev.index === next.index &&
      prev.isDragging === next.isDragging
    );
  }
);

WorkoutExerciseCard.displayName = 'WorkoutExerciseCard';

export default WorkoutExerciseCard;