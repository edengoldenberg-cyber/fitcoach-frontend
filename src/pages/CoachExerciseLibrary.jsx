/**
 * CoachExerciseLibrary — centralized exercise database management.
 * Coaches can: create/edit/archive exercises, upload images, add instructions.
 * All workouts (Group sessions, Training Programs) pull exercises from this library.
 */
import React, { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Search, Plus, Edit2, Archive, ArchiveRestore, Image, X,
  Dumbbell,
} from 'lucide-react';
import { toast } from 'sonner';

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_GROUPS = [
  'חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית',
  'רגליים', 'ישבן', 'ליבה', 'אירובי', 'אחר',
];

const EQUIPMENT_OPTIONS = [
  'כבל קרוס', 'פולי עליון', 'פולי תחתון', 'מוט חופשי',
  'משקולות יד', 'סמית', 'מכונה', 'משקל גוף', 'גומיה', 'חבל',
];

const DIFFICULTY_LABELS = {
  beginner: 'מתחיל',
  intermediate: 'בינוני',
  advanced: 'מתקדם',
};

// ── Image upload helper ───────────────────────────────────────────────────────

// Compress image to max 600×600px JPEG at 75% quality before storing as base64.
// Keeps DB rows small (~15-30KB per image) while preserving display quality.
function compressImage(file, maxDim = 600, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error('Failed to decode image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width  = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function readFileAsDataURL(file) {
  return compressImage(file);
}

// ── ExerciseCard ──────────────────────────────────────────────────────────────

function ExerciseCard({ exercise, onEdit, onChangeStatus }) {
  const [showImage, setShowImage] = useState(false);
  const isArchived = exercise.status === 'archived';

  return (
    <Card className={`p-4 ${isArchived ? 'opacity-60' : ''}`}>
      <div className="flex gap-3">
        {/* Image thumbnail */}
        <div
          className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-slate-100 flex items-center justify-center cursor-pointer"
          onClick={() => exercise.image_url && setShowImage(true)}
        >
          {exercise.image_url ? (
            <img src={exercise.image_url} alt={exercise.name_he} className="w-full h-full object-cover" />
          ) : (
            <Dumbbell className="w-6 h-6 text-slate-300" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-slate-800 text-sm">
                {exercise.name_he || exercise.name || 'ללא שם'}
              </h3>
              {exercise.name && exercise.name !== exercise.name_he && (
                <p className="text-xs text-slate-400">{exercise.name}</p>
              )}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {isArchived ? (
                <Badge className="bg-slate-100 text-slate-500 text-xs">ארכיון</Badge>
              ) : (
                <Badge className="bg-green-100 text-green-700 text-xs">פעיל</Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-1 mt-1.5">
            {exercise.muscle_group && (
              <span className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded-md border border-orange-100">
                {exercise.muscle_group}
              </span>
            )}
            {exercise.equipment && (
              <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md">
                {Array.isArray(exercise.equipment)
                  ? exercise.equipment[0]
                  : typeof exercise.equipment === 'string'
                    ? exercise.equipment.split(',')[0].trim()
                    : exercise.equipment}
              </span>
            )}
            {exercise.difficulty && (
              <span className="text-[11px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded-md border border-blue-100">
                {DIFFICULTY_LABELS[exercise.difficulty] || exercise.difficulty}
              </span>
            )}
          </div>

          {exercise.instructions && (
            <p className="text-xs text-slate-500 mt-1.5 line-clamp-2">{exercise.instructions}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <Button size="icon" variant="ghost" className="w-8 h-8 text-blue-600" onClick={() => onEdit(exercise)} title="ערוך">
            <Edit2 className="w-3.5 h-3.5" />
          </Button>
          {isArchived ? (
            <Button size="icon" variant="ghost" className="w-8 h-8 text-slate-500" onClick={() => onChangeStatus(exercise.id, 'active')} title="שחזר">
              <ArchiveRestore className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" className="w-8 h-8 text-slate-500" onClick={() => onChangeStatus(exercise.id, 'archived')} title="ארכיון">
              <Archive className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* Image lightbox */}
      {showImage && exercise.image_url && (
        <Dialog open={showImage} onOpenChange={setShowImage}>
          <DialogContent className="max-w-lg p-2">
            <img src={exercise.image_url} alt={exercise.name_he} className="w-full rounded-lg" />
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}

// ── ExerciseForm ──────────────────────────────────────────────────────────────

function ExerciseForm({ exercise, onSave, onClose, isPending }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState({
    name_he:        exercise?.name_he        || '',
    name:           exercise?.name           || '',
    muscle_group:   exercise?.muscle_group   || '',
    equipment:      exercise?.equipment      || '',
    difficulty:     exercise?.difficulty     || '',
    instructions:   exercise?.instructions   || '',
    coaching_notes: exercise?.coaching_notes || '',
    video_url:      exercise?.video_url      || '',
    image_url:      exercise?.image_url      || '',
  });
  const [imagePreview, setImagePreview] = useState(exercise?.image_url || '');
  const [uploadingImage, setUploadingImage] = useState(false);

  const handleImageFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_SIZE = 10 * 1024 * 1024; // 10 MB before compression
    if (file.size > MAX_SIZE) {
      toast.error('תמונה גדולה מדי — מקסימום 10MB לפני דחיסה');
      return;
    }
    if (!file.type.startsWith('image/')) {
      toast.error('יש לבחור קובץ תמונה (jpg/png/webp)');
      return;
    }

    setUploadingImage(true);
    try {
      const dataUrl = await readFileAsDataURL(file);
      setForm(f => ({ ...f, image_url: dataUrl }));
      setImagePreview(dataUrl);
    } catch {
      toast.error('שגיאה בטעינת התמונה');
    } finally {
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setForm(f => ({ ...f, image_url: '' }));
    setImagePreview('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name_he.trim()) { toast.error('נדרש שם תרגיל'); return; }
    onSave({ ...form, name_he: form.name_he.trim(), name: form.name.trim() || form.name_he.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Names */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">שם בעברית *</label>
          <Input
            value={form.name_he}
            onChange={e => setForm(f => ({ ...f, name_he: e.target.value }))}
            placeholder="לחיצת חזה"
            required
          />
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">שם באנגלית</label>
          <Input
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Bench Press"
          />
        </div>
      </div>

      {/* Muscle group + Equipment */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-semibold block mb-1">קבוצת שרירים</label>
          <Select value={form.muscle_group} onValueChange={v => setForm(f => ({ ...f, muscle_group: v }))}>
            <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
            <SelectContent>
              {MUSCLE_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-sm font-semibold block mb-1">ציוד</label>
          <Select value={form.equipment} onValueChange={v => setForm(f => ({ ...f, equipment: v }))}>
            <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
            <SelectContent>
              {EQUIPMENT_OPTIONS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Difficulty */}
      <div>
        <label className="text-sm font-semibold block mb-1">רמת קושי</label>
        <Select value={form.difficulty} onValueChange={v => setForm(f => ({ ...f, difficulty: v }))}>
          <SelectTrigger><SelectValue placeholder="בחר..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">מתחיל</SelectItem>
            <SelectItem value="intermediate">בינוני</SelectItem>
            <SelectItem value="advanced">מתקדם</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Image upload */}
      <div>
        <label className="text-sm font-semibold block mb-1">תמונה</label>
        {imagePreview ? (
          <div className="relative w-full h-40 rounded-xl overflow-hidden border border-slate-200">
            <img src={imagePreview} alt="" className="w-full h-full object-cover" />
            <button
              type="button"
              onClick={removeImage}
              className="absolute top-2 left-2 w-7 h-7 rounded-full bg-red-600 text-white flex items-center justify-center hover:bg-red-700"
            >
              <X className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="absolute top-2 right-2 text-xs bg-white/90 px-2 py-1 rounded-lg text-slate-700 hover:bg-white"
            >
              החלף
            </button>
          </div>
        ) : (
          <div
            onClick={() => fileRef.current?.click()}
            className="w-full h-28 rounded-xl border-2 border-dashed border-slate-200 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-orange-400 hover:bg-orange-50 transition-colors"
          >
            {uploadingImage ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-orange-500 rounded-full animate-spin" />
            ) : (
              <>
                <Image className="w-6 h-6 text-slate-400" />
                <p className="text-sm text-slate-500">לחץ להעלאת תמונה</p>
                <p className="text-xs text-slate-400">JPG / PNG / WebP · מקסימום 2MB</p>
              </>
            )}
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleImageFile}
        />
      </div>

      {/* Instructions */}
      <div>
        <label className="text-sm font-semibold block mb-1">הוראות ביצוע</label>
        <Textarea
          value={form.instructions}
          onChange={e => setForm(f => ({ ...f, instructions: e.target.value }))}
          placeholder="1. השכב על הספסל&#10;2. אחוז במוט..."
          rows={3}
          className="resize-none text-sm"
        />
      </div>

      {/* Coaching notes */}
      <div>
        <label className="text-sm font-semibold block mb-1">הערות מאמן (פרטיות)</label>
        <Textarea
          value={form.coaching_notes}
          onChange={e => setForm(f => ({ ...f, coaching_notes: e.target.value }))}
          placeholder="טיפים ואזהרות למאמן..."
          rows={2}
          className="resize-none text-sm"
        />
      </div>

      {/* Video URL */}
      <div>
        <label className="text-sm font-semibold block mb-1">קישור וידאו (YouTube)</label>
        <Input
          value={form.video_url}
          onChange={e => setForm(f => ({ ...f, video_url: e.target.value }))}
          placeholder="https://youtube.com/..."
          type="url"
        />
      </div>

      <div className="flex gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} className="flex-1">ביטול</Button>
        <Button type="submit" disabled={isPending} className="flex-1 bg-orange-500 hover:bg-orange-600 text-white">
          {isPending ? 'שומר...' : exercise ? 'עדכן תרגיל' : 'צור תרגיל'}
        </Button>
      </div>
    </form>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CoachExerciseLibrary() {
  const queryClient = useQueryClient();
  const [search, setSearch]             = useState('');
  const [muscleFilter, setMuscleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('active');
  const [showForm, setShowForm]         = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: exercises = [], isLoading } = useQuery({
    queryKey: ['exerciseLibrary', user?.email],
    queryFn: () => base44.entities.Exercise.filter(
      { canonical_id: null },  // no aliases
      '-created_at',
      500,
    ),
    enabled: !!user?.email,
  });

  // Filter
  const filtered = exercises.filter(ex => {
    const matchesStatus  = statusFilter === 'all' || ex.status === statusFilter;
    const matchesMuscle  = muscleFilter === 'all' || ex.muscle_group === muscleFilter;
    const matchesSearch  = !search.trim() ||
      (ex.name_he || '').toLowerCase().includes(search.toLowerCase()) ||
      (ex.name || '').toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesMuscle && matchesSearch;
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      const result = await base44.entities.Exercise.create({
        ...data,
        status: 'active',
        is_global: false,
        coach_email: user?.email,
        force_create: true,
      });
      // 409 means duplicate detected — treat as success (exercise created)
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success('✅ תרגיל נוצר');
      setShowForm(false);
      setEditingExercise(null);
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Exercise.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success('✅ תרגיל עודכן');
      setShowForm(false);
      setEditingExercise(null);
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const changeStatusMutation = useMutation({
    mutationFn: ({ id, status }) => base44.entities.Exercise.update(id, { status }),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['exerciseLibrary'] });
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success(status === 'active' ? 'תרגיל שוחזר' : 'תרגיל הועבר לארכיון');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const handleSave = (formData) => {
    if (editingExercise) {
      updateMutation.mutate({ id: editingExercise.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const openCreate = () => { setEditingExercise(null); setShowForm(true); };
  const openEdit   = (ex) => { setEditingExercise(ex); setShowForm(true); };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const activeCount   = exercises.filter(e => e.status === 'active').length;
  const archivedCount = exercises.filter(e => e.status === 'archived').length;

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto p-4">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">מאגר תרגילים</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {activeCount} פעילים · {archivedCount} בארכיון
            </p>
          </div>
          <Button onClick={openCreate} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="w-4 h-4 ml-2" />
            תרגיל חדש
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="חפש תרגיל..."
              className="pr-10"
            />
          </div>
          <Select value={muscleFilter} onValueChange={setMuscleFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="קבוצת שרירים" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">כל הקבוצות</SelectItem>
              {MUSCLE_GROUPS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
            {[{ k: 'active', l: 'פעילים' }, { k: 'archived', l: 'ארכיון' }, { k: 'all', l: 'הכל' }].map(f => (
              <button
                key={f.k}
                onClick={() => setStatusFilter(f.k)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  statusFilter === f.k ? 'bg-orange-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {f.l}
              </button>
            ))}
          </div>
        </div>

        {/* Exercise grid */}
        {isLoading ? (
          <div className="grid gap-3">
            {[1,2,3].map(i => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="flex gap-3">
                  <div className="w-16 h-16 rounded-lg bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-slate-200 rounded w-1/2" />
                    <div className="h-3 bg-slate-100 rounded w-1/3" />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <Card className="p-10 text-center border-2 border-dashed border-slate-200">
            <Dumbbell className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {exercises.length === 0
                ? 'אין תרגילים במאגר עדיין — לחץ "תרגיל חדש" להתחלה'
                : 'לא נמצאו תרגילים התואמים את הסינון'}
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filtered.map(ex => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onEdit={openEdit}
                onChangeStatus={(id, status) => changeStatusMutation.mutate({ id, status })}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditingExercise(null); } }}>
        <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingExercise ? 'עריכת תרגיל' : 'תרגיל חדש'}</DialogTitle>
          </DialogHeader>
          <ExerciseForm
            exercise={editingExercise}
            onSave={handleSave}
            onClose={() => { setShowForm(false); setEditingExercise(null); }}
            isPending={isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
