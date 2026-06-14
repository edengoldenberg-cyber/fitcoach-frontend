import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Upload } from 'lucide-react';

const normalizeName = (name) => {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

export default function ImportExercisesCSV({ open, onClose }) {
  const [csvText, setCsvText] = useState('');
  const queryClient = useQueryClient();

  const importMutation = useMutation({
    mutationFn: async (csvData) => {
      console.log('[IMPORT_CSV_START]', { length: csvData.length });
      
      const lines = csvData.trim().split('\n');
      const headers = lines[0].split(',').map(h => h.trim());
      
      if (!headers.includes('name') || !headers.includes('category')) {
        throw new Error('CSV חייב להכיל עמודות: name,category');
      }

      const existing = await base44.entities.Exercise.list();
      const existingNormalized = new Set(existing.map(ex => normalizeName(ex.name_he)));

      const exercises = [];
      const skipped = [];

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',').map(v => v.trim());
        const exercise = {};
        headers.forEach((header, idx) => {
          exercise[header] = values[idx] || '';
        });

        const normalized = normalizeName(exercise.name);
        
        if (existingNormalized.has(normalized)) {
          skipped.push(exercise.name);
          continue;
        }

        const equipment = exercise.equipment 
          ? exercise.equipment.split('|').map(e => e.trim()).filter(Boolean)
          : [];

        exercises.push({
          name_he: exercise.name,
          muscle_group_primary: exercise.category || 'אחר',
          equipment: equipment,
          movement_pattern: 'אחר',
          is_default: false,
          status: 'active'
        });

        existingNormalized.add(normalized);
      }

      if (exercises.length === 0) {
        throw new Error('לא נמצאו תרגילים חדשים לייבא');
      }

      const created = await base44.entities.Exercise.bulkCreate(exercises);
      
      console.log('[IMPORT_CSV_DONE]', { 
        created: created.length, 
        skipped: skipped.length 
      });

      return { created: created.length, skipped };
    },
    onSuccess: ({ created, skipped }) => {
      queryClient.invalidateQueries({ queryKey: ['allExercises'] });
      
      const message = [
        `✔ התרגילים נוספו בהצלחה`,
        `נוספו: ${created}`,
        `דולגו (כפילויות): ${skipped.length}`,
      ].join('\n');
      
      toast.success(message, {
        duration: 5000,
        style: { whiteSpace: 'pre-line' }
      });
      
      handleClose();
    },
    onError: (err) => {
      console.error('[IMPORT_CSV_ERROR]', err);
      
      const message = [
        '❌ שגיאה ביבוא תרגילים',
        `סיבה: ${err.message || 'שגיאה לא ידועה'}`
      ].join('\n');
      
      toast.error(message, {
        duration: 6000,
        style: { whiteSpace: 'pre-line' }
      });
    }
  });

  const handleImport = () => {
    if (!csvText.trim()) {
      toast.error('❌ הדבק CSV קודם');
      return;
    }
    importMutation.mutate(csvText);
  };

  const handleClose = () => {
    setCsvText('');
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold" style={{ color: '#79DBD6' }}>
            ייבוא תרגילים מ-CSV
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-slate-50 p-4 rounded-lg text-sm">
            <p className="font-medium mb-2">פורמט CSV נדרש:</p>
            <pre className="bg-white p-2 rounded border text-xs">
name,category,equipment{'\n'}
סקוואט,רגליים,מוט חופשי{'\n'}
לחיצת חזה,חזה,מוט חופשי{'\n'}
מתח,גב,משקל גוף
            </pre>
            <p className="text-xs text-slate-600 mt-2">
              * equipment יכול להיות מספר פריטים מופרדים ב-|
            </p>
          </div>

          <div>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="הדבק כאן את ה-CSV..."
              className="min-h-[200px] font-mono text-sm"
            />
          </div>

          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handleClose}
              disabled={importMutation.isPending}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
              className="flex-1"
              style={{ backgroundColor: '#79DBD6' }}
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                  מייבא...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 ml-2" />
                  ייבא תרגילים
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}