import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { ArrowRight, Plus, X, Save, Send, Video, GripVertical, Trash2, Dumbbell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import ExerciseAutocomplete from '../components/coach/ExerciseAutocomplete';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function CreateRotationProgram() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [sequence, setSequence] = useState(['A', 'B']);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const [categories, setCategories] = useState({
    A: [],
    B: []
  });
  const [showExercisePicker, setShowExercisePicker] = useState(false);
  const [currentCategory, setCurrentCategory] = useState('');

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: exerciseBank = [] } = useQuery({
    queryKey: ['exerciseBank'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }),
  });

  const addStep = (letter) => {
    setSequence([...sequence, letter]);
    if (!categories[letter]) {
      setCategories({ ...categories, [letter]: [] });
    }
  };

  const removeStep = (index) => {
    setSequence(sequence.filter((_, i) => i !== index));
  };

  const addExerciseToCategory = (letter, exercise) => {
    setCategories({
      ...categories,
      [letter]: [...(categories[letter] || []), {
        exercise_id: exercise.id,
        exercise_name: exercise.name_he,
        video_url: exercise.video_url || '',
        target_sets: 3,
        target_reps_min: 10,
        target_reps_max: 10,
        target_weight: 0,
        rest_seconds: 90,
        notes: ''
      }]
    });
    setShowExercisePicker(false);
  };

  const openExercisePicker = (letter) => {
    setCurrentCategory(letter);
    setShowExercisePicker(true);
  };

  const updateExercise = (letter, index, field, value) => {
    const updated = [...categories[letter]];
    updated[index][field] = value;
    setCategories({ ...categories, [letter]: updated });
  };

  const removeExercise = (letter, index) => {
    setCategories({
      ...categories,
      [letter]: categories[letter].filter((_, i) => i !== index)
    });
  };

  const saveMutation = useMutation({
    mutationFn: async (assignTrainee = null) => {
      // Validate
      const uniqueLetters = [...new Set(sequence)];
      for (const letter of uniqueLetters) {
        if (!categories[letter] || categories[letter].length === 0) {
          throw new Error(`אין תרגילים בקטגוריה ${letter}`);
        }
      }

      // Create program
      const program = await base44.entities.RotationProgram.create({
        coach_email: user.email,
        name,
        sequence,
        loop_enabled: loopEnabled,
        notes,
        status: assignTrainee ? 'active' : 'draft'
      });

      // Create categories
      for (const letter of uniqueLetters) {
        const category = await base44.entities.RotationCategory.create({
          program_id: program.id,
          category_letter: letter,
          name: `אימון ${letter}`
        });

        // Add exercises
        const exercises = categories[letter];
        for (let i = 0; i < exercises.length; i++) {
          await base44.entities.RotationCategoryExercise.create({
            category_id: category.id,
            order_index: i + 1,
            ...exercises[i]
          });
        }
      }

      // Assign to trainee if requested
      if (assignTrainee) {
        const assignment = await base44.entities.RotationAssignment.create({
          trainee_email: assignTrainee,
          program_id: program.id,
          current_index: 0,
          status: 'active',
          start_date: new Date().toISOString().split('T')[0]
        });

        // Get first category
        const allCategories = await base44.entities.RotationCategory.filter({ program_id: program.id });
        const firstCategory = allCategories.find(c => c.category_letter === sequence[0]);

        // Create first session
        await base44.entities.RotationSessionInstance.create({
          assignment_id: assignment.id,
          category_id: firstCategory.id,
          category_letter: sequence[0],
          date: new Date().toISOString().split('T')[0],
          status: 'ready'
        });
      }

      return program;
    },
    onSuccess: (_, assignTrainee) => {
      toast.success(assignTrainee ? 'התכנית נשמרה ושובצה למתאמן ✅' : 'התכנית נשמרה בהצלחה ✅');
      queryClient.invalidateQueries({ queryKey: ['rotationPrograms'] });
      navigate(-1);
    },
    onError: (error) => {
      toast.error('שגיאה: ' + error.message);
    }
  });

  const uniqueLetters = [...new Set(sequence)];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 pb-20" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
            <ArrowRight className="w-5 h-5" />
          </Button>
          <h1 className="text-2xl font-bold text-blue-900">תוכנית מחזורית חדשה</h1>
        </div>

        {/* Section A: Program Details */}
        <Card className="p-6 bg-white mb-4">
          <h2 className="text-lg font-bold mb-4">פרטי התכנית</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">שם התכנית *</label>
              <Input 
                placeholder="למשל: תכנית A/B/C"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">הערות</label>
              <Textarea 
                placeholder="הערות כלליות..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
              />
            </div>
          </div>
        </Card>

        {/* Section B: Sequence Builder */}
        <Card className="p-6 bg-white mb-4">
          <h2 className="text-lg font-bold mb-4">סדר אימונים (מחזורי)</h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {sequence.map((letter, idx) => (
              <div key={idx} className="flex items-center gap-1 bg-blue-100 text-blue-800 px-3 py-1 rounded-lg">
                <span className="font-medium">{letter}</span>
                <button onClick={() => removeStep(idx)}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-3">
            {['A', 'B', 'C', 'D'].map(letter => (
              <Button key={letter} variant="outline" size="sm" onClick={() => addStep(letter)}>
                <Plus className="w-3 h-3 ml-1" />
                {letter}
              </Button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input 
              type="checkbox"
              checked={loopEnabled}
              onChange={(e) => setLoopEnabled(e.target.checked)}
              className="w-4 h-4"
            />
            חזור על המחזור
          </label>
        </Card>

        {/* Section C: Category Templates */}
        <Card className="p-6 bg-white mb-4">
          <h2 className="text-lg font-bold mb-4">תבניות אימון</h2>
          <Accordion type="single" collapsible>
            {uniqueLetters.map(letter => (
              <AccordionItem key={letter} value={letter}>
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">תבנית אימון {letter}</span>
                    <span className="text-xs text-slate-500">
                      ({categories[letter]?.length || 0} תרגילים)
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3 pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => openExercisePicker(letter)}
                    >
                      <Plus className="w-4 h-4 ml-2" />
                      הוסף תרגיל
                    </Button>

                    {categories[letter]?.map((ex, idx) => (
                      <Card key={idx} className="p-3 bg-slate-50">
                        <div className="flex items-start gap-2 mb-2">
                          <GripVertical className="w-4 h-4 text-slate-400" />
                          <p className="font-medium text-sm flex-1">{ex.exercise_name}</p>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => removeExercise(letter, idx)}
                          >
                            <Trash2 className="w-3 h-3 text-red-500" />
                          </Button>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Video className="w-3 h-3 text-slate-500" />
                            <Input 
                              placeholder="קישור לסרטון *"
                              value={ex.video_url}
                              onChange={(e) => updateExercise(letter, idx, 'video_url', e.target.value)}
                              className="text-sm"
                            />
                          </div>
                          <div className="grid grid-cols-4 gap-1">
                            <Input 
                              type="number"
                              placeholder="סטים"
                              value={ex.target_sets}
                              onChange={(e) => updateExercise(letter, idx, 'target_sets', Number(e.target.value))}
                              className="text-sm"
                            />
                            <Input 
                              type="number"
                              placeholder="מינ"
                              value={ex.target_reps_min}
                              onChange={(e) => updateExercise(letter, idx, 'target_reps_min', Number(e.target.value))}
                              className="text-sm"
                            />
                            <Input 
                              type="number"
                              placeholder="מקס"
                              value={ex.target_reps_max}
                              onChange={(e) => updateExercise(letter, idx, 'target_reps_max', Number(e.target.value))}
                              className="text-sm"
                            />
                            <Input 
                              type="number"
                              placeholder="משקל"
                              value={ex.target_weight}
                              onChange={(e) => updateExercise(letter, idx, 'target_weight', Number(e.target.value))}
                              className="text-sm"
                            />
                          </div>
                        </div>
                      </Card>
                    ))}

                    {(!categories[letter] || categories[letter].length === 0) && (
                      <p className="text-center py-4 text-sm text-slate-400">
                        הוסף תרגילים לאימון {letter}
                      </p>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>

        {/* Section D: Save & Assign */}
        <div className="grid grid-cols-2 gap-3">
          <Button 
            variant="outline"
            onClick={() => saveMutation.mutate(null)}
            disabled={!name || sequence.length === 0 || saveMutation.isPending}
          >
            <Save className="w-4 h-4 ml-2" />
            שמור תוכנית
          </Button>
          <Button 
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => toast.info('פיצ\'ר הקצאה יתווסף בקרוב')}
            disabled={!name || sequence.length === 0}
          >
            <Send className="w-4 h-4 ml-2" />
            שמור ושייך למתאמן
          </Button>
        </div>

        {/* Exercise Picker Dialog */}
        <Dialog open={showExercisePicker} onOpenChange={setShowExercisePicker}>
          <DialogContent dir="rtl" className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dumbbell className="w-5 h-5" />
                בחר תרגיל מהמאגר
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              {exerciseBank.map(exercise => (
                <div
                  key={exercise.id}
                  className="p-3 bg-slate-50 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                  onClick={() => addExerciseToCategory(currentCategory, exercise)}
                >
                  <p className="font-medium text-slate-800">{exercise.name_he}</p>
                  <p className="text-xs text-slate-500">
                    {exercise.muscle_group_primary}
                    {exercise.video_url && ' • יש סרטון'}
                  </p>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}