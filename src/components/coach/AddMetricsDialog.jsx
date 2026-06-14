import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Scale } from "lucide-react";
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { getIsraelDateString, invalidateCoachTraineeSyncQueries, logSyncEvent } from '@/utils/nutritionSync';

export default function AddMetricsDialog({ open, onClose, traineeEmail, traineeName, trainee }) {
  const queryClient = useQueryClient();
  const today = getIsraelDateString();
  
  const [formData, setFormData] = useState({
    date: today,
    weight_kg: '',
    body_fat_percent: '',
    water_percent: '',
    muscle_mass_kg: '',
    body_age_years: '',
    notes: '',
  });

  const addMetrics = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.MetricsEntry.create({
        trainee_id: trainee?.id,
        user_id: trainee?.user_id,
        trainee_email: trainee?.user_email || traineeEmail,
        coach_email: trainee?.coach_email,
        date: data.date,
        weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : undefined,
        body_fat_percent: data.body_fat_percent ? parseFloat(data.body_fat_percent) : undefined,
        water_percent: data.water_percent ? parseFloat(data.water_percent) : undefined,
        muscle_mass_kg: data.muscle_mass_kg ? parseFloat(data.muscle_mass_kg) : undefined,
        body_age_years: data.body_age_years ? parseInt(data.body_age_years) : undefined,
        notes: data.notes || undefined,
        source: 'coach',
      });
    },
    onSuccess: () => {
      invalidateCoachTraineeSyncQueries(queryClient);
      queryClient.invalidateQueries({ queryKey: ['allMeasurementsWeek', trainee?.id] });
      queryClient.invalidateQueries({ queryKey: ['metricsEntries', trainee?.user_email, trainee?.id] });
      logSyncEvent({ entity: 'MetricsEntry', trainee_id: trainee?.id, coach_id: trainee?.coach_email, source: 'coach_metrics', write_success: true, refresh_success: true, visible_to_coach: true, visible_to_trainee: true });
      toast.success('✅ נתוני שקילה נשמרו בהצלחה');
      resetForm();
      onClose();
    },
    onError: (error) => {
      console.error('Failed to save metrics:', error);
      toast.error('❌ שגיאה בשמירת נתוני שקילה');
    },
  });

  const resetForm = () => {
    setFormData({
      date: today,
      weight_kg: '',
      body_fat_percent: '',
      water_percent: '',
      muscle_mass_kg: '',
      body_age_years: '',
      notes: '',
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation - at least weight is required
    if (!formData.weight_kg) {
      toast.error('חובה להזין לפחות משקל');
      return;
    }

    addMetrics.mutate(formData);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-blue-600" />
            הוסף נתוני שקילה - {traineeName}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>תאריך <span className="text-red-500">*</span></Label>
            <Input
              type="date"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
              required
            />
          </div>

          <div>
            <Label>משקל (ק״ג) <span className="text-red-500">*</span></Label>
            <Input
              type="number"
              step="0.1"
              placeholder="75.5"
              value={formData.weight_kg}
              onChange={(e) => setFormData({ ...formData, weight_kg: e.target.value })}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>אחוז שומן (%)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="18.5"
                value={formData.body_fat_percent}
                onChange={(e) => setFormData({ ...formData, body_fat_percent: e.target.value })}
              />
            </div>

            <div>
              <Label>אחוז מים (%)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="60.0"
                value={formData.water_percent}
                onChange={(e) => setFormData({ ...formData, water_percent: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>מסת שריר (ק״ג)</Label>
              <Input
                type="number"
                step="0.1"
                placeholder="55.0"
                value={formData.muscle_mass_kg}
                onChange={(e) => setFormData({ ...formData, muscle_mass_kg: e.target.value })}
              />
            </div>

            <div>
              <Label>גיל מטבולי</Label>
              <Input
                type="number"
                placeholder="25"
                value={formData.body_age_years}
                onChange={(e) => setFormData({ ...formData, body_age_years: e.target.value })}
              />
            </div>
          </div>

          <div>
            <Label>הערות</Label>
            <Textarea
              placeholder="הערות על השקילה..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={addMetrics.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {addMetrics.isPending ? 'שומר...' : 'שמור'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}