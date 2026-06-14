import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Upload, Search, Trash2, AlertCircle, Copy } from 'lucide-react';

export default function ImportUnitsCSV() {
  const [csvText, setCsvText] = useState('');
  const [previewResults, setPreviewResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: existingUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
  });

  const normalizeText = (text) => {
    if (!text) return '';
    return text.trim().toLowerCase();
  };

  const handlePreview = async () => {
    const startTime = Date.now();
    
    if (!csvText.trim()) {
      toast.error('נא להדביק CSV');
      return;
    }

    setChecking(true);
    setPreviewResults(null);
    toast.loading('בודק CSV...', { id: 'preview' });

    try {
      const lines = csvText.trim().split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        toast.error('CSV חייב להכיל כותרת ולפחות שורה אחת', { id: 'preview' });
        setChecking(false);
        return;
      }

      // Validate header
      const header = lines[0].trim().toLowerCase();
      const expectedHeader = 'name_he,default_grams,description';
      
      if (!header.startsWith('name_he,default_grams')) {
        await base44.entities.ImportLog.create({
          import_type: 'units',
          stage: 'preview',
          rows_total: lines.length - 1,
          rows_errors: lines.length - 1,
          status: 'error',
          errors_json: [{ row: 1, message: 'Invalid header', raw: lines[0] }],
          duration_ms: Date.now() - startTime,
          user_email: user?.email
        });
        
        toast.error('כותרת לא תקינה', { id: 'preview' });
        setPreviewResults({
          valid: [],
          errors: [{
            row: 1,
            message: `כותרת לא תקינה. נדרש: ${expectedHeader}`,
            raw: lines[0]
          }]
        });
        setChecking(false);
        return;
      }

      const rows = lines.slice(1);
      const results = {
        valid: [],
        errors: [],
        willAdd: 0,
        willUpdate: 0,
        total: rows.length
      };

      for (let idx = 0; idx < rows.length; idx++) {
        const line = rows[idx];
        const rowNum = idx + 2;
        
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length < 2) {
          results.errors.push({
            row: rowNum,
            message: 'שורה לא תקינה - חסרים שדות (נדרשות לפחות 2 עמודות)',
            raw: line
          });
          continue;
        }

        const [nameHe, gramsStr, description] = parts;

        if (!nameHe) {
          results.errors.push({ row: rowNum, message: 'חסר name_he', raw: line });
          continue;
        }

        const grams = parseFloat(gramsStr);
        if (isNaN(grams) || grams <= 0) {
          results.errors.push({ 
            row: rowNum, 
            message: `default_grams לא תקין: "${gramsStr}"`,
            raw: line 
          });
          continue;
        }

        // Check if exists
        const existing = existingUnits.find(u => normalizeText(u.name_he) === normalizeText(nameHe));

        const validRow = {
          row: rowNum,
          nameHe,
          defaultGrams: grams,
          description: description || '',
          willUpdate: !!existing,
          existingId: existing?.id,
          oldGrams: existing?.default_grams
        };

        results.valid.push(validRow);

        if (existing) {
          results.willUpdate++;
        } else {
          results.willAdd++;
        }
      }

      await base44.entities.ImportLog.create({
        import_type: 'units',
        stage: 'preview',
        rows_total: rows.length,
        rows_ok: results.valid.length,
        rows_added: results.willAdd,
        rows_updated: results.willUpdate,
        rows_errors: results.errors.length,
        errors_json: results.errors.slice(0, 20),
        status: results.errors.length === 0 ? 'ok' : 'error',
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });

      setPreviewResults(results);
      
      if (results.errors.length === 0) {
        toast.success(`✅ ${results.valid.length} תקינים | ${results.willAdd} חדשים | ${results.willUpdate} עדכונים`, { id: 'preview' });
      } else {
        toast.warning(`⚠️ ${results.valid.length} תקינים, ${results.errors.length} שגיאות`, { id: 'preview' });
      }
    } catch (err) {
      console.error('[ImportUnits] Preview error:', err);
      toast.error(`שגיאה: ${err.message}`, { id: 'preview' });
      
      await base44.entities.ImportLog.create({
        import_type: 'units',
        stage: 'preview',
        rows_total: 0,
        rows_errors: 1,
        status: 'error',
        errors_json: [{ row: 0, message: err.message }],
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (!previewResults || previewResults.errors.length > 0) {
      toast.error('לא ניתן לייבא - יש שגיאות ב-Preview');
      return;
    }

    if (previewResults.valid.length === 0) {
      toast.error('אין שורות תקינות לייבוא');
      return;
    }

    const startTime = Date.now();
    setImporting(true);
    toast.loading('מייבא יחידות...', { id: 'import' });

    const results = {
      added: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    try {
      for (const row of previewResults.valid) {
        try {
          const payload = {
            name_he: row.nameHe,
            default_grams: row.defaultGrams,
            description: row.description,
            is_active: true
          };

          if (row.willUpdate) {
            await base44.entities.FoodUnit.update(row.existingId, payload);
            results.updated++;
          } else {
            await base44.entities.FoodUnit.create(payload);
            results.added++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push({
            row: row.row,
            name: row.nameHe,
            message: err.message
          });
        }
      }

      await base44.entities.ImportLog.create({
        import_type: 'units',
        stage: 'import',
        rows_total: previewResults.valid.length,
        rows_ok: results.added + results.updated,
        rows_added: results.added,
        rows_updated: results.updated,
        rows_errors: results.failed,
        errors_json: results.errors.slice(0, 20),
        status: results.failed === 0 ? 'ok' : 'error',
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });

      queryClient.invalidateQueries({ queryKey: ['allFoodUnits'] });
      
      const summary = [];
      if (results.added > 0) summary.push(`${results.added} נוספו`);
      if (results.updated > 0) summary.push(`${results.updated} עודכנו`);
      
      if (results.failed === 0) {
        toast.success(`✅ ייבוא הושלם: ${summary.join(' | ')}`, { id: 'import' });
        handleReset();
      } else {
        toast.warning(`⚠️ ${summary.join(' | ')} | ${results.failed} נכשלו`, { id: 'import' });
        setShowErrorsModal(true);
      }
    } catch (err) {
      console.error('[ImportUnits] Import error:', err);
      toast.error(`שגיאה בייבוא: ${err.message}`, { id: 'import' });
      
      await base44.entities.ImportLog.create({
        import_type: 'units',
        stage: 'import',
        rows_total: previewResults?.valid?.length || 0,
        rows_errors: 1,
        status: 'error',
        errors_json: [{ row: 0, message: err.message }],
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });
    } finally {
      setImporting(false);
    }
  };

  const handleReset = () => {
    setCsvText('');
    setPreviewResults(null);
  };

  const copyErrors = () => {
    if (!previewResults?.errors) return;
    const text = previewResults.errors.map(e => 
      `שורה ${e.row}: ${e.message}\n${e.raw || ''}`
    ).join('\n\n');
    navigator.clipboard.writeText(text);
    toast.success('שגיאות הועתקו ללוח');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ייבוא יחידות בהדבקה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 mb-2">📋 פורמט CSV (חובה):</p>
            <div className="bg-white rounded p-2 text-xs font-mono text-slate-700 overflow-x-auto">
              name_he,default_grams,description<br/>
              כף,15,כף סטנדרטית<br/>
              כפית,5,כפית סטנדרטית<br/>
              כוס,240,כוס סטנדרטית<br/>
              פרוסה,30,פרוסת לחם<br/>
              יחידה,1,יחידה גנרית
            </div>
          </div>

          <div>
            <Label>הדבק CSV</Label>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="הדבק כאן את ה-CSV..."
              className="h-48 font-mono text-xs"
              disabled={importing || checking}
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              variant="outline"
              className="flex-1"
              disabled={importing || checking || !csvText.trim()}
            >
              <Search className="w-4 h-4 ml-2" />
              {checking ? 'בודק...' : 'בדוק'}
            </Button>
            <Button
              onClick={handleImport}
              className="flex-1 bg-teal-600 hover:bg-teal-700"
              disabled={importing || checking || !previewResults || previewResults.errors.length > 0}
            >
              <Upload className="w-4 h-4 ml-2" />
              {importing ? 'מייבא...' : 'ייבא'}
            </Button>
            <Button
              onClick={handleReset}
              variant="ghost"
              disabled={importing || checking}
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewResults && (
        <Card className={previewResults.errors.length > 0 ? 'border-l-4 border-l-red-500' : 'border-l-4 border-l-green-500'}>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">תוצאות בדיקה</CardTitle>
              {previewResults.errors.length > 0 && (
                <Button size="sm" variant="outline" onClick={copyErrors}>
                  <Copy className="w-3 h-3 ml-1" />
                  העתק שגיאות
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-4 bg-slate-50 rounded-lg">
                <p className="text-3xl font-bold text-slate-600">{previewResults.total}</p>
                <p className="text-xs text-slate-700">שורות</p>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{previewResults.willAdd}</p>
                <p className="text-xs text-green-700">יווספו</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{previewResults.willUpdate}</p>
                <p className="text-xs text-blue-700">יעודכנו</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-600">{previewResults.errors.length}</p>
                <p className="text-xs text-red-700">שגיאות</p>
              </div>
            </div>

            {previewResults.valid.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-100 p-2 text-sm font-medium text-green-800">
                  מוכן לייבוא ({previewResults.valid.length}):
                </div>
                <div className="max-h-48 overflow-y-auto bg-green-50">
                  {previewResults.valid.slice(0, 10).map((row, idx) => (
                    <div key={idx} className="p-2 border-t text-xs flex justify-between">
                      <span>
                        <span className="font-medium">{row.nameHe}</span> = {row.defaultGrams}g
                        {row.description && <span className="text-slate-500 mr-2">({row.description})</span>}
                      </span>
                      {row.willUpdate && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          עדכון: {row.oldGrams}g → {row.defaultGrams}g
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {previewResults.errors.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800">
                  שגיאות ({previewResults.errors.length}):
                </div>
                <div className="max-h-48 overflow-y-auto bg-red-50">
                  {previewResults.errors.map((err, idx) => (
                    <div key={idx} className="p-2 border-t text-xs">
                      <div className="font-medium text-red-700">שורה {err.row}: {err.message}</div>
                      {err.raw && <div className="text-slate-600 font-mono text-[10px]">{err.raw}</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={showErrorsModal} onOpenChange={setShowErrorsModal}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>
              <AlertCircle className="w-5 h-5 text-red-600 inline ml-2" />
              שגיאות בייבוא
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {previewResults?.errors?.map((err, idx) => (
              <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                <p className="font-medium text-red-800">שורה {err.row}: {err.message}</p>
                {err.raw && <p className="text-xs text-slate-600 mt-1 font-mono">{err.raw}</p>}
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button onClick={() => setShowErrorsModal(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}