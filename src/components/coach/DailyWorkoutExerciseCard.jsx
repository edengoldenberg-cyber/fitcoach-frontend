import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Trash2, Video, GripVertical, Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

export default function DailyWorkoutExerciseCard({ 
  exercise, 
  index, 
  onUpdate, 
  onRemove, 
  onCopyFromLast,
  canCopyFromLast = false
}) {
  const [showVideoPreview, setShowVideoPreview] = useState(false);

  const validateVideoUrl = (url) => {
    if (!url) return false;
    const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\/.+/;
    const driveRegex = /^https:\/\/drive\.google\.com\/.+/;
    return youtubeRegex.test(url) || driveRegex.test(url) || url.startsWith('http');
  };

  const handleVideoCheck = () => {
    if (validateVideoUrl(exercise.video_url)) {
      setShowVideoPreview(true);
      window.open(exercise.video_url, '_blank');
    } else {
      toast.error('קישור וידאו לא תקין. השתמש ב-YouTube, Google Drive או קישור תקין אחר.');
    }
  };

  return (
    <Card className="card-premium">
      <div className="flex items-start spacing-card-gap mb-6">
        <div className="cursor-move text-slate-400 hover:text-slate-600">
          <GripVertical className="w-5 h-5" />
        </div>
        
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="title-medium">{exercise.exercise_name}</h3>
              {exercise.muscle_group && (
                <Badge variant="outline" className="mt-2 text-xs px-3 py-1">
                  {exercise.muscle_group}
                </Badge>
              )}
            </div>
            <div className="flex gap-1">
              {canCopyFromLast && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onCopyFromLast(index)}
                  title="העתק מאימון קודם"
                  className="text-blue-500 hover:text-blue-700"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(index)}
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Training Parameters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div>
              <label className="small-text font-semibold block mb-2">סטים</label>
              <Input
                type="number"
                placeholder="3"
                value={exercise.sets || ''}
                onChange={(e) => onUpdate(index, 'sets', parseInt(e.target.value) || 0)}
                className="input-premium text-center"
              />
            </div>
            <div>
              <label className="small-text font-semibold block mb-2">חזרות</label>
              <Input
                placeholder="8-12"
                value={exercise.reps || ''}
                onChange={(e) => onUpdate(index, 'reps', e.target.value)}
                className="input-premium text-center"
              />
            </div>
            <div>
              <label className="small-text font-semibold block mb-2">משקל (ק״ג)</label>
              <Input
                type="number"
                step="0.5"
                placeholder="0"
                value={exercise.weight || ''}
                onChange={(e) => onUpdate(index, 'weight', parseFloat(e.target.value) || 0)}
                className="input-premium text-center"
              />
            </div>
            <div>
              <label className="small-text font-semibold block mb-2">מנוחה (ש׳)</label>
              <Input
                type="number"
                placeholder="60"
                value={exercise.rest_seconds || ''}
                onChange={(e) => onUpdate(index, 'rest_seconds', parseInt(e.target.value) || 60)}
                className="input-premium text-center"
              />
            </div>
          </div>

          {/* Tempo (Optional) */}
          <div className="mb-4">
            <label className="small-text font-semibold block mb-2">
              טמפו (אופציונלי)
            </label>
            <Input
              placeholder="3-1-1-0"
              value={exercise.tempo || ''}
              onChange={(e) => onUpdate(index, 'tempo', e.target.value)}
              className="input-premium"
            />
          </div>

          {/* Video URL */}
          <div className="mb-4">
            <label className="small-text font-semibold block mb-2">
              קישור וידאו
            </label>
            <div className="flex gap-3">
              <Input
                placeholder="https://..."
                value={exercise.video_url || ''}
                onChange={(e) => onUpdate(index, 'video_url', e.target.value)}
                className="input-premium"
              />
              {exercise.video_url && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleVideoCheck}
                  className="btn-secondary h-12 whitespace-nowrap"
                >
                  <ExternalLink className="w-4 h-4 ml-1" />
                  בדוק
                </Button>
              )}
            </div>
            {exercise.video_url && validateVideoUrl(exercise.video_url) && (
              <div className="mt-2 flex items-center gap-2 small-text text-green-600 font-medium">
                <Video className="w-4 h-4" />
                קישור תקין
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="small-text font-semibold block mb-2">הערות</label>
            <Textarea
              placeholder="הערות למתאמן..."
              value={exercise.notes || ''}
              onChange={(e) => onUpdate(index, 'notes', e.target.value)}
              rows={3}
              className="resize-none rounded-xl border-2 border-slate-200 focus:border-teal-400 p-3"
            />
          </div>
        </div>
      </div>
    </Card>
  );
}