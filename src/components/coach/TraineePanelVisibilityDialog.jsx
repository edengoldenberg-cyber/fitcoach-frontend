import React, { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dumbbell, Droplets, Scale, Utensils, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';

const MODULES = [
  { key: 'nutrition', label: 'תזונה', description: 'יומן אוכל, קלוריות וחלבון', icon: Utensils, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  { key: 'water', label: 'מים', description: 'מעקב שתיית מים', icon: Droplets, color: 'text-blue-600 bg-blue-50 border-blue-100' },
  { key: 'workouts', label: 'אימונים', description: 'אימון יומי ותיעוד תרגילים', icon: Dumbbell, color: 'text-orange-600 bg-orange-50 border-orange-100' },
  { key: 'metrics', label: 'מדדים', description: 'משקל ומדדי גוף', icon: Scale, color: 'text-purple-600 bg-purple-50 border-purple-100' },
];

const DEFAULT_MODULES = {
  nutrition: true,
  water: true,
  workouts: true,
  metrics: true,
};

export default function TraineePanelVisibilityDialog({ open, onClose, trainee, onSaved }) {
  const queryClient = useQueryClient();
  const [modules, setModules] = useState(DEFAULT_MODULES);

  useEffect(() => {
    if (!open || !trainee) return;
    setModules({ ...DEFAULT_MODULES, ...(trainee.visible_modules || {}) });
  }, [open, trainee]);

  const updateMutation = useMutation({
    mutationFn: () => base44.entities.Trainee.update(trainee.id, { visible_modules: modules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      toast.success('הפאנלים עודכנו בהצלחה');
      onSaved?.();
      onClose();
    },
    onError: () => toast.error('שגיאה בעדכון הפאנלים'),
  });

  if (!trainee) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-teal-500" />
            עריכת פאנלים - {trainee.full_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <p className="text-sm text-slate-500">בחר אילו אזורים המתאמן יראה באפליקציה:</p>

          {MODULES.map(({ key, label, description, icon: Icon, color }) => (
            <Card key={key} className={`p-3 border ${color}`}>
              <label className="flex items-center justify-between gap-3 cursor-pointer">
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-bold text-sm text-slate-800">{label}</p>
                    <p className="text-xs text-slate-500">{description}</p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={modules[key] !== false}
                  onChange={(e) => setModules(prev => ({ ...prev, [key]: e.target.checked }))}
                  className="w-5 h-5 rounded border-slate-300 flex-shrink-0"
                />
              </label>
            </Card>
          ))}

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            פאנל כבוי יוסתר מהמתאמן בתפריט ובמסך הבית כשאפשר.
          </div>

          <Button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="w-full text-white"
            style={{ backgroundColor: '#79DBD6' }}
          >
            {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin ml-2" />}
            שמור פאנלים
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}