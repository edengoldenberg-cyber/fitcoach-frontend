import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle, CheckCircle, Upload, Eye } from 'lucide-react';

export default function ImportFoodUnits() {
  const [csvText, setCsvText] = useState('');
  const [mode, setMode] = useState('idle'); // idle, preview, importing
  const [results, setResults] = useState(null);

  const parseCsv = (text) => {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return { error: 'CSV ריק או לא תקין' };

    const header = lines[0].trim();
    if (header !== 'name_he,default_grams,description') {
      return { error: 'Headers שגויים. חובה: name_he,default_grams,description' };
    }

    const rows = [];
    const errors = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length < 2) {
        errors.push({ row: i + 1, reason: 'חסרים שדות', raw: line });
        continue;
      }

      const name_he = parts[0].trim();
      const grams = parseFloat(parts[1]);
      const description = parts[2]?.trim() || '';

      if (!name_he) {
        errors.push({ row: i + 1, reason: 'name_he ריק', raw: line });
        continue;
      }
      if (isNaN(grams) || grams <= 0) {
        errors.push({ row: i + 1, reason: 'default_grams לא תקין', raw: line });
        continue;
      }

      rows.push({ name_he, default_grams: grams, description });
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
      const existing = await base44.entities.FoodUnit.list();
      const existingMap = {};
      existing.forEach(u => {
        existingMap[u.name_he] = u;
      });

      for (const row of parsed.rows) {
        try {
          const existingUnit = existingMap[row.name_he];
          if (existingUnit) {
            // Update
            await base44.entities.FoodUnit.update(existingUnit.id, {
              default_grams: row.default_grams,
              description: row.description
            });
            stats.updated++;
          } else {
            // Create
            await base44.entities.FoodUnit.create(row);
            stats.added++;
          }
        } catch (err) {
          stats.failed++;
          stats.failures.push({ name_he: row.name_he, reason: err.message });
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
      <h3 className="text-lg font-bold mb-2">📥 ייבוא יחידות מדידה (CSV)</h3>
      <p className="text-xs text-slate-500 mb-4">
        פורמט: name_he,default_grams,description<br/>
        דוגמה: כף,15,"כף סטנדרטית"
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
                        {f.name_he}: {f.reason}
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