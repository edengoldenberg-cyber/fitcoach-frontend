import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Video, ChevronDown, ChevronUp, Clock, Copy, Save, Trash2, CheckCircle2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export default function TraineeExerciseCard({ 
  exercise, 
  index, 
  onUpdate,
  showActualPerformance = true,
  onSave,
  onRemove,
  isSaving = false,
  isRemoving = false,
  isSaved = false
}) {
  const [showVideoModal, setShowVideoModal] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [expanded, setExpanded] = useState(true); // Default open for set-by-set

  // Initialize sets array if not exists
  const targetSets = exercise.sets || exercise.current_sets || 3;
  const performedSets = exercise.performed_sets || Array.from({ length: targetSets }, (_, i) => ({
    set_number: i + 1,
    reps: null,
    weight: null
  }));

  const getVideoEmbedUrl = (url) => {
    if (!url) return null;
    
    // YouTube
    const youtubeMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/);
    if (youtubeMatch) {
      return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
    }
    
    return null;
  };

  const embedUrl = getVideoEmbedUrl(exercise.video_url);

  const updateSet = (setIndex, field, value) => {
    const updated = [...performedSets];
    updated[setIndex][field] = value;
    onUpdate(index, 'performed_sets', updated);
  };

  const copyPreviousSet = (setIndex) => {
    if (setIndex === 0) return;
    const updated = [...performedSets];
    updated[setIndex] = { ...updated[setIndex - 1], set_number: setIndex + 1 };
    onUpdate(index, 'performed_sets', updated);
  };

  const fillAllSets = () => {
    if (!performedSets[0].reps && !performedSets[0].weight) return;
    const updated = performedSets.map((set, i) => ({
      set_number: i + 1,
      reps: performedSets[0].reps,
      weight: performedSets[0].weight
    }));
    onUpdate(index, 'performed_sets', updated);
  };

  const handleRemoveClick = () => {
    setShowRemoveConfirm(true);
  };

  const confirmRemove = () => {
    onRemove?.();
    setShowRemoveConfirm(false);
  };

  return (
    <>
      <Card className={`card-premium ${isSaved ? 'border-2 border-green-400 bg-green-50' : ''}`}>
        <div className="mb-4">
          {/* Header with Remove Button */}
          <div className="flex justify-between items-start mb-3">
            <div className="flex items-center gap-3 flex-1">
              <div className={`flex items-center justify-center w-12 h-12 rounded-full text-white font-bold text-xl shadow-md flex-shrink-0 ${
                exercise.block_type === 'superset' || exercise.block_type === 'dropset'
                  ? 'bg-gradient-to-br from-amber-500 to-amber-600'
                  : 'bg-gradient-to-br from-teal-500 to-teal-600'
              }`}>
                {index + 1}
              </div>
              <div className="flex-1">
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-tight mb-1">
                  {exercise.exercise_name}
                </h3>
                {exercise.muscle_group && (
                  <Badge variant="outline" className="mt-1 text-xs">
                    {exercise.muscle_group}
                  </Badge>
                )}
              </div>
            </div>
            
            <div className="flex gap-2">
              {exercise.video_url && (
                <Button
                  size="sm"
                  onClick={() => {
                    if (embedUrl) {
                      setShowVideoModal(true);
                    } else {
                      window.open(exercise.video_url, '_blank');
                    }
                  }}
                  className="bg-teal-600 hover:bg-teal-700 text-white h-9 px-3"
                >
                  <Video className="w-4 h-4 ml-1" />
                  וידאו
                </Button>
              )}
              {onRemove && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRemoveClick}
                  disabled={isRemoving}
                  className="h-9 px-3 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

        {/* Last Performance - Always Visible */}
        {exercise.last_performance && (
          <div className="bg-gradient-to-r from-green-50 to-teal-50 border-2 border-green-200 rounded-xl p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-green-600 flex items-center justify-center flex-shrink-0">
                <span className="text-white text-lg">📊</span>
              </div>
              <p className="text-sm font-bold text-green-800">אימון קודם - {new Date(exercise.last_performance.date).toLocaleDateString('he-IL')}</p>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-xs text-green-700 font-semibold mb-1">משקל</p>
                <p className="text-base font-bold text-green-900">{exercise.last_performance.weight}kg</p>
              </div>
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-xs text-green-700 font-semibold mb-1">חזרות</p>
                <p className="text-base font-bold text-green-900">×{exercise.last_performance.reps}</p>
              </div>
              <div className="bg-white/70 rounded-lg p-2 text-center">
                <p className="text-xs text-green-700 font-semibold mb-1">סטים</p>
                <p className="text-base font-bold text-green-900">{exercise.last_performance.sets}</p>
              </div>
            </div>
          </div>
        )}

        {/* Recommended Parameters */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-teal-50 rounded-2xl p-4 text-center border-2 border-teal-100">
            <p className="small-text text-teal-700 mb-1 font-semibold">סטים</p>
            <p className="number-display text-teal-900">{targetSets}</p>
          </div>
          <div className="bg-teal-50 rounded-2xl p-4 text-center border-2 border-teal-100">
            <p className="small-text text-teal-700 mb-1 font-semibold">חזרות</p>
            <p className="number-display text-teal-900">{exercise.reps || exercise.reps_text || '8-12'}</p>
          </div>
          <div className="bg-teal-50 rounded-2xl p-4 text-center border-2 border-teal-100">
            <p className="small-text text-teal-700 mb-1 font-semibold">מנוחה</p>
            <p className="text-xl font-bold text-teal-900 flex items-center justify-center gap-1">
              <Clock className="w-4 h-4" />
              {exercise.rest_seconds || 60}″
            </p>
          </div>
        </div>

        {/* Set-by-Set Performance */}
        {showActualPerformance && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-slate-800">הביצוע שלי - סט אחרי סט:</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fillAllSets}
                  className="h-7 text-xs"
                  disabled={!performedSets[0]?.reps && !performedSets[0]?.weight}
                >
                  מלא לכולם
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExpanded(!expanded)}
                  className="h-7 text-xs"
                >
                  {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </Button>
              </div>
            </div>
            
            {expanded && (
              <div className="space-y-2">
                {performedSets.map((set, setIndex) => (
                  <div key={setIndex} className="bg-slate-50 border-2 border-slate-200 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-bold text-slate-700 min-w-[60px]">
                        סט {set.set_number}
                      </span>
                      {setIndex > 0 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyPreviousSet(setIndex)}
                          className="h-6 text-xs text-slate-600 hover:text-slate-900"
                        >
                          <Copy className="w-3 h-3 ml-1" />
                          העתק קודם
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          משקל (kg)
                          {exercise.last_performance && (
                            <span className="text-green-600 mr-1 font-bold">
                              (קודם: {exercise.last_performance.weight})
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          step="0.5"
                          value={set.weight ?? ''}
                          onChange={(e) => updateSet(setIndex, 'weight', parseFloat(e.target.value) || null)}
                          className="input-premium text-center h-11"
                          placeholder={exercise.last_performance ? String(exercise.last_performance.weight) : "0"}
                        />
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-slate-600 block mb-1">
                          חזרות
                          {exercise.last_performance && (
                            <span className="text-green-600 mr-1 font-bold">
                              (קודם: {exercise.last_performance.reps})
                            </span>
                          )}
                        </label>
                        <Input
                          type="number"
                          value={set.reps ?? ''}
                          onChange={(e) => updateSet(setIndex, 'reps', parseInt(e.target.value) || null)}
                          className="input-premium text-center h-11"
                          placeholder={exercise.last_performance ? String(exercise.last_performance.reps) : "10"}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {exercise.notes && (
          <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-800">
              💡 <strong>הערות מהמאמן:</strong> {exercise.notes}
            </p>
          </div>
        )}

        {/* Save Button */}
        {onSave && showActualPerformance && (
          <div className="mt-4 pt-4 border-t">
            <Button
              onClick={onSave}
              disabled={isSaving || isSaved}
              className={`w-full h-14 text-base font-bold ${
                isSaved 
                  ? 'bg-green-600 hover:bg-green-600' 
                  : 'bg-teal-600 hover:bg-teal-700'
              } text-white`}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 ml-2 animate-spin" />
                  שומר...
                </>
              ) : isSaved ? (
                <>
                  <CheckCircle2 className="w-5 h-5 ml-2" />
                  התרגיל נשמר ✓
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 ml-2" />
                  שמור תרגיל
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Video Modal */}
      {embedUrl && (
        <Dialog open={showVideoModal} onOpenChange={setShowVideoModal}>
          <DialogContent dir="rtl" className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>{exercise.exercise_name}</DialogTitle>
            </DialogHeader>
            <div className="aspect-video">
              <iframe
                src={embedUrl}
                className="w-full h-full rounded-lg"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Remove Confirmation Dialog */}
      <Dialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl">❌ הסרת תרגיל מהאימון</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-slate-700 mb-4">
              האם אתה בטוח שברצונך להסיר את התרגיל <strong>{exercise.exercise_name}</strong> מהאימון?
            </p>
            <p className="text-sm text-slate-500 mb-4">
              התרגיל יוסר רק מהאימון הנוכחי. ההיסטוריה והנתונים הקודמים יישמרו.
            </p>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-12 bg-red-600 hover:bg-red-700 text-white font-bold"
                onClick={confirmRemove}
                disabled={isRemoving}
              >
                {isRemoving ? 'מסיר...' : 'כן, הסר'}
              </Button>
              <Button
                className="flex-1 h-12"
                variant="outline"
                onClick={() => setShowRemoveConfirm(false)}
                disabled={isRemoving}
              >
                ביטול
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
    </>
  );
}