import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Dumbbell, Trash2, Library, History, Check, Save } from "lucide-react";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

const DEFAULT_EXERCISES = [
  'לחיצת חזה',
  'סקוואט',
  'משיכת כבל עליון',
  'לחיצת כתפיים',
  'כפיפת מרפק',
  'יישור מרפק',
  'מתח',
  'פלאנק',
];

export default function AddWorkoutDialog({ open, onClose, onSave, traineeEmail, previousWorkouts = [], prefilledExercises = [], editingWorkout = null, workoutDate = null }) {
  const [workoutName, setWorkoutName] = useState('אימון כוח');
  const [exercises, setExercises] = useState([
    { exercise_name: '', angle: '', sets: [{ weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }], inputMode: 'library' }
  ]);
  const [notes, setNotes] = useState('');
  const [categoryFilters, setCategoryFilters] = useState({});
  const [equipmentFilters, setEquipmentFilters] = useState({});
  const [searchTerms, setSearchTerms] = useState({});
  const [pendingExercise, setPendingExercise] = useState({});
  const [savingExerciseIndex, setSavingExerciseIndex] = useState(null);

  // Initialize with prefilled exercises from photo
  React.useEffect(() => {
    if (prefilledExercises.length > 0) {
      setExercises(prefilledExercises.map(name => ({
        exercise_name: name,
        angle: '',
        sets: [{ weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }],
        inputMode: 'manual'
      })));
    }
  }, [prefilledExercises]);

  // Initialize with editing workout
  React.useEffect(() => {
    if (editingWorkout) {
      setWorkoutName(editingWorkout.workout_name || 'אימון כוח');
      setExercises(editingWorkout.exercises?.map(ex => ({
        exercise_name: ex.exercise_name,
        angle: ex.angle || '',
        sets: ex.sets || [],
        notes: ex.notes || '',
        inputMode: 'library'
      })) || [{ exercise_name: '', angle: '', sets: [{ weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }], inputMode: 'library' }]);
      setNotes(editingWorkout.notes || '');
    }
  }, [editingWorkout]);

  // Fetch exercise library
  const { data: exerciseLibrary = [] } = useQuery({
    queryKey: ['exerciseLibrary'],
    queryFn: async () => {
      try {
        const exercises = await base44.entities.Exercise.filter({ status: 'active' });
        return exercises.map(ex => ({
          id: ex.id,
          name: ex.name_he,
          category: ex.muscle_group_primary,
          equipment: ex.equipment?.[0] || null,
          supports_angle: false
        }));
      } catch (err) {
        console.error('Failed to load exercises:', err);
        return [];
      }
    },
  });

  // Fetch angle options
  const { data: angleOptions = [] } = useQuery({
    queryKey: ['exerciseAngleOptions'],
    queryFn: () => base44.entities.ExerciseAngleOption.list(),
  });

  // Filtered exercise library per exercise with search
  const getFilteredExerciseLibrary = (exerciseIndex) => {
    const categoryFilter = categoryFilters[exerciseIndex] || 'הכל';
    const equipmentFilter = equipmentFilters[exerciseIndex] || 'הכל';
    const searchTerm = (searchTerms[exerciseIndex] || '').toLowerCase().trim();
    
    return exerciseLibrary.filter(ex => {
      const categoryMatch = categoryFilter === 'הכל' || ex.category === categoryFilter;
      const equipmentMatch = equipmentFilter === 'הכל' || ex.equipment === equipmentFilter;
      
      // Search by substring in name
      const searchMatch = !searchTerm || ex.name.toLowerCase().includes(searchTerm);
      
      return categoryMatch && equipmentMatch && searchMatch;
    });
  };

  // Fetch ExerciseHistory as supplemental source
  const { data: exerciseHistoryRecords = [] } = useQuery({
    queryKey: ['exerciseHistoryForDialog', traineeEmail],
    queryFn: () => base44.entities.ExerciseHistory.filter({ trainee_email: traineeEmail }, '-date', 200),
    enabled: !!traineeEmail,
  });

  // מאגר תרגילים עם נתונים אחרונים — merged from previousWorkouts + ExerciseHistory
  const exerciseHistory = React.useMemo(() => {
    const history = {};

    // 1. seed from previousWorkouts (existing path)
    previousWorkouts.forEach(w => {
      w.exercises?.forEach(ex => {
        const key = (ex.exercise_name || '').trim().toLowerCase();
        if (!key) return;
        if (!history[key] || new Date(w.date) > new Date(history[key].date)) {
          history[key] = { date: w.date, sets: ex.sets || [], notes: ex.notes || '' };
        }
      });
    });

    // 2. merge/override from ExerciseHistory if more recent
    exerciseHistoryRecords.forEach(rec => {
      const key = (rec.exercise_name || '').trim().toLowerCase();
      if (!key) return;
      let recSets = [];
      try { recSets = JSON.parse(rec.notes || '[]'); } catch { recSets = []; }
      if (!Array.isArray(recSets) || recSets.length === 0) {
        recSets = Array.from({ length: rec.sets || 1 }, () => ({ weight: rec.weight || 0, reps: rec.reps || 0 }));
      }
      if (!history[key] || new Date(rec.date) > new Date(history[key].date)) {
        history[key] = { date: rec.date, sets: recSets, notes: rec.notes || '' };
      }
    });

    return history;
  }, [previousWorkouts, exerciseHistoryRecords]);

  const addExercise = () => {
    setExercises([...exercises, {
      exercise_name: '',
      angle: '',
      sets: [{ weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }],
      inputMode: 'library'
    }]);
  };

  const removeExercise = (index) => {
    setExercises(exercises.filter((_, i) => i !== index));
  };

  const updateExercise = (index, field, value) => {
    const updated = [...exercises];
    updated[index][field] = value;
    setExercises(updated);
  };

  const confirmAddExercise = (exerciseIndex) => {
    const exerciseName = pendingExercise[exerciseIndex];
    if (!exerciseName || !exerciseName.trim()) return;

    // Check if exercise exists in library
    const existsInLibrary = exerciseLibrary.some(ex => 
      ex.name.toLowerCase() === exerciseName.toLowerCase()
    );

    if (!existsInLibrary) {
      const confirmAdd = window.confirm(`התרגיל "${exerciseName}" לא נמצא במאגר.\nלהוסיף כתרגיל חדש?`);
      if (!confirmAdd) {
        return;
      }
      
      // Add to library
      base44.entities.Exercise.create({
        name_he: exerciseName,
        muscle_group_primary: 'אחר',
        status: 'active',
        is_default: false
      }).catch(err => console.error('Failed to add exercise:', err));
    }

    // Update exercise
    const updated = [...exercises];
    updated[exerciseIndex].exercise_name = exerciseName;
    
    // Load last performance if exists
    if (exerciseHistory[exerciseName]) {
      const lastData = exerciseHistory[exerciseName];
      updated[exerciseIndex].sets = lastData.sets.map(s => ({ ...s }));
      if (lastData.notes) {
        updated[exerciseIndex].notes = lastData.notes;
      }
    }
    
    setExercises(updated);
    setPendingExercise({ ...pendingExercise, [exerciseIndex]: '' });
  };

  const updateSet = (exerciseIndex, setIndex, field, value) => {
    const updated = [...exercises];
    if (field === 'reps') {
      // Handle reps as number
      updated[exerciseIndex].sets[setIndex][field] = value === '' || value === null ? 0 : (typeof value === 'string' ? parseInt(value) : value);
    } else if (field === 'weight') {
      // Handle weight as number
      const parsed = parseFloat(String(value).replace(',', '.'));
      updated[exerciseIndex].sets[setIndex][field] = isNaN(parsed) ? 0 : parsed;
    } else {
      updated[exerciseIndex].sets[setIndex][field] = value;
    }
    setExercises(updated);
  };

  const addSet = (exerciseIndex) => {
    const updated = [...exercises];
    const currentSets = updated[exerciseIndex].sets || [];
    if (currentSets.length >= 10) {
      alert('מקסימום 10 סטים לתרגיל');
      return;
    }
    updated[exerciseIndex].sets.push({ weight: '', reps: '' });
    setExercises(updated);
  };

  const removeSet = (exerciseIndex) => {
    const updated = [...exercises];
    const currentSets = updated[exerciseIndex].sets || [];
    if (currentSets.length <= 1) {
      return;
    }
    updated[exerciseIndex].sets.pop();
    setExercises(updated);
  };

  const normalizeSet = (set) => {
    let weight = 0;
    let reps = 0;
    
    // Normalize weight
    if (set.weight !== '' && set.weight !== null && set.weight !== undefined) {
      const weightStr = String(set.weight).replace(',', '.');
      const parsed = parseFloat(weightStr);
      weight = isNaN(parsed) ? 0 : parsed;
    }
    
    // Normalize reps
    if (set.reps !== '' && set.reps !== null && set.reps !== undefined) {
      const parsed = parseInt(String(set.reps), 10);
      reps = isNaN(parsed) ? 0 : parsed;
    }
    
    return { weight, reps };
  };

  const normalizeExercise = (exercise) => {
    // Normalize all sets
    const normalizedSets = (exercise.sets || []).map(normalizeSet);
    
    return {
      exercise_name: exercise.exercise_name,
      angle: exercise.angle || null,
      sets: normalizedSets,
      notes: exercise.notes || null,
    };
  };

  const handleSave = async () => {
    try {
      // Normalize and filter exercises
      const processedExercises = exercises
        .filter(e => e.exercise_name && e.exercise_name.trim())
        .map(exercise => {
          const normalized = normalizeExercise(exercise);
          // Keep all sets, even with reps=0 or weight=0
          return normalized;
        })
        .filter(e => e.sets && e.sets.length > 0);

      if (processedExercises.length === 0) {
        alert('❌ לא הוזנו תרגילים.\nהוסף לפחות תרגיל אחד עם סט אחד כדי לשמור אימון.');
        return;
      }

      console.log('[AddWorkoutDialog] Saving workout:', { 
        traineeEmail, 
        exercisesCount: processedExercises.length,
        totalSets: processedExercises.reduce((sum, e) => sum + e.sets.length, 0)
      });

      // Add new exercises to library
      const existingExerciseNames = exerciseLibrary.map(ex => ex.name.toLowerCase());
      const newExercises = processedExercises
        .filter(e => !existingExerciseNames.includes(e.exercise_name.toLowerCase()))
        .map(e => e.exercise_name);
      
      const uniqueNewExercises = [...new Set(newExercises)];
      
      for (const exerciseName of uniqueNewExercises) {
        try {
          await base44.entities.Exercise.create({
            name_he: exerciseName,
            muscle_group_primary: 'אחר',
            status: 'active',
            is_default: false
          });
          console.log('[AddWorkoutDialog] Added exercise to library:', exerciseName);
        } catch (err) {
          console.error('Failed to add exercise to library:', err);
        }
      }

      const session = {
        trainee_email: traineeEmail,
        date: workoutDate || new Date().toISOString().split('T')[0],
        workout_name: workoutName,
        title: workoutName,
        exercises: processedExercises,
        notes,
      };
      
      console.log('[AddWorkoutDialog] Final session:', session);
      await onSave(session);
      resetForm();
    } catch (err) {
      console.error('[AddWorkoutDialog] Save error:', err);
      alert(`❌ שגיאה בשמירת האימון:\n${err.message || 'שגיאה לא ידועה'}`);
    }
  };

  const resetForm = () => {
    setWorkoutName('אימון כוח');
    setExercises([{ exercise_name: '', angle: '', sets: [{ weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }, { weight: '', reps: 10 }], inputMode: 'library' }]);
    setNotes('');
    setCategoryFilters({});
    setEquipmentFilters({});
    setSearchTerms({});
    setPendingExercise({});
  };

  const hasUnsavedChanges = () => {
    const hasExercises = exercises.some(e => e.exercise_name);
    const hasCustomWorkoutName = workoutName !== 'אימון כוח';
    const hasNotes = notes.trim().length > 0;
    return hasExercises || hasCustomWorkoutName || hasNotes;
  };

  const handleClose = () => {
    if (hasUnsavedChanges()) {
      const confirmed = window.confirm('יש לך שינויים שלא נשמרו. האם אתה בטוח שברצונך לצאת?');
      if (!confirmed) return;
    }
    resetForm();
    onClose();
  };

  const handleSaveIndividualExercise = async (exerciseIndex) => {
    setSavingExerciseIndex(exerciseIndex);
    
    try {
      const exercise = exercises[exerciseIndex];
      
      if (!exercise.exercise_name || !exercise.exercise_name.trim()) {
        toast.error('לא נבחר תרגיל');
        setSavingExerciseIndex(null);
        return;
      }

      const normalizedExercise = normalizeExercise(exercise);
      
      if (!normalizedExercise.sets || normalizedExercise.sets.length === 0) {
        toast.error('אין סטים להזין');
        setSavingExerciseIndex(null);
        return;
      }

      // Check if at least one set has data
      const hasData = normalizedExercise.sets.some(set => set.weight > 0 || set.reps > 0);
      
      if (!hasData) {
        toast.error('הכנס לפחות משקל או חזרות בסט אחד');
        setSavingExerciseIndex(null);
        return;
      }

      // Add exercise to library if needed
      const existingExerciseNames = exerciseLibrary.map(ex => ex.name.toLowerCase());
      if (!existingExerciseNames.includes(exercise.exercise_name.toLowerCase())) {
        try {
          await base44.entities.Exercise.create({
            name_he: exercise.exercise_name,
            muscle_group_primary: 'אחר',
            status: 'active',
            is_default: false
          });
        } catch (err) {
          console.error('Failed to add exercise to library:', err);
        }
      }

      // Save via backend function
      const exerciseToSave = {
        name: normalizedExercise.exercise_name,
        sets: normalizedExercise.sets,
        notes: normalizedExercise.notes || '',
        angle: normalizedExercise.angle,
      };

      console.log('[SaveIndividualExercise] Calling saveWorkoutSession with:', {
        title: workoutName || 'אימון כוח',
        date: new Date().toISOString().split('T')[0],
        notes: '',
        exercises: [exerciseToSave],
        trainee_email: traineeEmail
      });

      const response = await base44.functions.invoke('saveWorkoutSession', {
        title: workoutName || 'אימון כוח',
        date: workoutDate || new Date().toISOString().split('T')[0],
        notes: '',
        exercises: [exerciseToSave],
        trainee_email: traineeEmail
      });

      console.log('[SaveIndividualExercise] Response:', response);

      if (response?.data?.success || response?.data?.ok) {
        toast.success(`✅ ${exercise.exercise_name} נשמר`);
        // Don't close dialog, just mark this exercise as saved
      } else {
        throw new Error(response?.data?.message_he || response?.data?.error || 'שגיאה בשמירה');
      }
      
    } catch (error) {
      console.error('[SaveIndividualExercise] Error:', error);
      toast.error(`❌ ${error.message}`);
    } finally {
      setSavingExerciseIndex(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Dumbbell className="w-6 h-6 text-orange-500" />
            {editingWorkout ? 'ערוך אימון' : 'הוסף אימון'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>שם האימון</Label>
            <Input
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              placeholder="אימון כוח / יום חזה / וכו׳"
            />
          </div>

          <div className="space-y-4">
            {exercises.map((exercise, exIndex) => {
              const lastPerformance = exerciseHistory[exercise.exercise_name];
              const filteredExerciseLibrary = getFilteredExerciseLibrary(exIndex);
              const categoryFilter = categoryFilters[exIndex] || 'הכל';
              const equipmentFilter = equipmentFilters[exIndex] || 'הכל';
              
              // Check if selected exercise supports angles
              const selectedExercise = exerciseLibrary.find(e => e.name === exercise.exercise_name);
              const supportsAngle = selectedExercise?.supports_angle === true;
              const availableAngles = angleOptions.filter(a => a.exercise_id === selectedExercise?.id);
              const defaultAngle = availableAngles.find(a => a.is_default);
              
              return (
                <Card key={exIndex} className="p-4 bg-slate-50">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="flex-1 space-y-2">
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={exercise.inputMode === 'library' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateExercise(exIndex, 'inputMode', 'library')}
                          className="flex-1"
                        >
                          <Library className="w-3 h-3 ml-1" />
                          בחר מבנק
                        </Button>
                        <Button
                          type="button"
                          variant={exercise.inputMode === 'manual' ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => updateExercise(exIndex, 'inputMode', 'manual')}
                          className="flex-1"
                        >
                          הזנה ידנית
                        </Button>
                      </div>

                      {exercise.inputMode === 'library' ? (
                        <>
                          <div className="space-y-2">
                            <Input
                              value={searchTerms[exIndex] || ''}
                              onChange={(e) => setSearchTerms({...searchTerms, [exIndex]: e.target.value})}
                              placeholder="חפש תרגיל... (לדוגמה: 'לחיצה')"
                              className="h-9"
                            />
                            
                            <div className="grid grid-cols-2 gap-2">
                              <Select 
                                value={categoryFilter} 
                                onValueChange={(value) => setCategoryFilters({...categoryFilters, [exIndex]: value})}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="הכל">כל הקטגוריות</SelectItem>
                                  <SelectItem value="חזה">חזה</SelectItem>
                                  <SelectItem value="גב">גב</SelectItem>
                                  <SelectItem value="רגליים">רגליים</SelectItem>
                                  <SelectItem value="כתפיים">כתפיים</SelectItem>
                                  <SelectItem value="ידיים">ידיים</SelectItem>
                                  <SelectItem value="ליבה">ליבה</SelectItem>
                                  <SelectItem value="קרדיו">קרדיו</SelectItem>
                                </SelectContent>
                              </Select>
                              <Select 
                                value={equipmentFilter} 
                                onValueChange={(value) => setEquipmentFilters({...equipmentFilters, [exIndex]: value})}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="הכל">כל הציוד</SelectItem>
                                  <SelectItem value="משקולות חופשיות">משקולות חופשיות</SelectItem>
                                  <SelectItem value="מכונה">מכונה</SelectItem>
                                  <SelectItem value="כבל קרוס">כבל קרוס</SelectItem>
                                  <SelectItem value="מוט חופשי">מוט חופשי</SelectItem>
                                  <SelectItem value="סמית משין">סמית משין</SelectItem>
                                  <SelectItem value="קטלבל">קטלבל</SelectItem>
                                  <SelectItem value="משקל גוף">משקל גוף</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          {!exercise.exercise_name ? (
                            <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2 bg-white">
                              {filteredExerciseLibrary.length === 0 ? (
                                <p className="text-xs text-slate-500 text-center py-2">
                                  {searchTerms[exIndex] ? 'לא נמצאו תרגילים תואמים' : 'אין תרגילים במאגר'}
                                </p>
                              ) : (
                                filteredExerciseLibrary.map(ex => (
                                  <button
                                    key={ex.id}
                                    onClick={() => {
                                      setPendingExercise({...pendingExercise, [exIndex]: ex.name});
                                    }}
                                    className={`w-full text-right p-2 rounded hover:bg-blue-50 text-sm transition-colors ${
                                      pendingExercise[exIndex] === ex.name ? 'bg-blue-100 border border-blue-300' : ''
                                    }`}
                                  >
                                    <div className="font-medium">{ex.name}</div>
                                    <div className="text-xs text-slate-500">{ex.category} {ex.equipment && `• ${ex.equipment}`}</div>
                                  </button>
                                ))
                              )}
                            </div>
                          ) : (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                              <p className="text-sm font-medium text-emerald-800">✓ {exercise.exercise_name}</p>
                            </div>
                          )}

                          {pendingExercise[exIndex] && !exercise.exercise_name && (
                            <Button
                              onClick={() => confirmAddExercise(exIndex)}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                              size="sm"
                            >
                              <Check className="w-4 h-4 ml-2" />
                              אשר תרגיל: {pendingExercise[exIndex]}
                            </Button>
                          )}

                          {/* Angle Selection */}
                          {exercise.exercise_name && supportsAngle && availableAngles.length > 0 && (
                            <div>
                              <Label className="text-xs">שיפוע</Label>
                              <Select 
                                value={exercise.angle || defaultAngle?.angle_type || ''} 
                                onValueChange={(value) => updateExercise(exIndex, 'angle', value)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="בחר שיפוע" />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableAngles.map(angle => (
                                    <SelectItem key={angle.id} value={angle.angle_type}>
                                      {angle.angle_type}
                                      {angle.is_default && ' (ברירת מחדל)'}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <Input
                            value={pendingExercise[exIndex] || exercise.exercise_name}
                            onChange={(e) => setPendingExercise({...pendingExercise, [exIndex]: e.target.value})}
                            placeholder="הקלד שם תרגיל..."
                            list={`exercises-${exIndex}`}
                          />
                          {!exercise.exercise_name && pendingExercise[exIndex] && (
                            <Button
                              onClick={() => confirmAddExercise(exIndex)}
                              className="w-full bg-blue-600 hover:bg-blue-700"
                              size="sm"
                            >
                              <Check className="w-4 h-4 ml-2" />
                              ✅ הוסף תרגיל
                            </Button>
                          )}
                          {exercise.exercise_name && (
                           <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                             <p className="text-sm font-medium text-emerald-800">✓ {exercise.exercise_name}</p>
                           </div>
                          )}

                          {/* Angle Selection for manual mode */}
                          {exercise.exercise_name && supportsAngle && availableAngles.length > 0 && (
                           <div>
                             <Label className="text-xs">שיפוע</Label>
                             <Select 
                               value={exercise.angle || defaultAngle?.angle_type || ''} 
                               onValueChange={(value) => updateExercise(exIndex, 'angle', value)}
                             >
                               <SelectTrigger className="h-9">
                                 <SelectValue placeholder="בחר שיפוע" />
                               </SelectTrigger>
                               <SelectContent>
                                 {availableAngles.map(angle => (
                                   <SelectItem key={angle.id} value={angle.angle_type}>
                                     {angle.angle_type}
                                     {angle.is_default && ' (ברירת מחדל)'}
                                   </SelectItem>
                                 ))}
                               </SelectContent>
                             </Select>
                           </div>
                          )}
                          </div>
                          )}
                          <datalist id={`exercises-${exIndex}`}>
                          {Object.keys(exerciseHistory).map(e => <option key={e} value={e} />)}
                          {DEFAULT_EXERCISES.map(e => <option key={e} value={e} />)}
                          </datalist>
                          </div>

                          {exercises.length > 1 && (
                          <Button variant="ghost" size="icon" onClick={() => removeExercise(exIndex)}>
                          <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                          )}
                          </div>

                          {exercise.exercise_name && lastPerformance && (
                    <div className="mb-3 p-2 bg-blue-50 rounded-lg border border-blue-200">
                      <p className="text-xs font-medium text-blue-800 flex items-center gap-1 mb-1">
                        <History className="w-3 h-3" />
                        אימון קודם ({new Date(lastPerformance.date).toLocaleDateString('he')})
                      </p>
                      <div className="flex gap-2 flex-wrap">
                        {lastPerformance.sets.map((set, idx) => (
                          <span key={idx} className="text-xs bg-white px-2 py-1 rounded border border-blue-300 text-blue-700">
                            {set.weight}kg × {set.reps}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {exercise.exercise_name && (
                  <>
                    <div className="flex items-center justify-between mb-3 bg-slate-100 p-2 rounded-lg">
                      <span className="text-sm font-medium text-slate-700">סטים: {exercise.sets.length}</span>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => addSet(exIndex)}
                          disabled={exercise.sets.length >= 10}
                          className="h-7 w-7 p-0"
                        >
                          <Plus className="w-4 h-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => removeSet(exIndex)}
                          disabled={exercise.sets.length <= 1}
                          className="h-7 w-7 p-0"
                        >
                          <Minus className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-xs text-slate-500 mb-2">
                      <span>סט</span>
                      <span>משקל (ק״ג)</span>
                      <span>חזרות</span>
                      <span>קודם</span>
                    </div>

                    {exercise.sets.map((set, setIndex) => {
                  const previousSet = lastPerformance?.sets?.[setIndex];
                  const isCustomReps = set.reps > 15 || (set.reps && ![1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,''].includes(set.reps));
                  
                  return (
                    <div key={setIndex} className="grid grid-cols-4 gap-2 mb-2 items-center">
                      <div className="text-center font-medium text-slate-600">{setIndex + 1}</div>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={set.weight === 0 ? '' : set.weight}
                        onChange={(e) => updateSet(exIndex, setIndex, 'weight', e.target.value)}
                        placeholder="0"
                        className="text-center h-9"
                      />
                      {isCustomReps ? (
                        <Input
                          type="text"
                          inputMode="numeric"
                          value={set.reps === 0 ? '' : set.reps}
                          onChange={(e) => updateSet(exIndex, setIndex, 'reps', e.target.value)}
                          placeholder="0"
                          className="text-center h-9"
                        />
                      ) : (
                        <Select 
                          value={set.reps === 0 ? '' : String(set.reps)} 
                          onValueChange={(value) => {
                            if (value === 'custom') {
                              updateSet(exIndex, setIndex, 'reps', 16);
                            } else {
                              updateSet(exIndex, setIndex, 'reps', value === '' ? 0 : parseInt(value));
                            }
                          }}
                        >
                          <SelectTrigger className="h-9">
                            <SelectValue placeholder="0" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={null}>0</SelectItem>
                            {[...Array(15)].map((_, i) => (
                              <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}</SelectItem>
                            ))}
                            <SelectItem value="custom">אחר...</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <div className="text-center">
                        {previousSet ? (
                          <span className="text-xs text-blue-600 font-medium">
                            {previousSet.weight}×{previousSet.reps}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </div>
                    </div>
                  );
                    })}
                    
                    <div className="mt-2">
                      <Label className="text-xs text-slate-600">הערות על התרגיל</Label>
                      <Textarea
                        placeholder="למשל: 'כאב קל בכתף', 'קושי בשמירה על טכניקה'"
                        value={exercise.notes || ''}
                        onChange={(e) => updateExercise(exIndex, 'notes', e.target.value)}
                        rows={2}
                        className="text-sm mt-1"
                      />
                    </div>

                    {/* Save Individual Exercise Button */}
                    <Button
                      onClick={() => handleSaveIndividualExercise(exIndex)}
                      disabled={savingExerciseIndex === exIndex}
                      size="sm"
                      className="w-full mt-3 bg-green-600 hover:bg-green-700"
                    >
                      {savingExerciseIndex === exIndex ? (
                        <>
                          <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin ml-2" />
                          שומר...
                        </>
                      ) : (
                        <>
                          <Save className="w-4 h-4 ml-2" />
                          שמור תרגיל זה
                        </>
                      )}
                    </Button>
                  </>
                )}
              </Card>
            );
            })}
          </div>

          <Button variant="outline" onClick={addExercise} className="w-full">
            <Plus className="w-4 h-4 ml-2" />
            הוסף תרגיל
          </Button>

          <div>
            <Label>הערות</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="הערות לאימון..."
            />
          </div>

          <Button 
           onClick={handleSave}
           disabled={!exercises.some(e => e.exercise_name) || savingExerciseIndex !== null}
           className="w-full bg-orange-500 hover:bg-orange-600"
          >
           {savingExerciseIndex !== null ? (
             <div className="flex items-center gap-2">
               <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
               <span>שומר...</span>
             </div>
           ) : (
             editingWorkout ? 'עדכן אימון' : 'שמור אימון מלא'
           )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}