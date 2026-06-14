import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Flag, Check, Search } from 'lucide-react';
import { toast } from 'sonner';

/**
 * פאנל למאמן - תיקון יחידות approx ליחידות exact
 * מציג מוצרים שמתאמנים השתמשו ביחידות הערכה
 */
export default function AccuracyFixPanel() {
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [selectedUnitId, setSelectedUnitId] = useState(null);
  const [gramsInput, setGramsInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const queryClient = useQueryClient();

  // טען meal entries עם confidence=approx
  const { data: approxMeals = [] } = useQuery({
    queryKey: ['approxMeals'],
    queryFn: async () => {
      // Note: בפועל צריך לשמור confidence במסכי הוספה
      // כרגע מחזירים הכל ונסנן ידנית
      const meals = await base44.entities.MealEntry.list('-created_date', 200);
      return meals;
    },
  });

  // טען מוצרים
  const { data: products = [] } = useQuery({
    queryKey: ['foods'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  // ספירת שימושים למוצר
  const productUsage = React.useMemo(() => {
    const usage = {};
    approxMeals.forEach(meal => {
      if (meal.product_id) {
        usage[meal.product_id] = (usage[meal.product_id] || 0) + 1;
      }
    });
    return usage;
  }, [approxMeals]);

  // מוצרים פופולריים
  const topProducts = React.useMemo(() => {
    return Object.entries(productUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([productId, count]) => {
        const product = products.find(p => p.id === productId);
        return { product, count };
      })
      .filter(item => item.product);
  }, [productUsage, products]);

  // סינון
  const filteredProducts = searchTerm
    ? products.filter(p => p.name_he?.toLowerCase().includes(searchTerm.toLowerCase())).slice(0, 20)
    : topProducts;

  const selectedProduct = products.find(p => p.id === selectedProductId);

  // טען overrides קיימים למוצר
  const { data: existingOverrides = [] } = useQuery({
    queryKey: ['productOverrides', selectedProductId],
    queryFn: () => base44.entities.ProductUnitOverride.filter({ product_id: selectedProductId }),
    enabled: !!selectedProductId,
  });

  // Mutation ליצירת override
  const createOverrideMutation = useMutation({
    mutationFn: (data) => base44.entities.ProductUnitOverride.create(data),
    onSuccess: () => {
      toast.success('Override נוצר בהצלחה!');
      queryClient.invalidateQueries({ queryKey: ['productOverrides'] });
      setGramsInput('');
      setSelectedUnitId(null);
    },
    onError: (err) => {
      toast.error('שגיאה ביצירת override: ' + err.message);
    },
  });

  const handleSaveOverride = () => {
    if (!selectedProductId || !selectedUnitId || !gramsInput) {
      toast.error('חסרים פרטים');
      return;
    }

    const grams = parseFloat(gramsInput);
    if (isNaN(grams) || grams <= 0) {
      toast.error('גרמים לא תקין');
      return;
    }

    createOverrideMutation.mutate({
      product_id: selectedProductId,
      unit_id: selectedUnitId,
      grams_override: grams,
      confidence: 'exact',
      note: 'תוקן על ידי מאמן',
    });
  };

  return (
    <div className="space-y-4" dir="rtl">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
          🎯 תיקון דיוק יחידות מידה
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          המר יחידות "(הערכה)" ליחידות מדויקות עבור מוצרים נפוצים
        </p>

        {/* חיפוש */}
        <div className="mb-4">
          <div className="flex items-center gap-2">
            <Search className="w-5 h-5 text-slate-400" />
            <Input
              placeholder="חפש מוצר..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
          </div>
        </div>

        {/* רשימת מוצרים */}
        <div className="space-y-2 max-h-96 overflow-y-auto border rounded-lg p-2">
          {filteredProducts.length === 0 && (
            <div className="text-center text-slate-500 py-8">
              {searchTerm ? 'לא נמצאו מוצרים' : 'אין נתוני שימוש'}
            </div>
          )}
          {filteredProducts.map(({ product, count }) => (
            <button
              key={product.id}
              onClick={() => setSelectedProductId(product.id)}
              className={`w-full text-right p-3 rounded-lg border hover:bg-slate-50 ${
                selectedProductId === product.id ? 'bg-blue-50 border-blue-300' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">{product.name_he}</div>
                  {product.brand && (
                    <div className="text-xs text-slate-500">{product.brand}</div>
                  )}
                </div>
                {count && (
                  <Badge variant="outline">{count} שימושים</Badge>
                )}
              </div>
            </button>
          ))}
        </div>
      </Card>

      {selectedProduct && (
        <Card className="p-6">
          <div className="bg-blue-50 p-4 rounded-lg mb-4">
            <div className="font-bold text-lg">{selectedProduct.name_he}</div>
            {selectedProduct.brand && (
              <div className="text-sm text-slate-600">{selectedProduct.brand}</div>
            )}
          </div>

          <h3 className="font-bold mb-3">יחידות קיימות:</h3>
          {existingOverrides.length === 0 ? (
            <div className="text-slate-500 text-sm mb-4">אין overrides קיימים</div>
          ) : (
            <div className="space-y-2 mb-4">
              {existingOverrides.map(override => (
                <div key={override.id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                  <div>
                    <span className="font-medium">{override.unit_name || 'יחידה'}</span>
                    <span className="text-slate-600 text-sm mr-2">
                      {override.grams_override}g
                    </span>
                  </div>
                  <Badge variant={override.confidence === 'exact' ? 'default' : 'outline'}>
                    {override.confidence === 'exact' ? 'מדויק' : 'הערכה'}
                  </Badge>
                </div>
              ))}
            </div>
          )}

          <h3 className="font-bold mb-3">הוסף override חדש:</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium mb-1 block">יחידה</label>
              <select
                value={selectedUnitId || ''}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full p-2 border rounded-lg"
              >
                <option value="">בחר יחידה</option>
                <option value="conv_spoon">כף</option>
                <option value="conv_teaspoon">כפית</option>
                <option value="conv_cup">כוס</option>
                <option value="conv_slice">פרוסה</option>
                <option value="conv_unit">יחידה</option>
                <option value="conv_scoop">סקופ</option>
              </select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">גרמים ליחידה</label>
              <Input
                type="number"
                value={gramsInput}
                onChange={(e) => setGramsInput(e.target.value)}
                placeholder="לדוגמה: 30"
              />
            </div>

            <Button
              onClick={handleSaveOverride}
              disabled={!selectedUnitId || !gramsInput || createOverrideMutation.isPending}
              className="w-full"
            >
              {createOverrideMutation.isPending ? 'שומר...' : (
                <>
                  <Check className="w-4 h-4 ml-2" />
                  שמור override מדויק
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}