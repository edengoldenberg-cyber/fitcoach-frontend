import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Upload, Search, Trash2 } from 'lucide-react';

export default function ImportLegacyCSV() {
  const [csvText, setCsvText] = useState('');
  const [previewResults, setPreviewResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: existingLegacy = [] } = useQuery({
    queryKey: ['legacyConversions'],
    queryFn: () => base44.entities.LegacyConversion.list(),
  });

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

      const header = lines[0].trim().toLowerCase();
      if (!header.startsWith('legacy_label_he,grams')) {
        toast.error('כותרת לא תקינה. נדרש: legacy_label_he,grams,note', { id: 'preview' });
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
          results.errors.push({ row: rowNum, message: 'שורה לא תקינה', raw: line });
          continue;
        }

        const [label, gramsStr, note] = parts;

        if (!label) {
          results.errors.push({ row: rowNum, message: 'חסר legacy_label_he', raw: line });
          continue;
        }

        const grams = parseFloat(gramsStr);
        if (isNaN(grams) || grams <= 0) {
          results.errors.push({ row: rowNum, message: `grams לא תקין: "${gramsStr}"`, raw: line });
          continue;
        }

        const existing = existingLegacy.find(l => l.legacy_label_he === label);

        results.valid.push({
          row: rowNum,
          label,
          grams,
          note: note || '',
          willUpdate: !!existing,
          existingId: existing?.id
        });

        if (existing) {
          results.willUpdate++;
        } else {
          results.willAdd++;
        }
      }

      await base44.entities.ImportLog.create({
        import_type: 'legacy',
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
      toast.error(`שגיאה: ${err.message}`, { id: 'preview' });
    } finally {
      setChecking(false);
    }
  };

  const handleImport = async () => {
    if (!previewResults || previewResults.errors.length > 0) {
      toast.error('לא ניתן לייבא - יש שגיאות ב-Preview');
      return;
    }

    const startTime = Date.now();
    setImporting(true);
    toast.loading('מייבא המרות ישנות...', { id: 'import' });

    const results = { added: 0, updated: 0, failed: 0, errors: [] };

    try {
      for (const row of previewResults.valid) {
        try {
          const payload = {
            legacy_label_he: row.label,
            grams: row.grams,
            note: row.note,
            legacy_only: true
          };

          if (row.willUpdate) {
            await base44.entities.LegacyConversion.update(row.existingId, payload);
            results.updated++;
          } else {
            await base44.entities.LegacyConversion.create(payload);
            results.added++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push({ row: row.row, message: err.message });
        }
      }

      await base44.entities.ImportLog.create({
        import_type: 'legacy',
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

      queryClient.invalidateQueries({ queryKey: ['legacyConversions'] });
      
      const summary = [];
      if (results.added > 0) summary.push(`${results.added} נוספו`);
      if (results.updated > 0) summary.push(`${results.updated} עודכנו`);
      
      toast.success(`✅ ייבוא הושלם: ${summary.join(' | ')}`, { id: 'import' });
      setCsvText('');
      setPreviewResults(null);
    } catch (err) {
      toast.error(`שגיאה בייבוא: ${err.message}`, { id: 'import' });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ייבוא המרות ישנות (Legacy) - היסטוריה בלבד</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
            <p className="text-sm font-medium text-orange-800 mb-2">⚠️ שימו לב: נתונים אלה משמשים לשמירה היסטורית בלבד</p>
            <p className="text-xs text-orange-700 mb-2">החישוב התזונתי משתמש רק ב-FoodUnit + ProductUnitOverride</p>
            <div className="bg-white rounded p-2 text-xs font-mono text-slate-700">
              legacy_label_he,grams,note<br/>
              כף אורז ישן,15,ערך היסטורי<br/>
              כוס חלב ישן,240,ערך היסטורי
            </div>
          </div>

          <Textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="הדבק CSV..."
            className="h-32 font-mono text-xs"
            disabled={importing || checking}
          />

          <div className="flex gap-2">
            <Button onClick={handlePreview} variant="outline" className="flex-1" disabled={importing || checking || !csvText.trim()}>
              <Search className="w-4 h-4 ml-2" />
              {checking ? 'בודק...' : 'בדוק'}
            </Button>
            <Button onClick={handleImport} className="flex-1" disabled={importing || checking || !previewResults || previewResults.errors.length > 0}>
              <Upload className="w-4 h-4 ml-2" />
              {importing ? 'מייבא...' : 'ייבא'}
            </Button>
            <Button onClick={() => { setCsvText(''); setPreviewResults(null); }} variant="ghost" disabled={importing || checking}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {previewResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">תוצאות</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="p-3 bg-slate-50 rounded">
                <p className="text-2xl font-bold">{previewResults.total}</p>
                <p className="text-xs">שורות</p>
              </div>
              <div className="p-3 bg-green-50 rounded">
                <p className="text-2xl font-bold text-green-600">{previewResults.willAdd}</p>
                <p className="text-xs">יווספו</p>
              </div>
              <div className="p-3 bg-blue-50 rounded">
                <p className="text-2xl font-bold text-blue-600">{previewResults.willUpdate}</p>
                <p className="text-xs">יעודכנו</p>
              </div>
              <div className="p-3 bg-red-50 rounded">
                <p className="text-2xl font-bold text-red-600">{previewResults.errors.length}</p>
                <p className="text-xs">שגיאות</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}