import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { ClipboardPaste, Upload, AlertCircle } from 'lucide-react';

const CATEGORIES = ["חלבון", "פחמימה", "שומן", "ממרח", "חלב ומוצריו", "ירקות", "פירות", "קטניות", "דגנים", "משקאות", "מתוקים", "מנות מוכנות", "תוספים", "רטבים"];

export default function BulkPasteFoods({ open, onClose, onSuccess }) {
  const [pastedData, setPastedData] = useState('');
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [result, setResult] = useState(null);

  const normalizeNumber = (value) => {
    if (!value || value.trim() === '') return 0;
    const trimmed = value
      .trim()
      .replace(/[%]/g, '')
      .replace(/[a-zA-Zא-ת]/g, '')
      .replace(',', '.')
      .trim();
    if (trimmed === '') return 0;
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  };

  const normalizeName = (name) => {
    if (!name) return '';
    return name.trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
  };

  const handleParse = async () => {
    if (!pastedData.trim()) {
      toast.error('נא להדביק נתונים');
      return;
    }

    setProcessing(true);
    setProgress({ current: 0, total: 0 });
    setResult(null);

    try {
      // Count before import
      const beforeCount = await base44.entities.FoodItem.list();
      const beforeTotal = beforeCount.length;

      // Parse lines
      const lines = pastedData.split('\n').map(l => l.trim()).filter(l => l);
      
      if (lines.length === 0) {
        toast.error('אין שורות תקינות');
        setProcessing(false);
        return;
      }

      // Check if first line is header
      const firstLine = lines[0].toLowerCase();
      const hasHeader = firstLine.includes('name_he') || firstLine.includes('category');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      if (dataLines.length === 0) {
        toast.error('אין נתונים להכנסה');
        setProcessing(false);
        return;
      }

      setProgress({ current: 0, total: dataLines.length });

      const errors = [];
      const validItems = [];
      const seenKeys = new Set();

      // Get existing items for duplicate check
      const existingItems = await base44.entities.FoodItem.list();
      const existingKeys = new Set(
        existingItems
          .filter(item => item.normalized_name && item.category)
          .map(item => `${item.normalized_name}|${item.category}`)
      );

      // Parse each line
      for (let i = 0; i < dataLines.length; i++) {
        const line = dataLines[i];
        const values = line.split(',').map(v => v.trim());

        if (values.length < 6) {
          errors.push({ line: i + 2, reason: 'חסרים ערכים (נדרשים 6 לפחות)' });
          continue;
        }

        const [name_he, category, kcal, protein, carbs, fat, ...rest] = values;
        
        // Validation
        if (!name_he) {
          errors.push({ line: i + 2, reason: 'חסר שם מוצר' });
          continue;
        }

        if (!category || !CATEGORIES.includes(category)) {
          errors.push({ line: i + 2, reason: `קטגוריה לא תקינה: ${category}` });
          continue;
        }

        const parsedKcal = normalizeNumber(kcal);
        if (parsedKcal === null || parsedKcal < 0) {
          errors.push({ line: i + 2, reason: `קלוריות לא תקינות: ${kcal}` });
          continue;
        }

        const parsedProtein = normalizeNumber(protein);
        const parsedCarbs = normalizeNumber(carbs);
        const parsedFat = normalizeNumber(fat);

        const normalized = normalizeName(name_he);
        const uniqueKey = `${normalized}|${category}`;

        // Check duplicates
        if (seenKeys.has(uniqueKey)) {
          errors.push({ line: i + 2, reason: `כפילות בתוך הטקסט: ${name_he}` });
          continue;
        }

        if (existingKeys.has(uniqueKey)) {
          errors.push({ line: i + 2, reason: `כבר קיים במאגר: ${name_he}`, duplicate: true });
          continue;
        }

        seenKeys.add(uniqueKey);

        validItems.push({
          name_he,
          normalized_name: normalized,
          category,
          per100_kcal: parsedKcal,
          per100_protein: parsedProtein !== null ? parsedProtein : 0,
          per100_carbs: parsedCarbs !== null ? parsedCarbs : 0,
          per100_fat: parsedFat !== null ? parsedFat : 0,
          brand: rest[0] || '',
          barcodes: rest[1] ? [rest[1].trim()] : [],
          source: 'manual',
          active: true,
        });
      }

      // Insert in batches
      const BATCH_SIZE = 25;
      let inserted = 0;
      const insertErrors = [];

      for (let i = 0; i < validItems.length; i += BATCH_SIZE) {
        const batch = validItems.slice(i, i + BATCH_SIZE);
        setProgress({ current: i + batch.length, total: validItems.length });

        try {
          await base44.entities.FoodItem.bulkCreate(batch);
          inserted += batch.length;
        } catch (err) {
          // Try one by one if bulk fails
          for (const item of batch) {
            try {
              await base44.entities.FoodItem.create(item);
              inserted++;
            } catch (itemErr) {
              insertErrors.push({ name: item.name_he, reason: itemErr.message });
            }
          }
        }

        // Small delay between batches
        if (i + BATCH_SIZE < validItems.length) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      const duplicates = errors.filter(e => e.duplicate).length;
      const failed = errors.filter(e => !e.duplicate).length + insertErrors.length;

      // Update system stats
      try {
        const statsRecords = await base44.entities.SystemStats.filter({ stat_key: 'food_database' });
        const afterCount = await base44.entities.FoodItem.list();
        const afterTotal = afterCount.length;

        // Calculate category counts
        const categoryCounts = {};
        afterCount.forEach(item => {
          const cat = item.category || 'אחר';
          categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
        });

        if (statsRecords.length > 0) {
          await base44.entities.SystemStats.update(statsRecords[0].id, {
            total_products: afterTotal,
            category_counts: categoryCounts,
            last_import_count: inserted,
            last_import_time: new Date().toISOString(),
            last_import_duplicates: duplicates,
            last_import_failed: failed,
          });
        } else {
          await base44.entities.SystemStats.create({
            stat_key: 'food_database',
            total_products: afterTotal,
            category_counts: categoryCounts,
            last_import_count: inserted,
            last_import_time: new Date().toISOString(),
            last_import_duplicates: duplicates,
            last_import_failed: failed,
          });
        }
      } catch (statsErr) {
        console.error('Failed to update stats:', statsErr);
      }

      setResult({
        added: inserted,
        duplicates,
        failed,
        errors: [...errors, ...insertErrors.map(e => ({ reason: `Failed: ${e.name} - ${e.reason}` }))]
      });

      if (inserted > 0) {
        toast.success(`✅ נוספו ${inserted} מוצרים חדשים`);
        if (onSuccess) onSuccess();
      } else {
        toast.warning('לא נוספו מוצרים חדשים');
      }
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  const handleReset = () => {
    setPastedData('');
    setResult(null);
    setProgress({ current: 0, total: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הדבק מוצרים בכמות</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
            <p className="font-medium text-blue-900 mb-2">פורמט נדרש (CSV):</p>
            <code className="text-xs text-blue-800 block bg-white p-2 rounded font-mono">
              name_he,category,per100_kcal,per100_protein,per100_carbs,per100_fat,brand,barcode
            </code>
            <p className="text-xs text-blue-700 mt-2">דוגמה:</p>
            <code className="text-xs text-blue-800 block bg-white p-2 rounded font-mono mt-1">
              חזה עוף,חלבון,165,31,0,3.6,תנובה,7290000000000
            </code>
          </div>

          {!result && (
            <>
              <div>
                <Label>הדבק טבלה (CSV)</Label>
                <Textarea
                  value={pastedData}
                  onChange={(e) => setPastedData(e.target.value)}
                  placeholder="הדבק כאן את הטבלה בפורמט CSV..."
                  className="h-64 font-mono text-sm"
                  disabled={processing}
                />
              </div>

              {processing && (
                <div className="p-4 bg-teal-50 border border-teal-200 rounded-lg text-center">
                  <p className="text-sm font-medium text-teal-800 mb-2">
                    מעבד שורה {progress.current} מתוך {progress.total}
                  </p>
                  <div className="w-full bg-teal-200 rounded-full h-2">
                    <div 
                      className="bg-teal-600 h-2 rounded-full transition-all"
                      style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              )}
            </>
          )}

          {result && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{result.added}</p>
                  <p className="text-xs text-green-700">נוספו</p>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <p className="text-2xl font-bold text-orange-600">{result.duplicates}</p>
                  <p className="text-xs text-orange-700">כפילויות</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{result.failed}</p>
                  <p className="text-xs text-red-700">נכשלו</p>
                </div>
              </div>

              {result.errors.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    שגיאות ({result.errors.length})
                  </div>
                  <div className="max-h-48 overflow-y-auto bg-red-50">
                    {result.errors.slice(0, 20).map((err, idx) => (
                      <div key={idx} className="p-2 border-t text-xs text-red-700">
                        {err.line && `שורה ${err.line}: `}{err.reason}
                      </div>
                    ))}
                    {result.errors.length > 20 && (
                      <div className="p-2 border-t text-xs text-red-600 text-center">
                        ועוד {result.errors.length - 20}...
                      </div>
                    )}
                  </div>
                </div>
              )}

              <Button onClick={handleReset} variant="outline" className="w-full">
                הדבק עוד
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {!result && (
            <>
              <Button variant="outline" onClick={onClose} disabled={processing}>ביטול</Button>
              <Button onClick={handleParse} disabled={processing || !pastedData.trim()} className="bg-teal-600 hover:bg-teal-700">
                <Upload className="w-4 h-4 ml-2" />
                {processing ? 'מעבד...' : 'בדוק והכנס'}
              </Button>
            </>
          )}
          {result && (
            <Button onClick={onClose} className="bg-teal-600 hover:bg-teal-700">סגור</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}