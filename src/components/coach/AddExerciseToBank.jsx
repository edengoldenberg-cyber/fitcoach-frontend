import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, CheckCircle, PlusCircle } from 'lucide-react';

const MUSCLE_GROUPS = ['חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'רגליים', 'ישבן', 'ליבה', 'אירובי', 'אחר'];
const MOVEMENT_PATTERNS = ['דחיפה', 'משיכה', 'לחיצה', 'כפיפה', 'קומפאונד', 'בידוד', 'אחר'];
const EQUIPMENT_OPTIONS = ['כבל קרוס', 'פולי עליון', 'פולי תחתון', 'מוט חופשי', 'משקולות יד', 'סמית', 'מכונה', 'משקל גוף', 'גומיה', 'אירובי', 'חבל', 'חתירה'];

// ── Similar-exercise decision dialog ─────────────────────────────────────────

function SimilarExerciseDialog({ open, matches, queryName, onUseExisting, onAddAlias, onCreateNew, onClose }) {
  const best = matches?.[0];
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="w-5 h-5" />
            תרגיל דומה כבר קיים
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            מצאנו תרגיל דומה ל-<strong>"{queryName}"</strong> כבר קיים במאגר:
          </p>

          {matches?.slice(0, 3).map(m => (
            <div key={m.id} className="border rounded-lg p-3 bg-slate-50">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">{m.name_he || m.name || m.id}</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                  {m._score}% דמיון
                </span>
              </div>
              {m.muscle_group && (
                <p className="text-xs text-slate-500 mt-1">קבוצת שרירים: {m.muscle_group}</p>
              )}
              {m.aliases && Array.isArray(m.aliases) && m.aliases.length > 0 && (
                <p className="text-xs text-slate-400 mt-0.5">כינויים: {m.aliases.slice(0, 3).join(', ')}</p>
              )}
            </div>
          ))}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
            <p className="font-medium mb-1">מה ברצונך לעשות?</p>
            <p className="text-xs text-blue-600">
              לשמירת מאגר נקי, מומלץ להשתמש בתרגיל קיים או להוסיף כינוי.
            </p>
          </div>

          <div className="space-y-2">
            <Button
              className="w-full justify-start gap-2"
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              onClick={() => onUseExisting(best)}
            >
              <CheckCircle className="w-4 h-4" />
              השתמש בתרגיל הקיים ({best?.name_he || best?.name})
            </Button>

            <Button
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => onAddAlias(best)}
            >
              <PlusCircle className="w-4 h-4" />
              הוסף "{queryName}" ככינוי לתרגיל הקיים
            </Button>

            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-slate-500"
              onClick={onCreateNew}
            >
              צור תרגיל עצמאי חדש (בכל זאת)
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function AddExerciseToBank({ open, onClose, initialName = '', onSuccess }) {
  const [formData, setFormData] = useState({
    name_he: initialName,
    muscle_group_primary: '',
    movement_pattern: '',
    equipment: [],
  });
  const [similarMatches, setSimilarMatches] = useState([]);
  const [showSimilarDialog, setShowSimilarDialog] = useState(false);
  const [pendingCreate, setPendingCreate] = useState(false);

  const queryClient = useQueryClient();

  // ── Similarity check ──────────────────────────────────────────────────────
  const checkSimilarMutation = useMutation({
    mutationFn: async (payload) => {
      const res = await base44.functions.invoke('findSimilarExercise', {
        query_name: payload.name_he,
        muscle_group: payload.muscle_group_primary,
        threshold: 0.75,
      });
      return res;
    },
  });

  // ── Create exercise ────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async (data) => {
      const existing = await base44.entities.Exercise.list();
      const normalized = data.name_he.trim().toLowerCase();
      const duplicate = existing.find(ex =>
        (ex.name_he || '').trim().toLowerCase() === normalized
      );
      if (duplicate) throw new Error(`התרגיל "${duplicate.name_he}" כבר קיים במאגר`);

      return base44.entities.Exercise.create(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success('✅ תרגיל נוסף לבנק');
      if (onSuccess) onSuccess(data);
      handleClose();
    },
    onError: (err) => {
      toast.error(err.message || '❌ שגיאה ביצירת תרגיל');
    },
  });

  // ── Add alias mutation ─────────────────────────────────────────────────────
  const addAliasMutation = useMutation({
    mutationFn: async ({ exercise_id, alias }) =>
      base44.functions.invoke('addExerciseAlias', { exercise_id, alias }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success('✅ כינוי נוסף לתרגיל הקיים');
      handleClose();
    },
    onError: (err) => toast.error(err.message || '❌ שגיאה בהוספת כינוי'),
  });

  // ── Form submit: check similarity first ───────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name_he.trim() || !formData.muscle_group_primary) {
      toast.error('❌ נא למלא שם תרגיל וקבוצת שרירים');
      return;
    }

    setPendingCreate(true);
    try {
      const res = await checkSimilarMutation.mutateAsync(formData);
      const matches = res?.data?.matches || res?.matches || [];
      if (matches.length > 0) {
        setSimilarMatches(matches);
        setShowSimilarDialog(true);
        return;
      }
    } catch {
      // similarity check failure is non-blocking — proceed to create
    }

    doCreate();
  };

  const doCreate = () => {
    createMutation.mutate({
      name_he:         formData.name_he.trim(),
      muscle_group_primary: formData.muscle_group_primary,
      movement_pattern: formData.movement_pattern || null,
      equipment:       formData.equipment,
      status:          'active',
    });
  };

  const handleUseExisting = (ex) => {
    setShowSimilarDialog(false);
    if (onSuccess) onSuccess(ex);
    handleClose();
    toast.info(`נבחר תרגיל קיים: ${ex.name_he || ex.name}`);
  };

  const handleAddAlias = (ex) => {
    setShowSimilarDialog(false);
    addAliasMutation.mutate({ exercise_id: ex.id, alias: formData.name_he.trim() });
  };

  const handleCreateNew = () => {
    setShowSimilarDialog(false);
    doCreate();
  };

  const handleClose = () => {
    setFormData({ name_he: '', muscle_group_primary: '', movement_pattern: '', equipment: [] });
    setSimilarMatches([]);
    setShowSimilarDialog(false);
    setPendingCreate(false);
    onClose();
  };

  const toggleEquipment = (item) => {
    setFormData(prev => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter(e => e !== item)
        : [...prev.equipment, item],
    }));
  };

  const isLoading = createMutation.isPending || addAliasMutation.isPending || checkSimilarMutation.isPending;

  return (
    <>
      <Dialog open={open && !showSimilarDialog} onOpenChange={handleClose}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold" style={{ color: '#79DBD6' }}>
              הוסף תרגיל לבנק
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>שם התרגיל (עברית) *</Label>
              <Input
                value={formData.name_he}
                onChange={(e) => setFormData({ ...formData, name_he: e.target.value })}
                placeholder="לדוגמה: לחיצת חזה במכונה"
                className="mt-1"
              />
            </div>

            <div>
              <Label>קבוצת שרירים ראשית *</Label>
              <Select
                value={formData.muscle_group_primary}
                onValueChange={(val) => setFormData({ ...formData, muscle_group_primary: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחר קבוצת שרירים" />
                </SelectTrigger>
                <SelectContent>
                  {MUSCLE_GROUPS.map(group => (
                    <SelectItem key={group} value={group}>{group}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>דפוס תנועה</Label>
              <Select
                value={formData.movement_pattern}
                onValueChange={(val) => setFormData({ ...formData, movement_pattern: val })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="בחר דפוס (אופציונלי)" />
                </SelectTrigger>
                <SelectContent>
                  {MOVEMENT_PATTERNS.map(pattern => (
                    <SelectItem key={pattern} value={pattern}>{pattern}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>ציוד (בחר אחד או יותר)</Label>
              <div className="grid grid-cols-2 gap-2 mt-2 max-h-40 overflow-y-auto border rounded-lg p-3">
                {EQUIPMENT_OPTIONS.map(item => (
                  <div key={item} className="flex items-center gap-2">
                    <Checkbox
                      checked={formData.equipment.includes(item)}
                      onCheckedChange={() => toggleEquipment(item)}
                    />
                    <span className="text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={isLoading}
                className="flex-1"
              >
                ביטול
              </Button>
              <Button
                type="submit"
                disabled={isLoading}
                className="flex-1"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    {checkSimilarMutation.isPending ? 'בודק כפילויות...' : 'שומר...'}
                  </>
                ) : 'הוסף לבנק'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <SimilarExerciseDialog
        open={showSimilarDialog}
        matches={similarMatches}
        queryName={formData.name_he}
        onUseExisting={handleUseExisting}
        onAddAlias={handleAddAlias}
        onCreateNew={handleCreateNew}
        onClose={() => { setShowSimilarDialog(false); setPendingCreate(false); }}
      />
    </>
  );
}
