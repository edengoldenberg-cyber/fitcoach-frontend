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
import { Loader2 } from 'lucide-react';

const MUSCLE_GROUPS = ['חזה', 'גב', 'כתפיים', 'יד קדמית', 'יד אחורית', 'רגליים', 'ישבן', 'ליבה', 'אירובי', 'אחר'];
const MOVEMENT_PATTERNS = ['דחיפה', 'משיכה', 'לחיצה', 'כפיפה', 'קומפאונד', 'בידוד', 'אחר'];
const EQUIPMENT_OPTIONS = ['כבל קרוס', 'פולי עליון', 'פולי תחתון', 'מוט חופשי', 'משקולות יד', 'סמית', 'מכונה', 'משקל גוף', 'גומיה', 'אירובי', 'חבל', 'חתירה'];

const normalizeName = (name) => {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

export default function AddExerciseToBank({ open, onClose, initialName = '', onSuccess }) {
  const [formData, setFormData] = useState({
    name_he: initialName,
    muscle_group_primary: '',
    movement_pattern: '',
    equipment: []
  });

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data) => {
      console.log('[CREATE_NEW_EXERCISE]', data);
      
      // Check for duplicates
      const existing = await base44.entities.Exercise.list();
      const normalized = normalizeName(data.name_he);
      const duplicate = existing.find(ex => 
        normalizeName(ex.name_he) === normalized
      );

      if (duplicate) {
        console.log('[DUPLICATE_BLOCKED]', { 
          name: data.name_he, 
          existingId: duplicate.id 
        });
        throw new Error(`התרגיל "${duplicate.name_he}" כבר קיים במאגר`);
      }

      return base44.entities.Exercise.create(data);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      toast.success('✅ תרגיל נוסף לבנק');
      if (onSuccess) onSuccess(data);
      handleClose();
    },
    onError: (err) => {
      console.error('[CREATE_EXERCISE_ERROR]', err);
      toast.error(err.message || '❌ שגיאה ביצירת תרגיל');
    }
  });

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!formData.name_he.trim() || !formData.muscle_group_primary || !formData.movement_pattern) {
      toast.error('❌ נא למלא את כל השדות');
      return;
    }

    createMutation.mutate({
      ...formData,
      status: 'active',
      is_default: false
    });
  };

  const handleClose = () => {
    setFormData({
      name_he: '',
      muscle_group_primary: '',
      movement_pattern: '',
      equipment: []
    });
    onClose();
  };

  const toggleEquipment = (item) => {
    setFormData(prev => ({
      ...prev,
      equipment: prev.equipment.includes(item)
        ? prev.equipment.filter(e => e !== item)
        : [...prev.equipment, item]
    }));
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold" style={{ color: '#79DBD6' }}>
            הוסף תרגיל לבנק
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>שם התרגיל *</Label>
            <Input
              value={formData.name_he}
              onChange={(e) => setFormData({ ...formData, name_he: e.target.value })}
              placeholder="לדוגמה: לחיצת חזה במכונה"
              className="mt-1"
            />
          </div>

          <div>
            <Label>קבוצת שרירים *</Label>
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
            <Label>דפוס תנועה *</Label>
            <Select 
              value={formData.movement_pattern} 
              onValueChange={(val) => setFormData({ ...formData, movement_pattern: val })}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="בחר דפוס תנועה" />
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
              disabled={createMutation.isPending}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1"
              style={{ backgroundColor: '#79DBD6' }}
            >
              {createMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  שומר...
                </>
              ) : (
                'הוסף לבנק'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}