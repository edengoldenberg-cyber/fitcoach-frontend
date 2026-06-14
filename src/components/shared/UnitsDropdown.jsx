import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { mergeUnits, GLOBAL_SAFE_UNITS, CONVENIENCE_UNITS } from './unitsResolver';
import { AlertCircle, Flag } from 'lucide-react';

/**
 * Dropdown יחידות יציב עם confidence levels
 * @param {string} productId - ID של המוצר
 * @param {string} productCategory - קטגוריה של המוצר
 * @param {string} productName - שם המוצר (לסינון subtype)
 * @param {string} value - ערך נוכחי (unit.id)
 * @param {function} onChange - callback עם unit object מלא
 * @param {function} onReportInaccuracy - callback לדיווח אי-דיוק (למתאמן)
 * @param {boolean} showDebug - הצג warnings למאמן
 */
export default function UnitsDropdown({ 
  productId, 
  productCategory,
  productName = '',
  value, 
  onChange, 
  onReportInaccuracy,
  showDebug = false 
}) {
  // טען overrides למוצר
  const { data: productOverrides = [], isLoading: loadingOverrides } = useQuery({
    queryKey: ['productOverrides', productId],
    queryFn: () => base44.entities.ProductUnitOverride.filter({ product_id: productId }),
    enabled: !!productId,
  });

  // טען category defaults
  const { data: categoryDefaults = [], isLoading: loadingCategory } = useQuery({
    queryKey: ['categoryDefaults', productCategory],
    queryFn: () => base44.entities.CategoryUnitDefault.filter({ category: productCategory }),
    enabled: !!productCategory,
  });

  // טען כל היחידות (לresolve by name)
  const { data: allUnitsForResolve = [] } = useQuery({
    queryKey: ['allUnitsForResolve'],
    queryFn: async () => {
      const portions = await base44.entities.PortionReference.list();
      return portions.map(p => ({
        id: p.id,
        name_he: p.name_he || p.legacy_label_he,
      }));
    },
  });

  // Merge יחידות לפי היררכיה עם confidence
  const { units, diagnostics } = useMemo(() => {
    if (!productId) {
      return {
        units: [...GLOBAL_SAFE_UNITS, ...CONVENIENCE_UNITS],
        diagnostics: { 
          fallback_to_global_only: true, 
          merge_strategy_used: 'no_product',
          sources_used: ['global_safe', 'global_convenience'],
          fallback_to_name_used: false,
        },
      };
    }

    return mergeUnits(productOverrides, categoryDefaults, allUnitsForResolve, productName);
  }, [productId, productOverrides, categoryDefaults, allUnitsForResolve, productName]);

  const isLoading = loadingOverrides || loadingCategory;

  const handleChange = (unitId) => {
    const unit = units.find(u => u.id === unitId);
    if (unit && onChange) {
      onChange(unit);
    }
  };

  // אזהרה אם אין יחידות
  if (!isLoading && units.length === 0) {
    return (
      <div className="border border-red-300 bg-red-50 p-3 rounded-lg text-sm text-red-800">
        <AlertCircle className="w-4 h-4 inline ml-2" />
        אין יחידות זמינות.
      </div>
    );
  }

  const showReportButton = onReportInaccuracy && !showDebug;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Select value={value} onValueChange={handleChange} disabled={isLoading} className="flex-1">
          <SelectTrigger>
            <SelectValue placeholder={isLoading ? 'טוען...' : 'בחר יחידה'} />
          </SelectTrigger>
          <SelectContent>
            {units.map(unit => {
              const showApprox = unit.confidence === 'approx' && !showDebug;
              return (
                <SelectItem key={unit.id} value={unit.id}>
                  {unit.name} ({unit.grams_per_unit} גרם)
                  {showApprox && <span className="text-amber-600 text-xs mr-1">(הערכה)</span>}
                  {showDebug && (
                    <span className="text-xs text-slate-400 mr-2">
                      [{unit.source}|{unit.confidence}]
                    </span>
                  )}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>

        {showReportButton && (
          <button
            type="button"
            onClick={onReportInaccuracy}
            className="px-3 py-2 border rounded-lg hover:bg-slate-50 text-slate-600"
            title="דווח על אי-דיוק"
          >
            <Flag className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Debug info למאמן */}
      {showDebug && (
        <div className="text-xs space-y-1 bg-slate-50 p-2 rounded border">
          <div className="font-bold">📊 Diagnostics:</div>
          
          <div className={diagnostics.fallback_to_name_used ? "text-red-600 font-bold" : "text-green-600"}>
            {diagnostics.fallback_to_name_used ? '❌ FALLBACK_TO_NAME USED' : '✅ No fallback_to_name'}
          </div>
          
          {diagnostics.fallback_to_global_only && (
            <div className="text-orange-600">⚠️ רק Global Safe Units (אין overrides/defaults)</div>
          )}
          
          <div className="text-slate-600">
            Override with unit_id: {diagnostics.override_has_unit_id || 0} | Missing: {diagnostics.override_missing_unit_id || 0}
          </div>
          
          {diagnostics.needs_manual_fix?.length > 0 && (
            <div className="text-red-600">
              ❌ {diagnostics.needs_manual_fix.length} overrides דורשים תיקון
            </div>
          )}
          
          {diagnostics.invalid_units_filtered?.length > 0 && (
            <div className="text-red-600">
              ❌ {diagnostics.invalid_units_filtered.length} יחידות לא תקינות הוסתרו
            </div>
          )}
          
          <div className="text-slate-600">
            מקורות: {diagnostics.sources_used?.join(' → ') || 'none'}
          </div>
          <div className="text-slate-600">
            יחידות זמינות: {units.length}
          </div>
        </div>
      )}
    </div>
  );
}