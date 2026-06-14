import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Upload, Search, Trash2, AlertCircle, Copy, CheckCircle } from 'lucide-react';

export default function ImportLegacyConversions() {
  const [csvText, setCsvText] = useState('');
  const [previewResults, setPreviewResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [showErrorsModal, setShowErrorsModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allProducts = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const { data: allUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
  });

  const { data: existingOverrides = [] } = useQuery({
    queryKey: ['allProductUnitOverrides'],
    queryFn: () => base44.entities.ProductUnitOverride.list(),
  });

  const { data: debugLogs = [] } = useQuery({
    queryKey: ['legacyConversionLogs'],
    queryFn: () => base44.entities.LegacyConversionImportLog.list('-created_date', 20),
  });

  const normalizeText = (text) => {
    if (!text) return '';
    return text.trim().toLowerCase().replace(/\s+/g, ' ');
  };

  const findProduct = (productName) => {
    const normalized = normalizeText(productName);
    // Try exact match first
    let product = allProducts.find(p => normalizeText(p.name_he) === normalized);
    if (product) return product;
    
    // Try trimmed match
    const trimmed = productName.trim();
    product = allProducts.find(p => p.name_he?.trim() === trimmed);
    return product;
  };

  const findUnit = (unitName) => {
    const normalized = normalizeText(unitName);
    return allUnits.find(u => normalizeText(u.unit_name_he) === normalized);
  };

  const handlePreview = async () => {
    const startTime = Date.now();
    console.log('[ImportConversions] Preview started');
    
    if (!csvText.trim()) {
      toast.error('נא להדביק CSV');
      return;
    }

    setChecking(true);
    setPreviewResults(null);
    setImportResults(null);
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
      const expectedHeader = 'product_name_he,unit_name_he,grams_per_unit,notes';
      
      if (!header.startsWith('product_name_he,unit_name_he,grams_per_unit')) {
        await base44.entities.LegacyConversionImportLog.create({
          timestamp: new Date().toISOString(),
          action: 'preview',
          total_rows: lines.length - 1,
          errors_count: lines.length - 1,
          raw_header: lines[0],
          duration_ms: Date.now() - startTime,
          user_email: user?.email,
          errors_sample_json: [{ error: 'Invalid header', expected: expectedHeader, got: lines[0] }]
        });
        
        toast.error('כותרת לא תקינה', { id: 'preview' });
        setPreviewResults({
          valid: [],
          errors: [{
            rowNum: 1,
            error: `כותרת לא תקינה. נדרש: ${expectedHeader}`,
            value: lines[0]
          }]
        });
        setChecking(false);
        return;
      }

      const rows = lines.slice(1);
      const results = {
        valid: [],
        errors: [],
        willCreate: 0,
        willUpdate: 0,
        willSkip: 0,
        total: rows.length
      };

      const seenInFile = new Set();

      for (let idx = 0; idx < rows.length; idx++) {
        const line = rows[idx];
        const rowNum = idx + 2;
        
        // Parse CSV (handle quotes if needed)
        const parts = line.split(',').map(p => p.trim().replace(/^"|"$/g, ''));
        
        if (parts.length < 3) {
          results.errors.push({
            rowNum,
            error: 'שורה לא תקינה - חסרים שדות (נדרשות לפחות 3 עמודות)',
            value: line
          });
          continue;
        }

        const [productNameHe, unitNameHe, gramsStr, notes] = parts;

        // Validate required fields
        if (!productNameHe) {
          results.errors.push({ rowNum, error: 'חסר product_name_he', value: line });
          continue;
        }
        if (!unitNameHe) {
          results.errors.push({ rowNum, error: 'חסר unit_name_he', value: line });
          continue;
        }
        if (!gramsStr) {
          results.errors.push({ rowNum, error: 'חסר grams_per_unit', value: line });
          continue;
        }

        // Validate grams
        const grams = parseFloat(gramsStr);
        if (isNaN(grams) || grams <= 0) {
          results.errors.push({ 
            rowNum, 
            error: `grams_per_unit לא תקין: "${gramsStr}"`,
            value: line 
          });
          continue;
        }

        // Find product
        const product = findProduct(productNameHe);
        if (!product) {
          results.errors.push({ 
            rowNum, 
            error: `מוצר לא נמצא: "${productNameHe}"`,
            value: line 
          });
          continue;
        }

        // Find unit
        const unit = findUnit(unitNameHe);
        if (!unit) {
          results.errors.push({ 
            rowNum, 
            error: `יחידה לא נמצאה: "${unitNameHe}"`,
            value: line 
          });
          continue;
        }

        // Check duplicates in file
        const fileKey = `${product.id}|${unitNameHe}`;
        if (seenInFile.has(fileKey)) {
          results.errors.push({ 
            rowNum, 
            error: `כפילות בקובץ: ${productNameHe} + ${unitNameHe}`,
            value: line 
          });
          results.willSkip++;
          continue;
        }
        seenInFile.add(fileKey);

        // Check if exists in DB
        const existing = existingOverrides.find(o => 
          o.product_id === product.id && o.unit_name === unitNameHe
        );

        const validRow = {
          rowNum,
          productNameHe: product.name_he,
          productId: product.id,
          unitNameHe,
          grams,
          notes: notes || '',
          willUpdate: !!existing,
          existingId: existing?.id,
          oldGrams: existing?.grams_per_unit
        };

        results.valid.push(validRow);

        if (existing) {
          results.willUpdate++;
        } else {
          results.willCreate++;
        }
      }

      // Save debug log
      await base44.entities.LegacyConversionImportLog.create({
        timestamp: new Date().toISOString(),
        action: 'preview',
        total_rows: rows.length,
        created_count: results.willCreate,
        updated_count: results.willUpdate,
        skipped_count: results.willSkip,
        errors_count: results.errors.length,
        errors_sample_json: results.errors.slice(0, 20),
        raw_header: lines[0],
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });

      setPreviewResults(results);
      console.log('[ImportConversions] Preview complete:', results);
      
      if (results.errors.length === 0) {
        toast.success(`✅ ${results.valid.length} תקינים | ${results.willCreate} חדשים | ${results.willUpdate} עדכונים`, { id: 'preview' });
      } else {
        toast.warning(`⚠️ ${results.valid.length} תקינים, ${results.errors.length} שגיאות`, { id: 'preview' });
      }
    } catch (err) {
      console.error('[ImportConversions] Preview error:', err);
      toast.error(`שגיאה: ${err.message}`, { id: 'preview' });
      
      await base44.entities.LegacyConversionImportLog.create({
        timestamp: new Date().toISOString(),
        action: 'preview',
        total_rows: 0,
        errors_count: 1,
        errors_sample_json: [{ error: err.message, stack: err.stack }],
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
    toast.loading('מייבא המרות...', { id: 'import' });
    console.log('[ImportConversions] Import started');

    const results = {
      created: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    try {
      for (const row of previewResults.valid) {
        try {
          const payload = {
            product_id: row.productId,
            unit_name: row.unitNameHe,
            grams_per_unit: row.grams,
            notes: row.notes,
            is_default: false
          };

          if (row.willUpdate) {
            await base44.entities.ProductUnitOverride.update(row.existingId, payload);
            results.updated++;
          } else {
            await base44.entities.ProductUnitOverride.create(payload);
            results.created++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push({
            rowNum: row.rowNum,
            productName: row.productNameHe,
            unitName: row.unitNameHe,
            error: err.message
          });
        }
      }

      // Save debug log
      await base44.entities.LegacyConversionImportLog.create({
        timestamp: new Date().toISOString(),
        action: 'import',
        total_rows: previewResults.valid.length,
        created_count: results.created,
        updated_count: results.updated,
        errors_count: results.failed,
        errors_sample_json: results.errors.slice(0, 20),
        duration_ms: Date.now() - startTime,
        user_email: user?.email
      });

      setImportResults(results);
      queryClient.invalidateQueries({ queryKey: ['allProductUnitOverrides'] });
      queryClient.invalidateQueries({ queryKey: ['productUnitOverrides'] });
      
      console.log('[ImportConversions] Import complete:', results);
      
      const summary = [];
      if (results.created > 0) summary.push(`${results.created} נוצרו`);
      if (results.updated > 0) summary.push(`${results.updated} עודכנו`);
      
      if (results.failed === 0) {
        toast.success(`✅ ייבוא הושלם: ${summary.join(' | ')}`, { id: 'import' });
      } else {
        toast.warning(`⚠️ ${summary.join(' | ')} | ${results.failed} נכשלו`, { id: 'import' });
        setShowErrorsModal(true);
      }
    } catch (err) {
      console.error('[ImportConversions] Import error:', err);
      toast.error(`שגיאה בייבוא: ${err.message}`, { id: 'import' });
      
      await base44.entities.LegacyConversionImportLog.create({
        timestamp: new Date().toISOString(),
        action: 'import',
        total_rows: previewResults?.valid?.length || 0,
        errors_count: 1,
        errors_sample_json: [{ error: err.message, stack: err.stack }],
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
    setImportResults(null);
  };

  const copyErrors = () => {
    if (!previewResults?.errors && !importResults?.errors) return;
    
    const errors = previewResults?.errors || importResults?.errors || [];
    const text = errors.map(e => 
      `שורה ${e.rowNum}: ${e.error}\n${e.value || e.productName || ''}`
    ).join('\n\n');
    
    navigator.clipboard.writeText(text);
    toast.success('שגיאות הועתקו ללוח');
  };

  return (
    <div className="space-y-4">
      {/* CSV Input */}
      <Card>
        <CardHeader>
          <CardTitle>ייבוא המרות בהדבקה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 mb-2">📋 פורמט CSV (חובה):</p>
            <div className="bg-white rounded p-2 text-xs font-mono text-slate-700 overflow-x-auto">
              product_name_he,unit_name_he,grams_per_unit,notes<br/>
              אורז לבן מבושל,כף,12,כף אורז מבושל<br/>
              גבינה לבנה 5%,כף,20,כף גבינה<br/>
              לחם אחיד,פרוסה,30,פרוסת לחם סטנדרטית<br/>
              יוגורט יופלה 150 גרם,יחידה,150,גביע שלם<br/>
              טונה במים 160 גרם,יחידה,160,קופסה שלמה<br/>
              שמן זית,כף,13.5,כף שמן זית
            </div>
            <div className="mt-3 text-xs text-blue-700 space-y-1">
              <p>✓ product_name_he חייב להתאים בדיוק לשם במאגר המוצרים</p>
              <p>✓ unit_name_he חייב להתאים ליחידה קיימת ב-FoodUnits</p>
              <p>✓ grams_per_unit חייב להיות מספר חיובי</p>
              <p>✓ notes אופציונלי</p>
            </div>
          </div>

          <div>
            <Label>הדבק CSV</Label>
            <Textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="הדבק כאן את ה-CSV..."
              className="h-64 font-mono text-xs"
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

      {/* Preview Results */}
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
            <div className="grid grid-cols-5 gap-3">
              <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-lg">
                <p className="text-3xl font-bold text-slate-600">{previewResults.total}</p>
                <p className="text-xs text-slate-700">שורות</p>
              </div>
              <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{previewResults.valid.length}</p>
                <p className="text-xs text-green-700">תקינות</p>
              </div>
              <div className="text-center p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-3xl font-bold text-teal-600">{previewResults.willCreate}</p>
                <p className="text-xs text-teal-700">יווצרו</p>
              </div>
              <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{previewResults.willUpdate}</p>
                <p className="text-xs text-blue-700">יעודכנו</p>
              </div>
              <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-3xl font-bold text-red-600">{previewResults.errors.length}</p>
                <p className="text-xs text-red-700">שגיאות</p>
              </div>
            </div>

            {/* Valid Rows Preview */}
            {previewResults.valid.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-100 p-2 text-sm font-medium text-green-800">
                  מוכן לייבוא ({previewResults.valid.length}):
                </div>
                <div className="max-h-64 overflow-y-auto bg-green-50">
                  {previewResults.valid.slice(0, 15).map((row, idx) => (
                    <div key={idx} className="p-2 border-t text-xs flex justify-between items-center">
                      <div className="flex-1">
                        <span className="text-slate-500">שורה {row.rowNum}:</span>{' '}
                        <span className="font-medium">{row.productNameHe}</span> +{' '}
                        <span className="text-teal-600">{row.unitNameHe}</span> ={' '}
                        <span className="font-bold">{row.grams}g</span>
                        {row.notes && <span className="text-slate-400 mr-2">({row.notes})</span>}
                      </div>
                      {row.willUpdate && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                          עדכון: {row.oldGrams}g → {row.grams}g
                        </span>
                      )}
                    </div>
                  ))}
                  {previewResults.valid.length > 15 && (
                    <div className="p-2 border-t text-xs text-green-600 text-center">
                      ועוד {previewResults.valid.length - 15}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Errors */}
            {previewResults.errors.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex justify-between items-center">
                  <span>שגיאות ({previewResults.errors.length}):</span>
                  <Button size="sm" variant="ghost" onClick={copyErrors} className="h-6">
                    <Copy className="w-3 h-3 ml-1" />
                    העתק
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto bg-red-50">
                  {previewResults.errors.map((err, idx) => (
                    <div key={idx} className="p-2 border-t text-xs">
                      <div className="font-medium text-red-700 mb-1">
                        שורה {err.rowNum}: {err.error}
                      </div>
                      {err.value && (
                        <div className="text-slate-600 font-mono text-[10px] bg-white rounded px-2 py-1">
                          {err.value}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Import Results */}
      {importResults && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <CardTitle className="text-base">✅ תוצאות ייבוא</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{importResults.created}</p>
                <p className="text-xs text-green-700">נוצרו</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{importResults.updated}</p>
                <p className="text-xs text-blue-700">עודכנו</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <p className="text-3xl font-bold text-red-600">{importResults.failed}</p>
                <p className="text-xs text-red-700">נכשלו</p>
              </div>
            </div>

            {importResults.errors.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800">
                  שגיאות מפורטות ({importResults.errors.length}):
                </div>
                <div className="max-h-48 overflow-y-auto bg-red-50">
                  {importResults.errors.map((err, idx) => (
                    <div key={idx} className="p-2 border-t text-xs">
                      <span className="font-medium text-red-700">שורה {err.rowNum}:</span>{' '}
                      <span className="text-slate-700">{err.productName}</span> + {err.unitName} -{' '}
                      <span className="text-red-600">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Debug Logs */}
      {(user?.role === 'admin' || user?.email?.includes('coach')) && debugLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">🔍 Debug Logs (20 אחרונים)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {debugLogs.map((log, idx) => (
                <div key={idx} className={`p-3 rounded-lg border text-xs ${
                  log.errors_count > 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
                }`}>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">
                      {log.action === 'preview' ? '🔍 Preview' : '📥 Import'} - {new Date(log.timestamp).toLocaleString('he-IL')}
                    </span>
                    <span className="text-slate-500">{log.duration_ms}ms</span>
                  </div>
                  <div className="grid grid-cols-5 gap-2 text-[10px]">
                    <div className="bg-white p-1 rounded text-center">
                      <p className="font-bold">{log.total_rows}</p>
                      <p className="text-slate-500">שורות</p>
                    </div>
                    <div className="bg-white p-1 rounded text-center">
                      <p className="font-bold text-teal-600">{log.created_count}</p>
                      <p className="text-slate-500">נוצרו</p>
                    </div>
                    <div className="bg-white p-1 rounded text-center">
                      <p className="font-bold text-blue-600">{log.updated_count}</p>
                      <p className="text-slate-500">עודכנו</p>
                    </div>
                    <div className="bg-white p-1 rounded text-center">
                      <p className="font-bold text-orange-600">{log.skipped_count}</p>
                      <p className="text-slate-500">דולגו</p>
                    </div>
                    <div className="bg-white p-1 rounded text-center">
                      <p className="font-bold text-red-600">{log.errors_count}</p>
                      <p className="text-slate-500">שגיאות</p>
                    </div>
                  </div>
                  {log.raw_header && (
                    <div className="mt-2 text-[10px] text-slate-600 font-mono bg-white p-1 rounded">
                      Header: {log.raw_header}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Errors Modal */}
      <Dialog open={showErrorsModal} onOpenChange={setShowErrorsModal}>
        <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>
              <AlertCircle className="w-5 h-5 text-red-600 inline ml-2" />
              שגיאות בייבוא
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm font-medium text-red-800">
                {importResults?.failed || 0} המרות נכשלו
              </p>
            </div>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {importResults?.errors?.map((err, idx) => (
                <div key={idx} className="p-3 bg-white border rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-800">
                        שורה {err.rowNum}: {err.productName} + {err.unitName}
                      </p>
                      <p className="text-xs text-red-600 mt-1">{err.error}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={copyErrors}>
              <Copy className="w-4 h-4 ml-2" />
              העתק שגיאות
            </Button>
            <Button onClick={() => setShowErrorsModal(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}