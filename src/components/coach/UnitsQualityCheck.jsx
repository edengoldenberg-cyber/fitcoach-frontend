import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, CheckCircle, TrendingUp, Scale, Coffee } from 'lucide-react';
import { isYogurtProduct, extractGramsFromName } from '../shared/UnitsHelper';

export default function UnitsQualityCheck({ open, onClose }) {
  const { data: units = [], isLoading } = useQuery({
    queryKey: ['foodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
    enabled: open,
  });

  const { data: foodItems = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
    enabled: open,
  });

  const issues = React.useMemo(() => {
    const problems = {
      zeroGrams: [],
      negativeGrams: [],
      extremeValues: [],
      duplicates: [],
      missingScope: [],
      yogurtIssues: [],
    };

    units.forEach(unit => {
      // בדיקת גרמים = 0 או חסר
      if (!unit.grams_per_unit || unit.grams_per_unit === 0) {
        problems.zeroGrams.push(unit);
      }
      
      // בדיקת ערכים שליליים
      if (unit.grams_per_unit < 0) {
        problems.negativeGrams.push(unit);
      }
      
      // בדיקת ערכים חריגים (כף > 100g, כפית > 20g)
      if (unit.unit_name_he?.includes('כפית') && unit.grams_per_unit > 20) {
        problems.extremeValues.push({ ...unit, reason: 'כפית גדולה מדי' });
      }
      if (unit.unit_name_he?.includes('כף') && !unit.unit_name_he?.includes('כפית') && unit.grams_per_unit > 100) {
        problems.extremeValues.push({ ...unit, reason: 'כף גדולה מדי' });
      }
      
      // בדיקת scope חסר
      if (unit.scope_type !== 'global' && !unit.scope_value) {
        problems.missingScope.push(unit);
      }
    });

    // בדיקת כפילויות
    const seen = new Map();
    units.forEach(unit => {
      const key = `${unit.scope_type}|${unit.scope_value}|${unit.unit_name_he}`;
      if (seen.has(key)) {
        problems.duplicates.push(unit);
      } else {
        seen.set(key, unit);
      }
    });

    // בדיקת יוגורטים
    const yogurtProducts = foodItems.filter(item => isYogurtProduct(item.name_he));
    yogurtProducts.forEach(product => {
      const detectedGrams = extractGramsFromName(product.name_he);
      
      // Check for extreme values
      if (detectedGrams && (detectedGrams < 100 || detectedGrams > 1000)) {
        problems.yogurtIssues.push({
          product: product.name_he,
          detected: detectedGrams,
          reason: 'משקל חריג'
        });
      }
      
      // Check if product has at least one unit
      const hasUnit = units.some(u => 
        (u.scope_type === 'food' && u.scope_value === product.id) ||
        (u.scope_type === 'category' && u.scope_value === 'חלב ומוצריו')
      );
      
      if (!hasUnit && !detectedGrams) {
        problems.yogurtIssues.push({
          product: product.name_he,
          reason: 'אין יחידות ולא זוהה משקל'
        });
      }
    });

    return problems;
  }, [units, foodItems]);

  const totalIssues = Object.values(issues).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>בדיקת איכות יחידות</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: '#79DBD6', borderTopColor: 'transparent' }}></div>
            <p className="text-slate-600">בודק יחידות...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary */}
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">{units.length}</p>
                <p className="text-xs text-blue-700">סה״כ יחידות</p>
              </div>
              <div className={`text-center p-3 rounded-lg ${totalIssues === 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                <p className={`text-2xl font-bold ${totalIssues === 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {totalIssues}
                </p>
                <p className={`text-xs ${totalIssues === 0 ? 'text-green-700' : 'text-red-700'}`}>בעיות</p>
              </div>
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <p className="text-2xl font-bold text-slate-600">
                  {units.filter(u => u.scope_type === 'global').length}
                </p>
                <p className="text-xs text-slate-700">גלובליות</p>
              </div>
            </div>

            {/* All OK */}
            {totalIssues === 0 && (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                <p className="text-sm font-medium text-green-800">כל היחידות תקינות!</p>
                <p className="text-xs text-green-700">לא נמצאו בעיות</p>
              </div>
            )}

            {/* Zero Grams */}
            {issues.zeroGrams.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  יחידות עם 0 גרם או חסר ({issues.zeroGrams.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-red-50">
                  {issues.zeroGrams.map((unit, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-red-900">
                      <span className="font-medium">{unit.unit_name_he}</span> 
                      {' '}({unit.scope_type}: {unit.scope_value || 'global'})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Negative Grams */}
            {issues.negativeGrams.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  יחידות עם ערכים שליליים ({issues.negativeGrams.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-red-50">
                  {issues.negativeGrams.map((unit, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-red-900">
                      {unit.unit_name_he}: {unit.grams_per_unit}g
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Extreme Values */}
            {issues.extremeValues.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-orange-100 p-2 text-sm font-medium text-orange-800 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  ערכים חריגים ({issues.extremeValues.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-orange-50">
                  {issues.extremeValues.map((unit, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-orange-900">
                      <span className="font-medium">{unit.unit_name_he}</span>: {unit.grams_per_unit}g 
                      <span className="text-orange-600"> - {unit.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Duplicates */}
            {issues.duplicates.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-yellow-100 p-2 text-sm font-medium text-yellow-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  כפילויות ({issues.duplicates.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-yellow-50">
                  {issues.duplicates.map((unit, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-yellow-900">
                      {unit.unit_name_he} ({unit.scope_type}: {unit.scope_value || 'global'})
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Missing Scope */}
            {issues.missingScope.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  חסר scope_value ({issues.missingScope.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-red-50">
                  {issues.missingScope.map((unit, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-red-900">
                      {unit.unit_name_he} - scope_type: {unit.scope_type}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Yogurt Issues */}
            {issues.yogurtIssues.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-blue-100 p-2 text-sm font-medium text-blue-800 flex items-center gap-2">
                  <Coffee className="w-4 h-4" />
                  בעיות יוגורטים ({issues.yogurtIssues.length})
                </div>
                <div className="max-h-40 overflow-y-auto bg-blue-50">
                  {issues.yogurtIssues.map((issue, idx) => (
                    <div key={idx} className="p-2 border-t text-xs text-blue-900">
                      <span className="font-medium">{issue.product}</span>
                      {issue.detected && <span className="text-blue-600"> - {issue.detected}g</span>}
                      <span className="text-orange-600"> - {issue.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stats by Scope */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 p-2 text-sm font-medium flex items-center gap-2">
                <Scale className="w-4 h-4" />
                פילוח לפי היקף
              </div>
              <div className="p-3 bg-white">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="text-center p-2 bg-blue-50 rounded">
                    <p className="font-bold text-blue-600">
                      {units.filter(u => u.scope_type === 'global').length}
                    </p>
                    <p className="text-blue-700">גלובלי</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <p className="font-bold text-green-600">
                      {units.filter(u => u.scope_type === 'category').length}
                    </p>
                    <p className="text-green-700">קטגוריה</p>
                  </div>
                  <div className="text-center p-2 bg-purple-50 rounded">
                    <p className="font-bold text-purple-600">
                      {units.filter(u => u.scope_type === 'food').length}
                    </p>
                    <p className="text-purple-700">מוצר ספציפי</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}