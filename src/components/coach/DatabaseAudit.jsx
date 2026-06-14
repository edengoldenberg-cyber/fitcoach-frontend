import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Search, AlertCircle, CheckCircle, TrendingUp } from 'lucide-react';

export default function DatabaseAudit({ open, onClose }) {
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState(null);

  const runAudit = async () => {
    setRunning(true);
    try {
      const foodItems = await base44.entities.FoodItem.list();
      
      // Count by category
      const categoryCounts = {};
      const categoryIssues = [];
      const duplicates = [];
      const missingData = [];
      const seenNames = {};

      foodItems.forEach((item, idx) => {
        const cat = item.category || 'לא מוגדר';
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;

        // Check for duplicates by normalized_name + category
        const key = `${item.normalized_name || item.name_he}|${item.category}`;
        if (seenNames[key]) {
          duplicates.push({
            name: item.name_he,
            category: item.category,
            duplicate_of: seenNames[key],
          });
        } else {
          seenNames[key] = item.name_he;
        }

        // Check missing required data
        if (!item.name_he) {
          missingData.push({ id: item.id, field: 'name_he', reason: 'חסר שם מוצר' });
        }
        if (item.per100_kcal === undefined || item.per100_kcal === null) {
          missingData.push({ id: item.id, field: 'per100_kcal', name: item.name_he });
        }
        if (!item.category) {
          categoryIssues.push({ name: item.name_he, issue: 'חסרה קטגוריה' });
        }
      });

      setReport({
        totalProducts: foodItems.length,
        categoryCounts,
        duplicatesCount: duplicates.length,
        duplicates: duplicates.slice(0, 10),
        missingDataCount: missingData.length,
        missingData: missingData.slice(0, 10),
        categoryIssuesCount: categoryIssues.length,
        categoryIssues: categoryIssues.slice(0, 10),
      });

      toast.success('בדיקת מאגר הושלמה');
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    } finally {
      setRunning(false);
    }
  };

  React.useEffect(() => {
    if (open && !report) {
      runAudit();
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>בדיקת תקינות מאגר מזון</DialogTitle>
        </DialogHeader>

        {running && (
          <div className="p-6 text-center">
            <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#79DBD6', borderTopColor: 'transparent' }}></div>
            <p className="text-slate-600">בודק את המאגר...</p>
          </div>
        )}

        {report && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="text-center p-3 bg-teal-50 rounded-lg">
                <p className="text-2xl font-bold text-teal-600">{report.totalProducts}</p>
                <p className="text-xs text-teal-700">סה״כ מוצרים</p>
              </div>
              <div className="text-center p-3 bg-orange-50 rounded-lg">
                <p className="text-2xl font-bold text-orange-600">{report.duplicatesCount}</p>
                <p className="text-xs text-orange-700">כפילויות</p>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-lg">
                <p className="text-2xl font-bold text-red-600">{report.missingDataCount}</p>
                <p className="text-xs text-red-700">ערכים חסרים</p>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{Object.keys(report.categoryCounts).length}</p>
                <p className="text-xs text-blue-700">קטגוריות</p>
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 p-2 text-sm font-medium flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                פילוח לפי קטגוריה
              </div>
              <div className="p-3 bg-white max-h-40 overflow-y-auto">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {Object.entries(report.categoryCounts)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => (
                      <div key={cat} className="flex justify-between p-2 bg-slate-50 rounded">
                        <span className="font-medium">{cat}</span>
                        <span className="text-slate-600">{count}</span>
                      </div>
                    ))}
                </div>
              </div>
            </div>

            {/* Duplicates */}
            {report.duplicatesCount > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-orange-100 p-2 text-sm font-medium text-orange-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  כפילויות זוהו ({report.duplicatesCount})
                </div>
                <div className="max-h-48 overflow-y-auto bg-orange-50">
                  {report.duplicates.map((dup, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-orange-900">
                      <span className="font-medium">{dup.name}</span> ({dup.category}) - כפול של: {dup.duplicate_of}
                    </div>
                  ))}
                  {report.duplicatesCount > 10 && (
                    <div className="p-2 border-t text-xs text-orange-700 text-center">
                      ועוד {report.duplicatesCount - 10}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Missing Data */}
            {report.missingDataCount > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  ערכים חסרים ({report.missingDataCount})
                </div>
                <div className="max-h-48 overflow-y-auto bg-red-50">
                  {report.missingData.map((item, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-red-900">
                      {item.name || item.id} - חסר: {item.field}
                    </div>
                  ))}
                  {report.missingDataCount > 10 && (
                    <div className="p-2 border-t text-xs text-red-700 text-center">
                      ועוד {report.missingDataCount - 10}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* All Good */}
            {report.duplicatesCount === 0 && report.missingDataCount === 0 && report.categoryIssuesCount === 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-800">המאגר תקין!</p>
                <p className="text-xs text-green-700">לא נמצאו בעיות</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>סגור</Button>
          <Button onClick={runAudit} disabled={running} className="bg-teal-600 hover:bg-teal-700">
            <Search className="w-4 h-4 ml-2" />
            בדוק שוב
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}