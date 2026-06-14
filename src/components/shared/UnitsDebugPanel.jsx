import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, ChevronDown, ChevronUp, Wrench, Play } from 'lucide-react';
import { mergeUnits } from './unitsResolver';
import FixProductUnits from '../coach/FixProductUnits';
import { runAllUnitsTests } from './unitsTestRunner';

/**
 * פאנל דיבאג למאמן - מציג את האמת על יחידות המידה
 */
export default function UnitsDebugPanel() {
  const [selectedProductId, setSelectedProductId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showFixDialog, setShowFixDialog] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [expanded, setExpanded] = useState({
    category: true,
    overrides: true,
    merged: true,
    diagnostics: true,
  });

  // טען מוצרים לחיפוש
  const { data: products = [] } = useQuery({
    queryKey: ['foods'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  // טען PortionReference (כל היחידות הכלליות)
  const { data: portionRefs = [] } = useQuery({
    queryKey: ['portionReferences'],
    queryFn: () => base44.entities.PortionReference.list(),
  });

  // מצא מוצר נבחר
  const selectedProduct = products.find(p => p.id === selectedProductId);

  // טען overrides למוצר הנבחר
  const { data: productOverrides = [] } = useQuery({
    queryKey: ['productOverrides', selectedProductId],
    queryFn: () => base44.entities.ProductUnitOverride.filter({ product_id: selectedProductId }),
    enabled: !!selectedProductId,
  });

  // טען category defaults
  const { data: categoryDefaults = [] } = useQuery({
    queryKey: ['categoryDefaults', selectedProduct?.category],
    queryFn: () => base44.entities.CategoryUnitDefault.filter({ category: selectedProduct?.category }),
    enabled: !!selectedProduct?.category,
  });

  // טען כל היחידות לresolve
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

  // חישוב merge - עם שם המוצר לbyte subtype_keywords matching
  const mergeResult = selectedProductId
    ? mergeUnits(productOverrides, categoryDefaults, allUnitsForResolve, selectedProduct?.name_he || '')
    : { units: [], diagnostics: {} };

  // סינון מוצרים
  const filteredProducts = products.filter(p =>
    p.name_he?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const toggle = (section) => {
    setExpanded(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const runTests = () => {
    const results = runAllUnitsTests(categoryDefaults, productOverrides, allUnitsForResolve);
    setTestResults(results);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold flex items-center gap-2">
            🔬 Truth Panel - יחידות מידה
          </h2>
          <Button 
            onClick={runTests}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            Run Units Tests
          </Button>
        </div>

        {/* תוצאות בדיקות */}
        {testResults && (
          <div className="mb-6 p-4 bg-slate-50 rounded-lg border">
            <h3 className="font-bold mb-3 text-sm">🧪 תוצאות בדיקות:</h3>
            <div className="space-y-2 text-sm font-mono">
              {testResults.map((result, idx) => (
                <div key={idx} className={`flex items-center gap-2 ${result.status === 'PASS' ? 'text-green-600' : result.status === 'FAIL' ? 'text-red-600' : 'text-amber-600'}`}>
                  <span className="font-bold">[{result.status}]</span>
                  <span>{result.name}</span>
                  <span className="text-slate-500">- {result.reason}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* חיפוש מוצר */}
        <div className="space-y-3 mb-6">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" />
            <Input
              placeholder="חפש מוצר..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>
          
          {searchTerm && (
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              {filteredProducts.slice(0, 20).map(product => (
                <button
                  key={product.id}
                  onClick={() => {
                    setSelectedProductId(product.id);
                    setSearchTerm('');
                  }}
                  className="w-full text-right p-3 hover:bg-slate-50 border-b last:border-b-0"
                >
                  <div className="font-medium">{product.name_he}</div>
                  {product.brand && (
                    <div className="text-xs text-slate-500">{product.brand}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedProduct && (
          <div className="bg-blue-50 p-4 rounded-lg mb-6">
            <div className="font-bold text-lg">{selectedProduct.name_he}</div>
            {selectedProduct.brand && (
              <div className="text-sm text-slate-600">{selectedProduct.brand}</div>
            )}
            <div className="text-xs text-slate-500 mt-2">ID: {selectedProduct.id}</div>
          </div>
        )}

        {!selectedProductId && (
          <div className="text-center text-slate-500 py-8">
            בחר מוצר כדי להציג ניתוח יחידות
          </div>
        )}
      </Card>

      {selectedProductId && (
        <>
          {/* CategoryUnitDefault */}
          <Card className="p-6">
            <button
              onClick={() => toggle('category')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h3 className="text-lg font-bold flex items-center gap-2">
                📂 CategoryUnitDefault (ברירת מחדל לקטגוריה)
                <Badge variant="outline">{categoryDefaults.length}</Badge>
              </h3>
              {expanded.category ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expanded.category && (
              <div className="space-y-2">
                {categoryDefaults.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">אין category defaults לקטגוריה זו</div>
                ) : (
                  categoryDefaults.map((catDef, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg text-sm">
                      <div className="font-mono text-xs">
                        <div>unit_id: <span className="font-bold">{catDef.unit_id}</span></div>
                        <div>unit_name: <span className="font-bold">{catDef.unit_name}</span></div>
                        <div>grams_per_unit: <span className="font-bold text-blue-600">{catDef.grams_per_unit}</span></div>
                        <div>confidence: <span className="font-bold text-amber-600">{catDef.confidence}</span></div>
                        {catDef.subtype_keywords && catDef.subtype_keywords.length > 0 && (
                          <div>subtype_keywords: <span className="font-bold">{catDef.subtype_keywords.join(', ')}</span></div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          {/* ProductUnitOverride */}
          <Card className="p-6">
            <button
              onClick={() => toggle('overrides')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h3 className="text-lg font-bold flex items-center gap-2">
                🔧 ProductUnitOverride
                <Badge variant="outline">{productOverrides.length}</Badge>
              </h3>
              {expanded.overrides ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expanded.overrides && (
              <div className="space-y-2">
                {productOverrides.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">אין overrides למוצר זה</div>
                ) : (
                  productOverrides.map((override, idx) => (
                    <div key={idx} className="bg-slate-50 p-3 rounded-lg text-sm">
                      <div className="font-mono text-xs">
                        <div>unit_id: <span className="font-bold">{override.unit_id}</span></div>
                        <div>grams_override: <span className="font-bold text-green-600">{override.grams_override}</span></div>
                        <div>confidence: <span className="font-bold">{override.confidence}</span></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          {/* Merged Result - יחידות הסופיות */}
          <Card className="p-6 border-2 border-teal-300 bg-teal-50">
            <button
              onClick={() => toggle('merged')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h3 className="text-lg font-bold flex items-center gap-2">
                ✨ Merged Units (Dropdown) - {mergeResult.units.length} יחידות
                <Badge variant="outline" className="bg-teal-200">{mergeResult.units.length}</Badge>
              </h3>
              {expanded.merged ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expanded.merged && (
              <div className="space-y-3">
                {mergeResult.units.length === 0 ? (
                  <div className="text-sm text-slate-500 italic">אין יחידות זמינות</div>
                ) : (
                  mergeResult.units.map((unit, idx) => (
                    <div key={idx} className="bg-white p-3 rounded-lg border-l-4 border-teal-400">
                      <div className="font-mono text-xs space-y-1">
                        <div className="font-bold text-lg">{unit.name} ({unit.id})</div>
                        <div>grams_per_unit: <span className={`font-bold ${unit.grams_per_unit !== 15 && unit.name === 'כף' ? 'text-green-600' : ''}`}>{unit.grams_per_unit}</span></div>
                        <div>source: <Badge variant="outline" className="text-xs">{unit.source}</Badge></div>
                        <div>confidence: <span className="font-bold">{unit.confidence}</span></div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </Card>

          {/* Diagnostics */}
          <Card className="p-6">
            <button
              onClick={() => toggle('diagnostics')}
              className="w-full flex items-center justify-between mb-4"
            >
              <h3 className="text-lg font-bold">📊 Diagnostics</h3>
              {expanded.diagnostics ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
            </button>

            {expanded.diagnostics && (
              <div className="bg-slate-50 p-4 rounded-lg">
                <pre className="text-xs font-mono overflow-auto max-h-96 whitespace-pre-wrap">
                  {JSON.stringify(mergeResult.diagnostics, null, 2)}
                </pre>
              </div>
            )}
          </Card>

          {/* Fix Button */}
          <div className="flex gap-2">
            <Button
              onClick={() => setShowFixDialog(true)}
              className="gap-2 flex-1"
              variant="outline"
            >
              <Wrench className="w-4 h-4" />
              תקן יחידות
            </Button>
          </div>

          {showFixDialog && (
            <FixProductUnits
              open={showFixDialog}
              onClose={() => setShowFixDialog(false)}
              productId={selectedProductId}
            />
          )}
        </>
      )}
    </div>
  );
}