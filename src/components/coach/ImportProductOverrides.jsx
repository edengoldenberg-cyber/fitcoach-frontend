import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle, Upload, Eye } from 'lucide-react';

export default function ImportProductOverrides() {
  const [csvText, setCsvText] = useState('');
  const [mode, setMode] = useState('idle');
  const [results, setResults] = useState(null);

  const parseCsv = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { error: 'CSV ריק' };

    const header = lines[0].trim();
    if (header !== 'product_name_he,unit_name_he,grams_override,note') {
      return { error: 'Headers שגויים. חובה: product_name_he,unit_name_he,grams_override,note' };
    }

    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 3) {
        errors.push({ row: i + 1, reason: 'חסרים שדות', raw: line });
        continue;
      }

      const product_name_he = parts[0].trim();
      const unit_name_he = parts[1].trim();
      const grams = parseFloat(parts[2]);
      const note = parts[3]?.trim() || '';

      if (!product_name_he || !unit_name_he) {
        errors.push({ row: i + 1, reason: 'שדות ריקים', raw: line });
        continue;
      }
      if (isNaN(grams) || grams <= 0) {
        errors.push({ row: i + 1, reason: 'grams_override לא תקין', raw: line });
        continue;
      }

      rows.push({ product_name_he, unit_name_he, grams_override: grams, note });
    }

    return { rows, errors };
  };

  const handlePreview = () => {
    const parsed = parseCsv(csvText);
    if (parsed.error) {
      setResults({ error: parsed.error });
      return;
    }

    setResults({
      preview: true,
      total: parsed.rows.length,
      valid: parsed.rows.length,
      errors: parsed.errors.length,
      errorList: parsed.errors
    });
    setMode('preview');
  };

  const handleImport = async () => {
    setMode('importing');
    const parsed = parseCsv(csvText);
    
    if (parsed.error || !parsed.rows) {
      setResults({ error: parsed.error || 'שגיאה בניתוח' });
      setMode('idle');
      return;
    }

    const stats = { added: 0, updated: 0, skipped: 0, failed: 0, failures: [] };

    try {
      // Fetch all products and units
      const products = await base44.entities.FoodItem.list();
      const units = await base44.entities.FoodUnit.list();
      const existingOverrides = await base44.entities.ProductUnitOverride.list();

      const productMap = {};
      products.forEach(p => {
        productMap[p.name_he] = p;
      });

      const unitMap = {};
      units.forEach(u => {
        unitMap[u.name_he] = u;
      });

      const overrideMap = {};
      existingOverrides.forEach(o => {
        const key = `${o.product_id}_${o.unit_id}`;
        overrideMap[key] = o;
      });

      for (const row of parsed.rows) {
        try {
          const product = productMap[row.product_name_he];
          if (!product) {
            stats.failed++;
            stats.failures.push({ 
              product: row.product_name_he, 
              reason: 'מוצר לא נמצא' 
            });
            continue;
          }

          const unit = unitMap[row.unit_name_he];
          if (!unit) {
            stats.failed++;
            stats.failures.push({ 
              product: row.product_name_he, 
              reason: `יחידה '${row.unit_name_he}' לא קיימת` 
            });
            continue;
          }

          const key = `${product.id}_${unit.id}`;
          const existing = overrideMap[key];

          const data = {
            product_id: product.id,
            unit_id: unit.id,
            grams_override: row.grams_override,
            note: row.note
          };

          if (existing) {
            await base44.entities.ProductUnitOverride.update(existing.id, data);
            stats.updated++;
          } else {
            await base44.entities.ProductUnitOverride.create(data);
            stats.added++;
          }
        } catch (err) {
          stats.failed++;
          stats.failures.push({ 
            product: row.product_name_he, 
            reason: err.message 
          });
        }
      }

      setResults({ ...stats, success: true });
    } catch (err) {
      setResults({ error: err.message });
    } finally {
      setMode('idle');
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-bold mb-2">📥 ייבוא Overrides למוצרים</h3>
      <p className="text-xs text-slate-500 mb-4">
        פורמט: product_name_he,unit_name_he,grams_override,note<br/>
        דוגמה: חלב תנובה 3%,כוס,250,"כוס גדולה"
      </p>

      <Textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        placeholder="הדבק CSV כאן..."
        className="mb-3 font-mono text-xs h-32"
      />

      <div className="flex gap-2 mb-4">
        <Button
          onClick={handlePreview}
          disabled={!csvText || mode === 'importing'}
          variant="outline"
        >
          <Eye className="w-4 h-4 mr-2" />
          בדוק
        </Button>
        <Button
          onClick={handleImport}
          disabled={!csvText || mode === 'importing'}
          style={{ backgroundColor: '#79DBD6' }}
        >
          <Upload className="w-4 h-4 mr-2" />
          ייבא
        </Button>
      </div>

      {results && (
        <div className="space-y-3">
          {results.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">שגיאה</p>
                  <p className="text-sm text-red-600">{results.error}</p>
                </div>
              </div>
            </div>
          )}

          {results.preview && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="font-medium text-blue-800 mb-2">תצוגה מקדימה:</p>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><span className="font-medium">סה"כ:</span> {results.total}</div>
                <div><span className="font-medium">תקין:</span> {results.valid}</div>
                <div><span className="font-medium text-red-600">שגיאות:</span> {results.errors}</div>
              </div>
              {results.errorList?.length > 0 && (
                <div className="mt-2 text-xs space-y-1 max-h-32 overflow-y-auto">
                  {results.errorList.map((e, i) => (
                    <div key={i} className="bg-white p-1 rounded border">
                      שורה {e.row}: {e.reason}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {results.success && (
            <div className="space-y-2">
              <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <p className="font-medium text-green-800">ייבוא הושלם!</p>
                </div>
                <div className="grid grid-cols-4 gap-2 text-xs">
                  <div className="text-center p-2 bg-white rounded">
                    <p className="font-bold text-green-600">{results.added}</p>
                    <p className="text-slate-600">נוספו</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <p className="font-bold text-blue-600">{results.updated}</p>
                    <p className="text-slate-600">עודכנו</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <p className="font-bold text-amber-600">{results.skipped}</p>
                    <p className="text-slate-600">דולגו</p>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <p className="font-bold text-red-600">{results.failed}</p>
                    <p className="text-slate-600">נכשלו</p>
                  </div>
                </div>
              </div>
              {results.failures?.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                  <p className="text-xs font-medium text-amber-800 mb-1">כשלונות:</p>
                  <div className="space-y-1 max-h-32 overflow-y-auto text-xs">
                    {results.failures.map((f, i) => (
                      <div key={i} className="bg-white p-1 rounded">
                        {f.product}: {f.reason}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}