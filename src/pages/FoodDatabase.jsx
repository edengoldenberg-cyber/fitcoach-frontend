import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Database, Plus, Edit2, Copy, Power, PowerOff, Upload, Download, Save, Trash2, Search, Filter, Activity, Ruler, ClipboardPaste, Shield, Scale, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import ProductPortionsDialog from '../components/coach/ProductPortionsDialog';
import BulkPasteFoods from '../components/coach/BulkPasteFoods';
import FoodDatabaseStats from '../components/coach/FoodDatabaseStats';
import DatabaseAudit from '../components/coach/DatabaseAudit';
import FoodUnitsManager from '../components/coach/FoodUnitsManager';
import UnitsQualityCheck from '../components/coach/UnitsQualityCheck';
import ManageProductUnits from '../components/coach/ManageProductUnits';
import ImportLegacyConversions from '../components/coach/ImportLegacyConversions';
import ImportFoodUnits from '../components/coach/ImportFoodUnits';
import ImportProductOverrides from '../components/coach/ImportProductOverrides';
import ImportLegacyCSV from '../components/coach/ImportLegacyCSV';
import { Textarea } from "@/components/ui/textarea";

const CATEGORIES = ["חלבון", "פחמימה", "שומן", "ממרח", "חלב ומוצריו", "ירקות", "פירות", "קטניות", "דגנים", "משקאות", "מתוקים", "מנות מוכנות", "תוספים", "רטבים"];

export default function FoodDatabase() {
  const [activeTab, setActiveTab] = useState('products');
  const queryClient = useQueryClient();

  // Auth check
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: coachTrainees } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const isCoach = (coachTrainees && coachTrainees.length > 0) || user?.role === 'admin';

  if (!isCoach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-red-600 font-medium">אין הרשאה לצפות במסך זה</p>
            <p className="text-center text-slate-500 text-sm mt-2">רק מאמנים ומנהלי מערכת יכולים לגשת לניהול מאגר המזון</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Database className="w-8 h-8 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">ניהול מאגר מזון</h1>
            <p className="text-sm text-slate-600">מערכת ניהול מוצרי מזון עבור המערכת</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-5 mb-6">
            <TabsTrigger value="products">מוצרים</TabsTrigger>
            <TabsTrigger value="import">ייבוא</TabsTrigger>
            <TabsTrigger value="import-units">ייבוא יחידות</TabsTrigger>
            <TabsTrigger value="units">המרות ישנות</TabsTrigger>
            <TabsTrigger value="food-units">יחידות מידה</TabsTrigger>
          </TabsList>

          <TabsContent value="products">
            <ProductsTab />
          </TabsContent>

          <TabsContent value="import">
            <ImportTab />
          </TabsContent>

          <TabsContent value="import-units">
            <ImportUnitsTab />
          </TabsContent>

          <TabsContent value="units">
            <UnitsTab />
          </TabsContent>

          <TabsContent value="food-units">
            <FoodUnitsTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// Tab 1: Products Management
function ProductsTab() {
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [showActiveOnly, setShowActiveOnly] = useState(true);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showPortionsDialog, setShowPortionsDialog] = useState(false);
  const [selectedProductForPortions, setSelectedProductForPortions] = useState(null);
  const [showBulkPaste, setShowBulkPaste] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [showUnitsManager, setShowUnitsManager] = useState(false);
  const [selectedProductForUnits, setSelectedProductForUnits] = useState(null);
  const [showManageProductUnits, setShowManageProductUnits] = useState(false);
  const [selectedProductForManage, setSelectedProductForManage] = useState(null);
  const queryClient = useQueryClient();

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => {
      const normalized = data.name_he.trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
      return base44.entities.FoodItem.create({
        ...data,
        normalized_name: normalized,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      setShowDialog(false);
      setEditingProduct(null);
      toast.success('המוצר נוסף בהצלחה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => {
      const normalized = data.name_he?.trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
      return base44.entities.FoodItem.update(id, {
        ...data,
        normalized_name: normalized,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      setShowDialog(false);
      setEditingProduct(null);
      toast.success('המוצר עודכן בהצלחה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, active }) => base44.entities.FoodItem.update(id, { active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      toast.success('סטטוס המוצר עודכן');
    },
  });

  const filteredProducts = useMemo(() => {
    if (!Array.isArray(products)) return [];
    return products.filter(p => {
      const matchSearch = !searchTerm || 
        p.name_he?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.brand?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcodes?.some(b => b.includes(searchTerm));
      
      const matchCategory = categoryFilter === 'all' || p.category === categoryFilter;
      const matchActive = !showActiveOnly || p.active !== false;
      
      return matchSearch && matchCategory && matchActive;
    });
  }, [products, searchTerm, categoryFilter, showActiveOnly]);

  const handleDuplicate = (product) => {
    setEditingProduct({
      ...product,
      id: null,
      name_he: `${product.name_he} (עותק)`,
    });
    setShowDialog(true);
  };

  return (
    <div className="space-y-4">
      {/* Statistics Dashboard */}
      <FoodDatabaseStats />

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>חיפוש</Label>
              <div className="relative">
                <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
                <Input
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="שם מוצר, מותג או ברקוד..."
                  className="pr-10"
                />
              </div>
            </div>
            <div>
              <Label>קטגוריה</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הקטגוריות</SelectItem>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                variant={showActiveOnly ? 'default' : 'outline'}
                onClick={() => setShowActiveOnly(!showActiveOnly)}
                className="w-full"
              >
                <Filter className="w-4 h-4 ml-2" />
                {showActiveOnly ? 'פעילים בלבד' : 'הצג הכל'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => { setEditingProduct(null); setShowDialog(true); }} className="flex-1 md:flex-none bg-teal-600 hover:bg-teal-700">
          <Plus className="w-4 h-4 ml-2" />
          הוסף מוצר
        </Button>
        <Button onClick={() => setShowBulkPaste(true)} variant="outline" className="flex-1 md:flex-none border-teal-300 text-teal-700 hover:bg-teal-50">
          <ClipboardPaste className="w-4 h-4 ml-2" />
          הדבק מוצרים
        </Button>
        <Button onClick={() => setShowAudit(true)} variant="outline" className="flex-1 md:flex-none border-blue-300 text-blue-700 hover:bg-blue-50">
          <Shield className="w-4 h-4 ml-2" />
          בדיקת מאגר
        </Button>
      </div>

      {/* Products List */}
      <div className="grid gap-4">
        {isLoading ? (
          <Card><CardContent className="pt-6 text-center">טוען מוצרים...</CardContent></Card>
        ) : filteredProducts.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-slate-500">לא נמצאו מוצרים</CardContent></Card>
        ) : (
          filteredProducts.map(product => (
            <Card key={product.id} className={product.active === false ? 'opacity-60' : ''}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-lg">{product.name_he}</h3>
                      {product.active === false && (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">מושבת</span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-3">
                      <div>
                        <span className="text-slate-500">קטגוריה: </span>
                        <span className="font-medium">{product.category || 'אחר'}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">קלוריות/100g: </span>
                        <span className="font-medium text-green-600">{product.per100_kcal}</span>
                      </div>
                      <div>
                        <span className="text-slate-500">חלבון/100g: </span>
                        <span className="font-medium text-blue-600">{product.per100_protein}g</span>
                      </div>
                      <div>
                        <span className="text-slate-500">פחמימות/100g: </span>
                        <span className="font-medium text-orange-600">{product.per100_carbs}g</span>
                      </div>
                    </div>
                    
                    {product.brand && (
                      <p className="text-sm text-slate-600 mb-1">מותג: {product.brand}</p>
                    )}
                    
                    {product.barcodes && product.barcodes.length > 0 && (
                      <p className="text-xs text-slate-500">ברקודים: {product.barcodes.join(', ')}</p>
                    )}
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setSelectedProductForManage(product);
                        setShowManageProductUnits(true);
                      }}
                      title="נהל יחידות למוצר (חדש)"
                    >
                      <Ruler className="w-4 h-4 text-purple-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setSelectedProductForUnits(product);
                        setShowUnitsManager(true);
                      }}
                      title="ניהול FoodUnits (legacy)"
                    >
                      <Scale className="w-4 h-4 text-teal-600" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setSelectedProductForPortions(product);
                        setShowPortionsDialog(true);
                      }}
                      title="הגדר יחידות למוצר (old legacy)"
                    >
                      <Ruler className="w-4 h-4 text-slate-400" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => { setEditingProduct(product); setShowDialog(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDuplicate(product)}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(product.active !== false ? 'להשבית את המוצר? הוא לא יוצג למתאמנים אך יישאר בהיסטוריה.' : 'להפעיל מחדש את המוצר?')) {
                          toggleActiveMutation.mutate({ id: product.id, active: product.active === false });
                        }
                      }}
                    >
                      {product.active === false ? <Power className="w-4 h-4 text-green-600" /> : <PowerOff className="w-4 h-4 text-red-600" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Product Dialog */}
      <ProductDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingProduct(null); }}
        product={editingProduct}
        onSave={(data) => {
          if (editingProduct?.id) {
            updateMutation.mutate({ id: editingProduct.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />

      {/* Portions Dialog */}
      <ProductPortionsDialog
        open={showPortionsDialog}
        onClose={() => { setShowPortionsDialog(false); setSelectedProductForPortions(null); }}
        product={selectedProductForPortions}
      />

      {/* Bulk Paste Dialog */}
      <BulkPasteFoods
        open={showBulkPaste}
        onClose={() => setShowBulkPaste(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['foodItems'] });
          queryClient.invalidateQueries({ queryKey: ['systemStats'] });
        }}
      />

      {/* Database Audit */}
      <DatabaseAudit
        open={showAudit}
        onClose={() => setShowAudit(false)}
      />

      {/* Food Units Manager */}
      <FoodUnitsManager
        foodItem={selectedProductForUnits}
        open={showUnitsManager}
        onClose={() => { setShowUnitsManager(false); setSelectedProductForUnits(null); }}
      />

      {/* Manage Product Units (NEW) */}
      <ManageProductUnits
        open={showManageProductUnits}
        onClose={() => { setShowManageProductUnits(false); setSelectedProductForManage(null); }}
        productId={selectedProductForManage?.id}
        productName={selectedProductForManage?.name_he}
      />
    </div>
  );
}

// Product Form Dialog
function ProductDialog({ open, onClose, product, onSave }) {
  const [formData, setFormData] = useState({
    name_he: '',
    category: 'אחר',
    per100_kcal: '',
    per100_protein: '',
    per100_carbs: '',
    per100_fat: '',
    brand: '',
    barcodes: [],
    source: 'manual',
    active: true,
    is_suggest_favorite: false,
    suggest_meal_tags: [],
    suggest_role: '',
    suggest_priority: 3,
  });
  const [barcodesInput, setBarcodesInput] = useState('');

  React.useEffect(() => {
    if (product) {
      setFormData({
        name_he: product.name_he || '',
        category: product.category || 'אחר',
        per100_kcal: product.per100_kcal || '',
        per100_protein: product.per100_protein || '',
        per100_carbs: product.per100_carbs || '',
        per100_fat: product.per100_fat || '',
        brand: product.brand || '',
        barcodes: product.barcodes || [],
        source: product.source || 'manual',
        active: product.active !== false,
        is_suggest_favorite: product.is_suggest_favorite || false,
        suggest_meal_tags: product.suggest_meal_tags || [],
        suggest_role: product.suggest_role || '',
        suggest_priority: product.suggest_priority || 3,
      });
      setBarcodesInput((product.barcodes || []).join(', '));
    } else {
      setFormData({
        name_he: '',
        category: 'אחר',
        per100_kcal: '',
        per100_protein: '',
        per100_carbs: '',
        per100_fat: '',
        brand: '',
        barcodes: [],
        source: 'manual',
        active: true,
        is_suggest_favorite: false,
        suggest_meal_tags: [],
        suggest_role: '',
        suggest_priority: 3,
      });
      setBarcodesInput('');
    }
  }, [product, open]);

  const handleSubmit = () => {
    if (!formData.name_he) {
      toast.error('שם המוצר חובה');
      return;
    }
    if (!formData.per100_kcal || formData.per100_kcal < 0) {
      toast.error('קלוריות חייבות להיות מספר חיובי');
      return;
    }
    if (formData.per100_protein < 0 || formData.per100_carbs < 0 || formData.per100_fat < 0) {
      toast.error('ערכי תזונה חייבים להיות חיוביים');
      return;
    }

    const barcodes = barcodesInput
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    onSave({
      ...formData,
      per100_kcal: parseFloat(formData.per100_kcal),
      per100_protein: parseFloat(formData.per100_protein || 0),
      per100_carbs: parseFloat(formData.per100_carbs || 0),
      per100_fat: parseFloat(formData.per100_fat || 0),
      barcodes,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>{product?.id ? 'עריכת מוצר' : 'הוספת מוצר חדש'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>שם המוצר (עברית) *</Label>
            <Input
              value={formData.name_he}
              onChange={(e) => setFormData({ ...formData, name_he: e.target.value })}
              placeholder="לדוגמה: חזה עוף"
            />
          </div>

          <div>
            <Label>קטגוריה *</Label>
            <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>קלוריות/100g *</Label>
              <Input
                type="number"
                value={formData.per100_kcal}
                onChange={(e) => setFormData({ ...formData, per100_kcal: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>חלבון/100g (גרם) *</Label>
              <Input
                type="number"
                value={formData.per100_protein}
                onChange={(e) => setFormData({ ...formData, per100_protein: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>פחמימות/100g (גרם) *</Label>
              <Input
                type="number"
                value={formData.per100_carbs}
                onChange={(e) => setFormData({ ...formData, per100_carbs: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>שומן/100g (גרם) *</Label>
              <Input
                type="number"
                value={formData.per100_fat}
                onChange={(e) => setFormData({ ...formData, per100_fat: e.target.value })}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <Label>מותג (אופציונלי)</Label>
            <Input
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              placeholder="לדוגמה: תנובה"
            />
          </div>

          <div>
            <Label>ברקודים (אופציונלי)</Label>
            <Input
              value={barcodesInput}
              onChange={(e) => setBarcodesInput(e.target.value)}
              placeholder="הזן ברקודים מופרדים בפסיקים"
            />
          </div>

          <div>
            <Label>מקור</Label>
            <Select value={formData.source} onValueChange={(v) => setFormData({ ...formData, source: v })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual">ידני</SelectItem>
                <SelectItem value="import">ייבוא</SelectItem>
                <SelectItem value="label">מתווית</SelectItem>
                <SelectItem value="verified">מאומת</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Meal Suggestions Section */}
          <div className="border-t pt-4 space-y-3">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_suggest_favorite"
                checked={formData.is_suggest_favorite}
                onChange={(e) => setFormData({ ...formData, is_suggest_favorite: e.target.checked })}
                className="w-4 h-4"
              />
              <Label htmlFor="is_suggest_favorite" className="font-semibold text-amber-700">
                ✨ מועדף להצעות אוטומטיות
              </Label>
            </div>

            {formData.is_suggest_favorite && (
              <>
                <div>
                  <Label>מתאים לארוחות:</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {['בוקר', 'צהריים', 'ערב', 'ביניים'].map(tag => (
                      <label key={tag} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.suggest_meal_tags.includes(tag)}
                          onChange={(e) => {
                            const tags = e.target.checked
                              ? [...formData.suggest_meal_tags, tag]
                              : formData.suggest_meal_tags.filter(t => t !== tag);
                            setFormData({ ...formData, suggest_meal_tags: tags });
                          }}
                          className="w-4 h-4"
                        />
                        <span className="text-sm">{tag}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>תפקיד בקומבינציה</Label>
                  <Select 
                    value={formData.suggest_role} 
                    onValueChange={(v) => setFormData({ ...formData, suggest_role: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="בחר תפקיד" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="חלבון">💪 חלבון</SelectItem>
                      <SelectItem value="פחמימה">🍞 פחמימה</SelectItem>
                      <SelectItem value="שומן">🥑 שומן</SelectItem>
                      <SelectItem value="ירק/חופשי">🥗 ירק/חופשי</SelectItem>
                      <SelectItem value="מתוק/פינוק">🍰 מתוק/פינוק</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>עדיפות (1-5)</Label>
                  <Select 
                    value={formData.suggest_priority.toString()} 
                    onValueChange={(v) => setFormData({ ...formData, suggest_priority: Number(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - נמוכה</SelectItem>
                      <SelectItem value="2">2</SelectItem>
                      <SelectItem value="3">3 - בינונית</SelectItem>
                      <SelectItem value="4">4</SelectItem>
                      <SelectItem value="5">5 - גבוהה</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
            <Save className="w-4 h-4 ml-2" />
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tab 2: CSV Import
function ImportTab() {
  const [importResult, setImportResult] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [currentBatchId, setCurrentBatchId] = useState(null);
  const [showLogs, setShowLogs] = useState(false);
  const [selectedBatchForLogs, setSelectedBatchForLogs] = useState(null);
  const [duplicatePolicy, setDuplicatePolicy] = useState('skip'); // 'skip' or 'update'
  const [processingStage, setProcessingStage] = useState('');
  const [showStuckReport, setShowStuckReport] = useState(false);
  const [stuckReportBatch, setStuckReportBatch] = useState(null);
  const [previewData, setPreviewData] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [manualDelimiter, setManualDelimiter] = useState('auto');
  const [stagingComplete, setStagingComplete] = useState(false);
  const [commitInProgress, setCommitInProgress] = useState(false);
  const queryClient = useQueryClient();

  // Real-time polling for active import
  const { data: activeBatch, refetch: refetchBatch } = useQuery({
    queryKey: ['activeBatch', currentBatchId],
    queryFn: async () => {
      if (!currentBatchId) return null;
      const batches = await base44.entities.ImportBatch.filter({ id: currentBatchId });
      return batches[0] || null;
    },
    enabled: !!currentBatchId && isProcessing,
    refetchInterval: isProcessing ? 1000 : false, // Poll every 1 second while processing
  });

  // Count items actually added to DB
  const { data: addedCount = 0 } = useQuery({
    queryKey: ['importedItems', currentBatchId],
    queryFn: async () => {
      if (!currentBatchId) return 0;
      const items = await base44.entities.FoodItem.filter({ import_batch_id: currentBatchId });
      return items.length;
    },
    enabled: !!currentBatchId,
    refetchInterval: isProcessing ? 2000 : false,
  });

  // Stop polling when batch completes
  React.useEffect(() => {
    if (activeBatch && ['completed', 'failed', 'stopped'].includes(activeBatch.status)) {
      setIsProcessing(false);
      if (activeBatch.status === 'completed') {
        refetchBatch();
        queryClient.invalidateQueries({ queryKey: ['importedItems', currentBatchId] });
      }
    }
  }, [activeBatch?.status]);

  const normalizeName = (name) => {
    if (!name) return '';
    return name
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .toLowerCase();
  };

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: importBatches = [] } = useQuery({
    queryKey: ['importBatches'],
    queryFn: () => base44.entities.ImportBatch.list('-created_date', 50),
    refetchInterval: isProcessing ? 2000 : false,
  });

  const { data: currentBatch } = useQuery({
    queryKey: ['currentBatch', currentBatchId],
    queryFn: () => base44.entities.ImportBatch.filter({ id: currentBatchId }),
    enabled: !!currentBatchId,
    refetchInterval: isProcessing ? 2000 : false,
  });

  const { data: batchLogs = [] } = useQuery({
    queryKey: ['batchLogs', selectedBatchForLogs || currentBatchId],
    queryFn: () => base44.entities.ImportBatchLog.filter({ 
      batch_id: selectedBatchForLogs || currentBatchId 
    }, '-created_date', 20),
    enabled: !!(selectedBatchForLogs || currentBatchId),
    refetchInterval: isProcessing ? 2000 : false,
  });

  const addLog = async (batchId, level, message, rowNumber = null) => {
    try {
      await base44.entities.ImportBatchLog.create({
        batch_id: batchId,
        level,
        message,
        row_number: rowNumber,
      });
    } catch (err) {
      console.error('Failed to add log:', err);
    }
  };

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const bulkInsertBatch = async (items, batchId, retryCount = 0) => {
    try {
      console.log(`[IMPORT] Bulk inserting ${items.length} items...`);
      const results = { added: 0, failed: 0, errors: [] };
      
      // Bulk create all items at once
      try {
        await base44.entities.FoodItem.bulkCreate(items);
        results.added = items.length;
        console.log(`[IMPORT] Bulk insert successful: ${items.length} items`);
      } catch (bulkErr) {
        // If bulk fails, try one by one to identify problematic items
        console.warn(`[IMPORT] Bulk insert failed, trying one-by-one:`, bulkErr.message);
        await addLog(batchId, 'warn', `Bulk insert failed, processing individually: ${bulkErr.message}`);
        
        for (const item of items) {
          try {
            await base44.entities.FoodItem.create(item);
            results.added++;
          } catch (err) {
            results.failed++;
            results.errors.push({ name: item.name_he, reason: err.message });
            await addLog(batchId, 'error', `Failed: ${item.name_he} - ${err.message}`);
          }
        }
      }
      
      return results;
    } catch (err) {
      const isRateLimit = err.message?.toLowerCase().includes('rate') || 
                          err.message?.toLowerCase().includes('limit') ||
                          err.message?.toLowerCase().includes('429');
      
      if (isRateLimit && retryCount < 3) {
        const waitTime = Math.pow(2, retryCount) * 1000;
        console.log(`[IMPORT] Rate limit, waiting ${waitTime}ms...`);
        await addLog(batchId, 'warn', `Rate limit - retry ${retryCount + 1}/3 after ${waitTime/1000}s`);
        await sleep(waitTime);
        return bulkInsertBatch(items, batchId, retryCount + 1);
      }
      throw err;
    }
  };

  const checkCancellation = async (batchId) => {
    try {
      const batches = await base44.entities.ImportBatch.filter({ id: batchId });
      return batches[0]?.cancel_requested === true;
    } catch {
      return false;
    }
  };

  const removeBOM = (text) => {
    if (text.charCodeAt(0) === 0xFEFF) {
      return text.slice(1);
    }
    return text;
  };

  const detectDelimiter = (text, manual = 'auto') => {
    if (manual !== 'auto') {
      return manual === 'tab' ? '\t' : manual;
    }

    const firstLine = text.split('\n')[0];
    const delimiters = [',', ';', '\t'];
    const counts = delimiters.map(d => ({
      delimiter: d,
      count: (firstLine.match(new RegExp(`\\${d}`, 'g')) || []).length
    }));
    
    counts.sort((a, b) => b.count - a.count);
    return counts[0].count > 0 ? counts[0].delimiter : ',';
  };

  const normalizeHeader = (header) => {
    if (!header) return '';
    return header
      .trim()
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remove zero-width chars
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .replace(/-/g, '_') // Replace hyphens with underscores
      .toLowerCase();
  };

  const normalizeNumber = (value) => {
    if (!value || value.trim() === '') return 0;
    const trimmed = value
      .trim()
      .replace(/[%]/g, '') // Remove % sign
      .replace(/[a-zA-Zא-ת]/g, '') // Remove units (g, kg, gram, etc.)
      .replace(',', '.') // Replace comma with dot
      .trim();
    if (trimmed === '') return 0;
    const num = parseFloat(trimmed);
    return isNaN(num) ? null : num;
  };

  const handleAnalyzeAndStage = async (file) => {
    if (!file) return;

    try {
      toast.loading('מנתח ושומר ל-Staging...', { id: 'staging' });

      let text = await file.text();
      text = removeBOM(text);

      const delimiter = detectDelimiter(text, manualDelimiter);
      const delimiterName = delimiter === '\t' ? 'טאבים' : delimiter === ';' ? 'נקודה-פסיק' : 'פסיק';

      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        toast.error('הקובץ ריק או לא תקין', { id: 'preview' });
        return;
      }

      // Parse and normalize headers
      const rawHeaders = lines[0].split(delimiter).map(h => h.trim());
      const normalizedHeaders = rawHeaders.map(h => normalizeHeader(h));
      const rows = lines.slice(1);

      const requiredHeaders = ['name_he', 'category', 'per100_kcal', 'per100_protein', 'per100_carbs', 'per100_fat'];
      const missingHeaders = requiredHeaders.filter(h => !normalizedHeaders.includes(h));
      
      // Show mapping if headers were transformed
      const headerMapping = {};
      rawHeaders.forEach((raw, idx) => {
        const normalized = normalizedHeaders[idx];
        if (raw !== normalized) {
          headerMapping[raw] = normalized;
        }
      });

      const sampleRows = [];
      const invalidSamples = [];

      for (let i = 0; i < Math.min(5, rows.length); i++) {
        const values = rows[i].split(delimiter).map(v => v.trim());
        const row = {};
        normalizedHeaders.forEach((h, idx) => { row[h] = values[idx] || ''; });

        const kcal = normalizeNumber(row.per100_kcal);
        const protein = normalizeNumber(row.per100_protein);
        const carbs = normalizeNumber(row.per100_carbs);
        const fat = normalizeNumber(row.per100_fat);

        const isValid = row.name_he && row.category && kcal !== null;
        
        sampleRows.push({
          rowNumber: i + 2,
          name_he: row.name_he || '(ריק)',
          category: row.category || '(ריק)',
          per100_kcal: kcal !== null ? kcal : 'לא תקין',
          per100_protein: protein !== null ? protein : 'לא תקין',
          per100_carbs: carbs !== null ? carbs : 'לא תקין',
          per100_fat: fat !== null ? fat : 'לא תקין',
          isValid
        });

        if (!isValid && invalidSamples.length < 3) {
          let reason = '';
          if (!row.name_he) reason = 'חסר שם מוצר';
          else if (!row.category) reason = 'חסרה קטגוריה';
          else if (kcal === null) reason = 'ערך קלוריות לא תקין';
          
          invalidSamples.push({
            rowNumber: i + 2,
            reason,
            data: row
          });
        }
      }

      // Create staging records
      if (missingHeaders.length === 0) {
        const batchId = crypto.randomUUID();
        const stagingRecords = [];
        const seenKeys = new Set();
        
        // Fetch existing items for duplicate detection
        const existingItems = await base44.entities.FoodItem.list();
        const existingMap = new Map();
        existingItems.forEach(item => {
          if (item.normalized_name && item.category) {
            const key = `${item.normalized_name}|${item.category}`;
            existingMap.set(key, item);
          }
        });

        for (let i = 0; i < rows.length; i++) {
          const values = rows[i].split(delimiter).map(v => v.trim());
          const row = {};
          normalizedHeaders.forEach((h, idx) => { row[h] = values[idx] || ''; });

          const kcal = normalizeNumber(row.per100_kcal);
          const protein = normalizeNumber(row.per100_protein);
          const carbs = normalizeNumber(row.per100_carbs);
          const fat = normalizeNumber(row.per100_fat);

          const normalized = normalizeName(row.name_he);
          const uniqueKey = `${normalized}|${row.category || 'אחר'}`;

          const validationErrors = [];
          let validationStatus = 'valid';
          let existingItemId = null;

          // Validation
          if (!row.name_he) validationErrors.push('חסר שם מוצר');
          if (!row.category) validationErrors.push('חסרה קטגוריה');
          if (kcal === null) validationErrors.push('קלוריות לא תקינות');
          
          if (validationErrors.length > 0) {
            validationStatus = 'invalid';
          } else if (seenKeys.has(uniqueKey)) {
            validationStatus = 'duplicate_in_file';
          } else if (existingMap.has(uniqueKey)) {
            validationStatus = 'duplicate_in_db';
            existingItemId = existingMap.get(uniqueKey).id;
          }

          seenKeys.add(uniqueKey);

          stagingRecords.push({
            batch_id: batchId,
            row_index: i,
            row_number: i + 2,
            unique_key: uniqueKey,
            data: {
              name_he: row.name_he,
              normalized_name: normalized,
              category: row.category || 'אחר',
              per100_kcal: kcal !== null ? kcal : 0,
              per100_protein: protein !== null ? protein : 0,
              per100_carbs: carbs !== null ? carbs : 0,
              per100_fat: fat !== null ? fat : 0,
              brand: row.brand || '',
              barcodes: row.barcodes ? row.barcodes.split(';').map(b => b.trim()).filter(b => b) : [],
            },
            validation_status: validationStatus,
            validation_errors: validationErrors,
            existing_item_id: existingItemId,
            processed: false,
          });
        }

        // Save to staging
        toast.loading('שומר ל-Staging...', { id: 'staging' });
        await base44.entities.ImportStaging.bulkCreate(stagingRecords);

        const validCount = stagingRecords.filter(r => r.validation_status === 'valid').length;
        const invalidCount = stagingRecords.filter(r => r.validation_status === 'invalid').length;
        const dupFileCount = stagingRecords.filter(r => r.validation_status === 'duplicate_in_file').length;
        const dupDbCount = stagingRecords.filter(r => r.validation_status === 'duplicate_in_db').length;

        setPreviewData({
          batchId,
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(2),
          delimiter,
          delimiterName,
          rawHeaders,
          normalizedHeaders,
          headerMapping,
          missingHeaders,
          totalRows: rows.length,
          validCount,
          invalidCount,
          dupFileCount,
          dupDbCount,
          sampleRows,
          invalidSamples,
          isValid: missingHeaders.length === 0 && validCount > 0
        });

        setStagingComplete(true);
        toast.success(`Staging הושלם: ${validCount} תקינים, ${invalidCount} שגויים`, { id: 'staging' });
      } else {
        setPreviewData({
          fileName: file.name,
          fileSize: (file.size / 1024).toFixed(2),
          delimiter,
          delimiterName,
          rawHeaders,
          normalizedHeaders,
          headerMapping,
          missingHeaders,
          totalRows: rows.length,
          sampleRows,
          invalidSamples,
          isValid: false
        });
        toast.error('חסרות כותרות חובה', { id: 'staging' });
      }
    } catch (err) {
      toast.error(`שגיאה בניתוח קובץ: ${err.message}`, { id: 'preview' });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewData(null);
    setStagingComplete(false);
    handleAnalyzeAndStage(file);
  };

  const handleCommitImport = async () => {
    if (!previewData?.batchId || !stagingComplete) {
      toast.error('Staging לא הושלם');
      return;
    }

    setCommitInProgress(true);
    setIsProcessing(true);
    setImportResult(null);
    setProcessingStage('');

    const batchId = previewData.batchId;
    let currentStage = '';

    try {
      // Create import batch record
      await base44.entities.ImportBatch.create({
        id: batchId,
        file_name: previewData.fileName,
        created_by: user?.id || user?.email,
        rows_total: previewData.totalRows,
        rows_processed: 0,
        rows_added: 0,
        rows_updated: 0,
        rows_failed: 0,
        progress_percent: 0,
        status: 'running',
      });

      setCurrentBatchId(batchId);
      await addLog(batchId, 'info', '[COMMIT] Starting commit from staging');

      // Get all valid and duplicate_in_db records from staging
      const stagingRecords = await base44.entities.ImportStaging.filter({ batch_id: batchId });
      const toProcess = stagingRecords.filter(r => 
        !r.processed && (r.validation_status === 'valid' || (r.validation_status === 'duplicate_in_db' && duplicatePolicy === 'update'))
      );

      console.log(`[COMMIT] Processing ${toProcess.length} records from staging`);
      await addLog(batchId, 'info', `[COMMIT] ${toProcess.length} records to process`);

      const BATCH_SIZE = 25;
      const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);
      let processed = 0;
      let added = 0;
      let updated = 0;
      let failed = 0;

      currentStage = 'committing';
      setProcessingStage(`מבצע Commit (${totalBatches} batches)...`);

      for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
        const cancelled = await checkCancellation(batchId);
        if (cancelled) {
          await addLog(batchId, 'warn', 'Commit cancelled by user');
          await base44.entities.ImportBatch.update(batchId, { status: 'stopped' });
          toast.info('הייבוא בוטל');
          break;
        }

        const batch = toProcess.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        setProcessingStage(`Commit batch ${batchNum}/${totalBatches}...`);
        console.log(`[COMMIT] Processing batch ${batchNum}/${totalBatches}`);

        for (const record of batch) {
          let retryCount = 0;
          let success = false;

          while (retryCount < 3 && !success) {
            try {
              if (record.validation_status === 'duplicate_in_db' && duplicatePolicy === 'update') {
                // Update existing
                await base44.entities.FoodItem.update(record.existing_item_id, {
                  ...record.data,
                  source: 'import',
                  import_batch_id: batchId,
                  imported_at: new Date().toISOString(),
                  imported_by: user?.id || user?.email,
                });
                updated++;
                await base44.entities.ImportStaging.update(record.id, {
                  processed: true,
                  processed_at: new Date().toISOString(),
                  process_result: 'updated'
                });
              } else {
                // Insert new
                await base44.entities.FoodItem.create({
                  ...record.data,
                  source: 'import',
                  active: true,
                  import_batch_id: batchId,
                  imported_at: new Date().toISOString(),
                  imported_by: user?.id || user?.email,
                });
                added++;
                await base44.entities.ImportStaging.update(record.id, {
                  processed: true,
                  processed_at: new Date().toISOString(),
                  process_result: 'added'
                });
              }
              success = true;
            } catch (err) {
              const isRateLimit = err.message?.toLowerCase().includes('rate') || 
                                  err.message?.toLowerCase().includes('limit');
              
              if (isRateLimit && retryCount < 2) {
                const waitTime = Math.pow(2, retryCount) * 1000;
                console.log(`[COMMIT] Rate limit, retry ${retryCount + 1}/3 after ${waitTime}ms`);
                await sleep(waitTime);
                retryCount++;
              } else {
                console.error(`[COMMIT] Failed to process record:`, err);
                failed++;
                await base44.entities.ImportStaging.update(record.id, {
                  processed: true,
                  processed_at: new Date().toISOString(),
                  process_result: 'failed',
                  process_error: err.message
                });
                await addLog(batchId, 'error', `Failed row ${record.row_number}: ${err.message}`);
                break;
              }
            }
          }

          processed++;
        }

        // Update progress
        const progress = Math.floor((processed / toProcess.length) * 100);
        await base44.entities.ImportBatch.update(batchId, {
          rows_processed: processed,
          rows_added: added,
          rows_updated: updated,
          rows_failed: failed,
          progress_percent: progress,
        });

        await addLog(batchId, 'info', `[COMMIT] Batch ${batchNum}/${totalBatches}: +${added}, ~${updated}, x${failed}`);

        if (i + BATCH_SIZE < toProcess.length) {
          await sleep(300);
        }
      }

      currentStage = 'done';
      await base44.entities.ImportBatch.update(batchId, {
        status: 'completed',
        progress_percent: 100,
        rows_processed: toProcess.length,
      });

      const skipped = previewData.dupDbCount + previewData.dupFileCount + previewData.invalidCount;
      await addLog(batchId, 'info', `[FINAL] Added: ${added}, Updated: ${updated}, Failed: ${failed}, Skipped: ${skipped}`);

      setImportResult({
        success: true,
        added,
        updated,
        failed,
        skipped_db: previewData.dupDbCount,
        skipped_file: previewData.dupFileCount,
        invalid: previewData.invalidCount,
        duplicates_in_db: [],
        duplicates_in_file: [],
        batchId
      });

      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });

      const summary = [];
      if (added > 0) summary.push(`${added} נוספו`);
      if (updated > 0) summary.push(`${updated} עודכנו`);
      if (failed > 0) summary.push(`${failed} נכשלו`);

      toast.success(`✅ Commit הושלם: ${summary.join(', ')}`);
      setStagingComplete(false);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err) {
      console.error('[COMMIT] Error:', err);
      await addLog(batchId, 'error', `[CRITICAL] ${err.message}`);
      await base44.entities.ImportBatch.update(batchId, {
        status: 'failed',
        last_error: err.message,
      });
      toast.error(`❌ שגיאה: ${err.message}`);
    } finally {
      setCommitInProgress(false);
      setIsProcessing(false);
      setCurrentBatchId(null);
      setProcessingStage('');
    }
  };

  const handleDownloadReport = async () => {
    if (!previewData?.batchId) return;

    try {
      const stagingRecords = await base44.entities.ImportStaging.filter({ batch_id: previewData.batchId });
      
      let csv = 'מספר_שורה,שם_מוצר,קטגוריה,סטטוס,שגיאות\n';
      
      stagingRecords.forEach(record => {
        const status = {
          'valid': 'תקין',
          'invalid': 'לא תקין',
          'duplicate_in_file': 'כפילות בקובץ',
          'duplicate_in_db': 'כפילות במאגר'
        }[record.validation_status];
        
        const errors = (record.validation_errors || []).join('; ');
        csv += `${record.row_number},"${record.data.name_he}","${record.data.category}",${status},"${errors}"\n`;
      });

      const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `import_report_${previewData.batchId}.csv`;
      link.click();
      
      toast.success('דוח הורד בהצלחה');
    } catch (err) {
      toast.error(`שגיאה בהורדת דוח: ${err.message}`);
    }
  };

  const handleResumeImport = async (batchIdToResume) => {
    // TODO: Implement resume logic
    toast.info('Resume בפיתוח');
  };

  const handleOldStartImport = async () => {
    if (!selectedFile || !previewData || !previewData.isValid) {
      toast.error('נא לבדוק את הקובץ לפני ייבוא');
      return;
    }

    const file = selectedFile;
    setIsProcessing(true);
    setImportResult(null);
    setProcessingStage('');

    let batchId = null;
    let currentStage = '';

    try {
      batchId = crypto.randomUUID();
      
      // ===== STAGE 1: Load File =====
      currentStage = 'file_loaded';
      console.log('[DEBUG] STAGE 1: Loading CSV file...');
      setProcessingStage('שלב 1/6: טוען קובץ...');
      await addLog(batchId, 'info', `[STAGE] file_loaded`);
      
      let text = await file.text();
      text = removeBOM(text);
      const fileSize = (file.size / 1024).toFixed(2);
      const fileBytes = file.size;
      
      console.log(`[DEBUG] ✓ CSV file loaded: ${fileSize}KB (${fileBytes} bytes)`);
      await addLog(batchId, 'info', `[STAGE 1] CSV file loaded: ${file.name} (${fileSize}KB, ${fileBytes} bytes)`);

      if (!text || text.length === 0) {
        throw new Error('File is empty - no content');
      }

      // ===== STAGE 2: Read Headers =====
      currentStage = 'headers';
      console.log('[DEBUG] STAGE 2: Reading headers...');
      setProcessingStage('שלב 2/6: קורא כותרות...');
      await addLog(batchId, 'info', `[STAGE] headers`);

      const delimiter = previewData.delimiter;
      const lines = text.split('\n').filter(l => l.trim());
      if (lines.length < 2) {
        await addLog(batchId, 'error', `[STAGE 2] File has only ${lines.length} lines - need at least 2`);
        throw new Error('קובץ ריק או לא תקין - נדרשות לפחות 2 שורות');
      }

      const rawHeaders = lines[0].split(delimiter).map(h => h.trim());
      const headers = rawHeaders.map(h => normalizeHeader(h));
      console.log(`[DEBUG] ✓ Raw headers:`, rawHeaders);
      console.log(`[DEBUG] ✓ Normalized headers:`, headers);
      await addLog(batchId, 'info', `[STAGE 2] Headers detected: ${headers.join(', ')}`);

      // Check required headers
      const requiredHeaders = ['name_he', 'category', 'per100_kcal', 'per100_protein', 'per100_carbs', 'per100_fat'];
      const missingHeaders = requiredHeaders.filter(h => !headers.includes(h));
      if (missingHeaders.length > 0) {
        console.warn(`[DEBUG] ⚠️ Missing required headers:`, missingHeaders);
        await addLog(batchId, 'warn', `[STAGE 2] Missing required headers: ${missingHeaders.join(', ')}`);
      }

      // ===== STAGE 3: Parse Rows =====
      currentStage = 'rows_parsed';
      console.log('[DEBUG] STAGE 3: Parsing rows...');
      setProcessingStage('שלב 3/6: מפרסר שורות...');
      await addLog(batchId, 'info', `[STAGE] rows_parsed`);

      const rows = lines.slice(1);
      console.log(`[DEBUG] ✓ Parsed rows count: ${rows.length}`);
      await addLog(batchId, 'info', `[STAGE 3] Parsed rows count: ${rows.length}`);

      // Create batch record
      currentStage = 'Creating batch record';
      console.log('[DEBUG] Creating ImportBatch record...');
      await base44.entities.ImportBatch.create({
        id: batchId,
        file_name: file.name,
        created_by: user?.id || user?.email,
        rows_total: rows.length,
        rows_processed: 0,
        rows_added: 0,
        rows_updated: 0,
        rows_failed: 0,
        progress_percent: 2,
        status: 'running',
      });

      setCurrentBatchId(batchId);
      console.log('[DEBUG] ✓ ImportBatch record created');
      await addLog(batchId, 'info', `[STAGE 3] ImportBatch record created successfully`);

      const result = {
        success: false,
        added: 0,
        failed: 0,
        skipped_db: 0,
        skipped_file: 0,
        errors: [],
        duplicates_in_db: [],
        duplicates_in_file: [],
        batchId
      };

      // ===== STAGE 4: Validation =====
      currentStage = 'Validating rows';
      console.log('[DEBUG] STAGE 4: Validating rows...');
      setProcessingStage('שלב 4/6: מאמת שורות...');
      
      const validatedItems = [];
      const seenInFile = new Set();
      const sampleInvalidRows = [];

      for (let i = 0; i < rows.length; i++) {
        const values = rows[i].split(delimiter).map(v => v.trim());
        const row = {};
        headers.forEach((h, idx) => { row[h] = values[idx]; });

        // Validation
        if (!row.name_he || !row.category || !row.per100_kcal) {
          result.failed++;
          let reason = 'חסרים שדות חובה';
          if (!row.name_he) reason = 'חסר שם מוצר';
          else if (!row.category) reason = 'חסרה קטגוריה';
          else if (!row.per100_kcal) reason = 'חסרות קלוריות';
          
          result.errors.push({ line: i + 2, reason });
          if (sampleInvalidRows.length < 3) {
            sampleInvalidRows.push({ line: i + 2, data: row, reason });
          }
          continue;
        }

        const kcal = normalizeNumber(row.per100_kcal);
        if (kcal === null || kcal < 0) {
          result.failed++;
          result.errors.push({ line: i + 2, reason: 'קלוריות לא תקינות' });
          if (sampleInvalidRows.length < 3) {
            sampleInvalidRows.push({ line: i + 2, data: row, reason: 'קלוריות לא תקינות' });
          }
          continue;
        }

        const normalized = normalizeName(row.name_he);
        const uniqueKey = `${normalized}|${row.category || 'אחר'}`;

        // Check duplicates within file
        if (duplicatePolicy === 'skip' && seenInFile.has(uniqueKey)) {
          result.skipped_file++;
          result.duplicates_in_file.push({ line: i + 2, name: row.name_he, category: row.category });
          continue;
        }

        seenInFile.add(uniqueKey);

        validatedItems.push({
          rowIndex: i,
          normalized,
          uniqueKey,
          data: {
            name_he: row.name_he,
            normalized_name: normalized,
            category: row.category || 'אחר',
            per100_kcal: kcal,
            per100_protein: normalizeNumber(row.per100_protein) || 0,
            per100_carbs: normalizeNumber(row.per100_carbs) || 0,
            per100_fat: normalizeNumber(row.per100_fat) || 0,
            brand: row.brand || '',
            barcodes: row.barcodes ? row.barcodes.split(';').map(b => b.trim()).filter(b => b) : [],
            source: 'import',
            active: true,
            import_batch_id: batchId,
            imported_at: new Date().toISOString(),
            imported_by: user?.id || user?.email,
          }
        });
      }

      console.log(`[DEBUG] ✓ STAGE 4 Complete: Valid rows: ${validatedItems.length}, Invalid rows: ${result.failed}`);
      await addLog(batchId, 'info', `[STAGE 4] Validation complete: ${validatedItems.length} valid, ${result.failed} failed, ${result.skipped_file} duplicates in file`);
      
      // Log sample invalid rows
      if (sampleInvalidRows.length > 0) {
        console.warn(`[DEBUG] Sample invalid rows:`, sampleInvalidRows);
        for (const inv of sampleInvalidRows) {
          await addLog(batchId, 'warn', `[STAGE 4] Invalid row ${inv.line}: ${inv.reason} - data: ${JSON.stringify(inv.data).substring(0, 100)}`);
        }
      }

      await base44.entities.ImportBatch.update(batchId, { progress_percent: 5 });

      // Check for duplicates in DB (batch query)
      if (validatedItems.length > 0) {
        currentStage = 'Checking duplicates in DB';
        console.log('[DEBUG] STAGE 4.5: Checking for duplicates in DB...');
        setProcessingStage('שלב 4.5/6: בודק כפילויות במאגר...');
        
        try {
          const existingItems = await base44.entities.FoodItem.list();
          const existingMap = new Map();
          existingItems.forEach(item => {
            if (item.normalized_name && item.category) {
              const key = `${item.normalized_name}|${item.category}`;
              existingMap.set(key, item);
            }
          });

          validatedItems.forEach((item, idx) => {
            const existingItem = existingMap.get(item.uniqueKey);
            
            if (existingItem) {
              if (duplicatePolicy === 'skip') {
                result.skipped_db++;
                result.duplicates_in_db.push({ 
                  line: item.rowIndex + 2, 
                  name: item.data.name_he,
                  category: item.data.category
                });
                validatedItems[idx] = null; // Mark for removal
              } else if (duplicatePolicy === 'update') {
                // Mark for update instead of insert
                validatedItems[idx] = {
                  ...item,
                  updateMode: true,
                  existingId: existingItem.id
                };
                result.updated = (result.updated || 0) + 1;
              }
            }
          });

          console.log(`[DEBUG] ✓ Duplicates check complete: ${result.skipped_db} skipped, ${result.updated || 0} to update`);
          await addLog(batchId, 'info', `[STAGE 4.5] Duplicates: ${result.skipped_db} skipped, ${result.updated || 0} will update`);
        } catch (err) {
          console.warn('[DEBUG] ⚠️ Duplicate check failed:', err);
          await addLog(batchId, 'warn', `[STAGE 4.5] Duplicate check failed: ${err.message}`);
        }

        await base44.entities.ImportBatch.update(batchId, { progress_percent: 10 });
      }

      // Separate items to insert vs update
      const itemsToInsert = validatedItems.filter(v => v !== null && !v.updateMode).map(v => v.data);
      const itemsToUpdate = validatedItems.filter(v => v !== null && v.updateMode);
      
      console.log(`[DEBUG] Items to insert: ${itemsToInsert.length}, items to update: ${itemsToUpdate.length}`);
      await addLog(batchId, 'info', `[STAGE 4.5] Items to insert: ${itemsToInsert.length}, to update: ${itemsToUpdate.length}`);

      // Timeout protection
      const timeoutId = setTimeout(() => {
        console.error('[IMPORT] TIMEOUT: Process stuck for 30s');
        setProcessingStage('⚠️ התהליך נתקע - מבטל...');
        setIsProcessing(false);
      }, 30000);

      if (itemsToInsert.length === 0 && itemsToUpdate.length === 0) {
        console.log('[IMPORT] No items to process after filtering');
        await addLog(batchId, 'warn', 'No items to process - all were filtered');
        await base44.entities.ImportBatch.update(batchId, {
          status: 'completed',
          progress_percent: 100,
          rows_processed: rows.length,
        });
        
        clearTimeout(timeoutId);
        result.success = true;
        setImportResult(result);
        toast.info('לא היו פריטים לעיבוד');
        setIsProcessing(false);
        setProcessingStage('');
        return;
      }

      // ===== STAGE 5: Before DB Insert/Update =====
      currentStage = 'inserting';
      const BATCH_SIZE = 100;
      const totalItems = itemsToInsert.length + itemsToUpdate.length;
      const totalBatches = Math.ceil(itemsToInsert.length / BATCH_SIZE) + (itemsToUpdate.length > 0 ? 1 : 0);
      
      console.log(`[DEBUG] STAGE 5: Starting batch operations...`);
      console.log(`[DEBUG] To insert: ${itemsToInsert.length}, To update: ${itemsToUpdate.length}, Total batches: ${totalBatches}`);
      setProcessingStage(`שלב 5/6: שומר למאגר (${totalBatches} batches)...`);
      await addLog(batchId, 'info', `[STAGE] inserting`);
      await addLog(batchId, 'info', `[STAGE 5] Starting: ${itemsToInsert.length} inserts, ${itemsToUpdate.length} updates`);
      
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        // Check for cancellation request before each batch
        const cancelled = await checkCancellation(batchId);
        if (cancelled) {
          console.log('[IMPORT] Cancellation requested - stopping');
          await addLog(batchId, 'warn', 'Import cancelled by user');
          await base44.entities.ImportBatch.update(batchId, {
            status: 'stopped',
            stopped_at: new Date().toISOString(),
          });
          clearTimeout(timeoutId);
          toast.info('הייבוא בוטל');
          setIsProcessing(false);
          setProcessingStage('');
          return;
        }

        const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
        const batchNum = Math.floor(i / BATCH_SIZE) + 1;
        
        console.log(`[DEBUG] Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);
        setProcessingStage(`שלב 5/6: שומר batch ${batchNum}/${totalBatches}...`);
        
        const batchResult = await bulkInsertBatch(batch, batchId);
        
        result.added += batchResult.added;
        result.failed += batchResult.failed;
        result.errors.push(...batchResult.errors);

        // ===== STAGE 6: After DB Insert (per batch) =====
        console.log(`[DEBUG] ✓ Batch ${batchNum}/${totalBatches} complete - Added: ${batchResult.added}, Failed: ${batchResult.failed}`);

        // Update progress in real-time (10-95% for insert)
        const processedItems = Math.min(i + BATCH_SIZE, itemsToInsert.length);
        const progress = Math.max(1, Math.floor(10 + (processedItems / itemsToInsert.length) * 85));
        
        await base44.entities.ImportBatch.update(batchId, {
          rows_processed: rows.length,
          rows_added: result.added,
          rows_updated: result.updated || 0,
          rows_failed: result.failed + result.skipped_db + result.skipped_file,
          progress_percent: progress,
          status: 'running',
        });

        // Log batch completion
        await addLog(batchId, 'info', `[STAGE 6] Batch ${batchNum}/${totalBatches} done: processed=${processedItems}/${itemsToInsert.length}, added=${batchResult.added}, failed=${batchResult.failed}`);

        // Wait between batches
        if (i + BATCH_SIZE < itemsToInsert.length) {
          await sleep(300);
        }
      }

      // Process updates
      if (itemsToUpdate.length > 0) {
        console.log(`[DEBUG] Processing ${itemsToUpdate.length} updates...`);
        setProcessingStage(`שלב 5/6: מעדכן ${itemsToUpdate.length} מוצרים...`);
        
        let updatedCount = 0;
        for (const item of itemsToUpdate) {
          try {
            await base44.entities.FoodItem.update(item.existingId, item.data);
            updatedCount++;
          } catch (err) {
            console.warn(`[UPDATE] Failed to update item:`, err);
            result.failed++;
            result.errors.push({ name: item.data.name_he, reason: `Update failed: ${err.message}` });
          }
        }
        
        result.updated = updatedCount;
        console.log(`[DEBUG] ✓ Updated ${updatedCount} items`);
        await addLog(batchId, 'info', `[STAGE 5] Updated ${updatedCount} existing items`);
      }

      clearTimeout(timeoutId);

      // ===== FINAL STAGE: Finalization =====
      currentStage = 'done';
      console.log('[DEBUG] STAGE 6: Finalizing import...');
      setProcessingStage('שלב 6/6: סיום...');
      await addLog(batchId, 'info', `[STAGE] done`);
      
      await base44.entities.ImportBatch.update(batchId, {
        status: 'completed',
        progress_percent: 100,
        rows_processed: rows.length,
        rows_updated: result.updated || 0,
      });

      const totalProcessed = result.added + (result.updated || 0) + result.skipped_db + result.skipped_file + result.failed;
      const summaryMsg = `Import complete: ${result.added} added, ${result.updated || 0} updated, ${result.skipped_db} DB duplicates, ${result.skipped_file} file duplicates, ${result.failed} failed. Total: ${totalProcessed}/${rows.length}`;
      
      console.log(`[DEBUG] ✓✓✓ ${summaryMsg}`);
      await addLog(batchId, 'info', `[FINAL] ${summaryMsg}`);

      setImportResult(result);
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      
      const summary = [];
      if (result.added > 0) summary.push(`${result.added} נוספו`);
      if (result.updated > 0) summary.push(`${result.updated} עודכנו`);
      if (result.skipped_db > 0) summary.push(`${result.skipped_db} דולגו`);
      
      result.success = true;
      toast.success(`✅ הייבוא הושלם: ${summary.join(', ')}`);
      setPreviewData(null);
      setSelectedFile(null);
    } catch (err) {
      console.error('[DEBUG] ❌❌❌ CRITICAL ERROR:', err);
      console.error('[DEBUG] Error stack:', err.stack);
      console.error(`[DEBUG] Stopped at stage: ${currentStage}`);
      
      const stageNames = {
        'file_loaded': 'טעינת קובץ',
        'headers': 'קריאת כותרות',
        'rows_parsed': 'פירסור שורות',
        'validated': 'אימות נתונים',
        'inserting': 'כתיבה למאגר',
        'done': 'סיום'
      };
      
      setProcessingStage(`❌ נעצר בשלב: ${stageNames[currentStage] || currentStage}`);
      
      if (batchId) {
        try {
          await base44.entities.ImportBatch.update(batchId, { 
            status: 'failed',
            last_error: `Stage: ${currentStage} - ${err.message}`,
            progress_percent: 0,
          });
          await addLog(batchId, 'error', `[STAGE] ${currentStage}`);
          await addLog(batchId, 'error', `[CRITICAL ERROR] Stopped at stage: ${currentStage}`);
          await addLog(batchId, 'error', `Error message: ${err.message}`);
          await addLog(batchId, 'error', `Error stack: ${err.stack?.substring(0, 500) || 'N/A'}`);
        } catch (logErr) {
          console.error('[DEBUG] Failed to log error:', logErr);
        }
      }
      
      // Return safe error result
      setImportResult({
        success: false,
        added: 0,
        updated: 0,
        failed: 0,
        skipped_db: 0,
        skipped_file: 0,
        errors: [],
        duplicates_in_db: [],
        duplicates_in_file: [],
      });
      
      // Show user-friendly error without crashing UI
      toast.error('הייבוא נכשל – נסה שוב', { duration: 5000 });
    } finally {
      setIsProcessing(false);
      setCurrentBatchId(null);
      if (!processingStage.includes('נעצר')) {
        setProcessingStage('');
      }
    }
  };

  const handleRollback = async (batch) => {
    if (!batch) {
      toast.error('לא נמצא ייבוא לביטול');
      return;
    }

    if (batch.status === 'rolled_back') {
      toast.error('ייבוא זה כבר בוטל');
      return;
    }

    if (batch.status !== 'completed') {
      toast.error('ניתן לבטל רק ייבוא שהסתיים בהצלחה');
      return;
    }

    try {
      // Count items to be disabled
      const items = await base44.entities.FoodItem.filter({ import_batch_id: batch.id });
      const itemsToDisable = items.filter(i => i.active !== false);

      const confirmMsg = 
        `לבטל ייבוא אחרון?\n\n` +
        `קובץ: ${batch.file_name}\n` +
        `תאריך: ${new Date(batch.created_date).toLocaleString('he-IL')}\n\n` +
        `פעולה זו תשבית ${itemsToDisable.length} מוצרים.\n` +
        `המוצרים לא יימחקו אך לא יוצגו למתאמנים.`;

      if (!window.confirm(confirmMsg)) {
        return;
      }

      toast.loading('משבית מוצרים...', { id: 'rollback' });

      // Disable all items from this batch in smaller batches
      const BATCH_SIZE = 25;
      for (let i = 0; i < itemsToDisable.length; i += BATCH_SIZE) {
        const batchItems = itemsToDisable.slice(i, i + BATCH_SIZE);
        await Promise.all(
          batchItems.map(item => base44.entities.FoodItem.update(item.id, { active: false }))
        );
        if (i + BATCH_SIZE < itemsToDisable.length) {
          await sleep(300);
        }
      }

      // Mark batch as rolled back
      await base44.entities.ImportBatch.update(batch.id, { status: 'rolled_back' });

      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      
      toast.success(`ייבוא בוטל בהצלחה. הושבתו ${itemsToDisable.length} פריטים.`, { id: 'rollback' });
    } catch (err) {
      toast.error(`שגיאה בביטול: ${err.message}`, { id: 'rollback' });
    }
  };

  const handleDeletePermanently = async (batch) => {
    if (!window.confirm(
      `מחיקה לצמיתות תמחק מהדאטה את כל הפריטים של ייבוא זה.\n\n` +
      `קובץ: ${batch.file_name}\n` +
      `פריטים: ${batch.rows_added}\n\n` +
      `לא ניתן לשחזר. להמשיך?`
    )) {
      return;
    }

    try {
      toast.loading('מוחק פריטים...', { id: 'delete' });

      // Delete all items from this batch
      const items = await base44.entities.FoodItem.filter({ import_batch_id: batch.id });
      
      for (const item of items) {
        await base44.entities.FoodItem.delete(item.id);
      }

      // Mark batch as deleted
      await base44.entities.ImportBatch.update(batch.id, { status: 'deleted' });
      await addLog(batch.id, 'info', `הייבוא הוסר לצמיתות – נמחקו ${items.length} פריטים`);

      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      
      toast.success(`נמחקו ${items.length} פריטים לצמיתות`, { id: 'delete' });
    } catch (err) {
      toast.error(`שגיאה במחיקה: ${err.message}`, { id: 'delete' });
    }
  };

  const exportBatchItems = async (batch) => {
    try {
      const items = await base44.entities.FoodItem.filter({ import_batch_id: batch.id });
      
      const csv = 'name_he,category,per100_kcal,per100_protein,per100_carbs,per100_fat,brand,barcodes,active\n' +
        items.map(i => `${i.name_he},${i.category},${i.per100_kcal},${i.per100_protein},${i.per100_carbs},${i.per100_fat},${i.brand || ''},${(i.barcodes || []).join(';')},${i.active}`).join('\n');
      
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `export_${batch.file_name}`;
      link.click();
      
      toast.success('הקובץ יוצא בהצלחה');
    } catch (err) {
      toast.error(`שגיאה בייצוא: ${err.message}`);
    }
  };

  const handleHealthCheck = async () => {
    try {
      toast.loading('בודק בריאות המערכת...', { id: 'health' });
      
      // Test read
      await base44.entities.FoodItem.list('-created_date', 1);
      
      // Test write
      const testItem = await base44.entities.FoodItem.create({
        name_he: `__TEST_${Date.now()}__`,
        category: 'אחר',
        per100_kcal: 0,
        per100_protein: 0,
        per100_carbs: 0,
        per100_fat: 0,
        active: false,
      });
      
      // Test delete
      await base44.entities.FoodItem.delete(testItem.id);
      
      toast.success('✅ המערכת תקינה - כל הפעולות עובדות', { id: 'health' });
    } catch (err) {
      toast.error(`❌ בדיקת בריאות נכשלה: ${err.message}`, { id: 'health' });
    }
  };

  const downloadTemplate = () => {
    const csv = 'name_he,category,per100_kcal,per100_protein,per100_carbs,per100_fat,brand,barcodes\n' +
                'חזה עוף,חלבון,165,31,0,3.6,תנובה,\n' +
                'אורז לבן,פחמימה,130,2.7,28,0.3,,';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'food_template.csv';
    link.click();
  };

  const handleCancelImport = async (batch, deleteItems = false) => {
    try {
      if (deleteItems) {
        if (!window.confirm(
          `לעצור ולמחוק את כל מה שהוכנס בייבוא הזה?\n\n` +
          `פעולה זו תמחק את כל המוצרים שיובאו במסגרת ייבוא זה.\n` +
          `לא ניתן לשחזר. להמשיך?`
        )) {
          return;
        }

        toast.loading('מבטל ומוחק...', { id: 'cancel' });

        // Request cancellation first
        await base44.entities.ImportBatch.update(batch.id, {
          cancel_requested: true,
          cancelled_at: new Date().toISOString(),
        });

        // Wait a bit for import to stop
        await sleep(1000);

        // Delete all items from this batch
        const items = await base44.entities.FoodItem.filter({ import_batch_id: batch.id });
        console.log(`[CANCEL] Deleting ${items.length} items...`);
        
        for (const item of items) {
          await base44.entities.FoodItem.delete(item.id);
        }

        // Mark as deleted with complete update
        await base44.entities.ImportBatch.update(batch.id, {
          status: 'deleted',
          cancel_requested: true,
          stopped_at: new Date().toISOString(),
          progress_percent: 100,
          rows_processed: batch.rows_total || 0,
        });

        await addLog(batch.id, 'info', `Import cancelled and deleted: ${items.length} items removed`);

        // Reset state completely
        setImportResult(null);
        setPreviewData(null);
        setStagingComplete(false);
        setCommitInProgress(false);
        setIsProcessing(false);
        setCurrentBatchId(null);
        setSelectedFile(null);
        setProcessingStage('');

        toast.success(`הייבוא בוטל ונמחקו ${items.length} מוצרים`, { id: 'cancel' });
      } else {
        if (!window.confirm(
          `לבטל את הייבוא?\n\n` +
          `הייבוא ייעצר מיידית. המוצרים שכבר הוכנסו יישארו במאגר.\n` +
          `תוכל למחוק אותם מאוחר יותר מההיסטוריה.\n\n` +
          `להמשיך?`
        )) {
          return;
        }

        toast.loading('מבטל ייבוא...', { id: 'cancel' });

        await base44.entities.ImportBatch.update(batch.id, {
          cancel_requested: true,
          cancelled_at: new Date().toISOString(),
          status: 'stopped',
          stopped_at: new Date().toISOString(),
          progress_percent: 100,
          rows_processed: batch.rows_total || 0,
        });

        await addLog(batch.id, 'warn', 'Import cancelled by user - items kept');

        // Reset state completely
        setImportResult(null);
        setPreviewData(null);
        setStagingComplete(false);
        setCommitInProgress(false);
        setIsProcessing(false);
        setCurrentBatchId(null);
        setSelectedFile(null);
        setProcessingStage('');

        toast.success('הייבוא בוטל', { id: 'cancel' });
      }

      queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      queryClient.invalidateQueries({ queryKey: ['activeBatch'] });
      queryClient.invalidateQueries({ queryKey: ['currentBatch'] });
      queryClient.invalidateQueries({ queryKey: ['importedItems'] });
      setIsProcessing(false);
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`, { id: 'cancel' });
    }
  };

  const downloadDuplicatesReport = () => {
    if (!importResult) {
      toast.error('אין תוצאות ייבוא');
      return;
    }

    const duplicates_in_db = (importResult && importResult.duplicates_in_db) ? importResult.duplicates_in_db : [];
    const duplicates_in_file = (importResult && importResult.duplicates_in_file) ? importResult.duplicates_in_file : [];

    if (duplicates_in_db.length === 0 && duplicates_in_file.length === 0) {
      toast.error('אין כפילויות לדווח');
      return;
    }

    let csv = 'סוג כפילות,שורה בקובץ,שם המוצר\n';
    
    duplicates_in_db.forEach(dup => {
      csv += `כבר קיים במאגר,${dup.line},${dup.name}\n`;
    });

    duplicates_in_file.forEach(dup => {
      csv += `כפילות בקובץ,${dup.line},${dup.name}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `duplicates_report_${Date.now()}.csv`;
    link.click();
    toast.success('דוח כפילויות הורד');
  };

  // Auto-fail old stuck batches (older than 10 minutes with status=running)
  React.useEffect(() => {
    const checkStuckBatches = async () => {
      const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
      const stuckBatches = importBatches.filter(b => 
        b.status === 'running' && 
        new Date(b.created_date).getTime() < tenMinutesAgo
      );
      
      for (const batch of stuckBatches) {
        console.log(`[AUTO-FAIL] Marking stuck batch as failed:`, batch.id);
        try {
          await base44.entities.ImportBatch.update(batch.id, {
            status: 'failed',
            last_error: 'Import stuck for more than 10 minutes - auto-failed',
            progress_percent: batch.progress_percent || 0,
          });
          await addLog(batch.id, 'error', 'Auto-failed: stuck for >10 minutes');
        } catch (err) {
          console.error('Failed to auto-fail batch:', err);
        }
      }
      
      if (stuckBatches.length > 0) {
        queryClient.invalidateQueries({ queryKey: ['importBatches'] });
      }
    };
    
    checkStuckBatches();
  }, [importBatches]);

  const lastCompletedBatch = importBatches.find(b => b.status === 'completed');
  const runningBatch = currentBatch?.[0] || importBatches.find(b => b.status === 'running');
  const latestBatch = importBatches[0];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ייבוא מוצרים מקובץ CSV</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium mb-2">⚙️ תהליך אוטומטי:</p>
            <div className="text-xs text-blue-700 space-y-1">
              <p>✓ זיהוי delimiter אוטומטי (פסיק, נקודה-פסיק, טאבים)</p>
              <p>✓ הסרת BOM ותווים לא מודפסים</p>
              <p>✓ תיקון כותרות (רווחים → קו תחתון)</p>
              <p>✓ תיקון מספרים (פסיק → נקודה, הסרת % ויחידות)</p>
            </div>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <p className="text-sm text-blue-800 font-medium mb-1">שדות חובה:</p>
              <p className="text-xs text-blue-700">name_he, category, per100_kcal, per100_protein, per100_carbs, per100_fat</p>
              <p className="text-xs text-blue-600 mt-1">שדות אופציונליים: brand, barcodes</p>
            </div>
          </div>

          <div className="space-y-3">
            {processingStage && (
              <div className="p-3 bg-teal-50 border border-teal-200 rounded-lg text-center">
                <p className="text-sm font-medium text-teal-800">{processingStage}</p>
              </div>
            )}

            <div className="space-y-2">
              <Label>מדיניות כפילויות</Label>
              <Select value={duplicatePolicy} onValueChange={setDuplicatePolicy} disabled={isProcessing}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="skip">דלג על כפילויות (מוצרים קיימים לא ישתנו)</SelectItem>
                  <SelectItem value="update">עדכן קיימים (override נתונים)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">
                {duplicatePolicy === 'skip' 
                  ? 'מוצרים עם אותו שם+קטגוריה ידולגו ויופיעו בדוח'
                  : 'מוצרים עם אותו שם+קטגוריה יעודכנו עם הנתונים החדשים'}
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <Label>בחר Delimiter (אופציונלי)</Label>
                <Select value={manualDelimiter} onValueChange={setManualDelimiter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">זיהוי אוטומטי</SelectItem>
                    <SelectItem value=",">פסיק (,)</SelectItem>
                    <SelectItem value=";">נקודה-פסיק (;)</SelectItem>
                    <SelectItem value="tab">טאבים</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={downloadTemplate} variant="outline">
                  <Download className="w-4 h-4 ml-2" />
                  הורד תבנית
                </Button>
                <label>
                  <Button asChild className="w-full bg-blue-600 hover:bg-blue-700" disabled={isProcessing || commitInProgress}>
                    <span>
                      <Search className="w-4 h-4 ml-2" />
                      נתח ושמור ל-Staging
                    </span>
                  </Button>
                  <input type="file" accept=".csv" onChange={handleFileSelect} className="hidden" />
                </label>
                <Button onClick={handleHealthCheck} variant="outline" className="col-span-2">
                  <Activity className="w-4 h-4 ml-2" />
                  בדיקת בריאות מערכת
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Preview Results */}
      {previewData && (
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">תצוגה מקדימה</CardTitle>
              <Button size="sm" variant="ghost" onClick={() => { setPreviewData(null); setSelectedFile(null); }}>
                סגור
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* File Info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-xs text-slate-500">קובץ</p>
                <p className="font-medium">{previewData.fileName}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-xs text-slate-500">גודל</p>
                <p className="font-medium">{previewData.fileSize} KB</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-xs text-slate-500">Delimiter</p>
                <p className="font-medium">{previewData.delimiterName}</p>
              </div>
              <div className="p-2 bg-slate-50 rounded">
                <p className="text-xs text-slate-500">שורות</p>
                <p className="font-medium">{previewData.totalRows}</p>
              </div>
            </div>

            {/* Headers */}
            <div>
              <p className="text-sm font-medium mb-2">כותרות שזוהו:</p>
              <div className="flex flex-wrap gap-1">
                {previewData.normalizedHeaders.map((h, idx) => (
                  <span key={idx} className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-xs">
                    {h}
                  </span>
                ))}
              </div>
              {Object.keys(previewData.headerMapping).length > 0 && (
                <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-xs">
                  <p className="font-medium text-green-800 mb-1">✓ כותרות תוקנו אוטומטית:</p>
                  <div className="space-y-1">
                    {Object.entries(previewData.headerMapping).map(([raw, normalized], idx) => (
                      <div key={idx} className="text-green-700">
                        <span className="font-mono bg-white px-1 rounded">{raw}</span>
                        <span className="mx-1">→</span>
                        <span className="font-mono bg-white px-1 rounded">{normalized}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Missing Headers */}
            {previewData.missingHeaders.length > 0 && (
              <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                <p className="text-sm font-bold text-red-800 mb-2">❌ כותרות חסרות!</p>
                <p className="text-xs text-red-700 mb-2">השדות הבאים חובה אך חסרים:</p>
                <div className="flex flex-wrap gap-1">
                  {previewData.missingHeaders.map((h, idx) => (
                    <span key={idx} className="px-2 py-1 bg-red-200 text-red-900 rounded font-medium text-xs">
                      {h}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-red-600 mt-2">
                  💡 תקן את כותרות ה-CSV ונסה שוב
                </p>
              </div>
            )}

            {/* Sample Rows */}
            <div>
              <p className="text-sm font-medium mb-2">5 שורות ראשונות:</p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border rounded">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="p-2 text-right border-l">#</th>
                      <th className="p-2 text-right border-l">שם</th>
                      <th className="p-2 text-right border-l">קטגוריה</th>
                      <th className="p-2 text-right border-l">קל'</th>
                      <th className="p-2 text-right border-l">חלבון</th>
                      <th className="p-2 text-right border-l">פחמימות</th>
                      <th className="p-2 text-right">שומן</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewData.sampleRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? '' : 'bg-red-50'}>
                        <td className="p-2 border-t border-l">{row.rowNumber}</td>
                        <td className="p-2 border-t border-l font-medium">{row.name_he}</td>
                        <td className="p-2 border-t border-l text-xs">{row.category}</td>
                        <td className="p-2 border-t border-l">{row.per100_kcal}</td>
                        <td className="p-2 border-t border-l">{row.per100_protein}</td>
                        <td className="p-2 border-t border-l">{row.per100_carbs}</td>
                        <td className="p-2 border-t">{row.per100_fat}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Invalid Samples */}
            {previewData.invalidSamples.length > 0 && (
              <div className="p-3 bg-yellow-50 border border-yellow-300 rounded">
                <p className="text-sm font-medium text-yellow-800 mb-2">⚠️ שורות לא תקינות לדוגמה:</p>
                {previewData.invalidSamples.map((inv, idx) => (
                  <p key={idx} className="text-xs text-yellow-700">
                    שורה {inv.rowNumber}: {inv.reason}
                  </p>
                ))}
              </div>
            )}

            {/* Summary Stats */}
            {stagingComplete && (
              <div className="pt-3 border-t">
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center p-2 bg-green-50 rounded">
                    <p className="text-xl font-bold text-green-600">{previewData.validCount}</p>
                    <p className="text-xs text-green-700">תקינים</p>
                  </div>
                  <div className="text-center p-2 bg-red-50 rounded">
                    <p className="text-xl font-bold text-red-600">{previewData.invalidCount}</p>
                    <p className="text-xs text-red-700">שגויים</p>
                  </div>
                  <div className="text-center p-2 bg-orange-50 rounded">
                    <p className="text-xl font-bold text-orange-600">{previewData.dupDbCount}</p>
                    <p className="text-xs text-orange-700">כפילויות DB</p>
                  </div>
                  <div className="text-center p-2 bg-yellow-50 rounded">
                    <p className="text-xl font-bold text-yellow-600">{previewData.dupFileCount}</p>
                    <p className="text-xs text-yellow-700">כפילויות קובץ</p>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-3 border-t space-y-2">
              {stagingComplete && previewData.validCount > 0 ? (
                <>
                  <Button 
                    onClick={handleCommitImport} 
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    disabled={commitInProgress || isProcessing}
                  >
                    <Upload className="w-4 h-4 ml-2" />
                    {duplicatePolicy === 'update' 
                      ? `בצע Commit (${previewData.validCount + previewData.dupDbCount} שורות)`
                      : `בצע Commit (${previewData.validCount} שורות)`}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDownloadReport}
                    className="w-full"
                  >
                    <Download className="w-4 h-4 ml-2" />
                    הורד דוח Staging
                  </Button>
                </>
              ) : stagingComplete ? (
                <div className="text-center text-red-600 font-medium py-2">
                  אין שורות תקינות לייבוא
                </div>
              ) : (
                <Button disabled className="w-full">
                  נדרש Staging תקין
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active Import Status - only show if truly running */}
      {runningBatch && runningBatch.status === 'running' && (
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">ייבוא פעיל</CardTitle>
              <div className="flex gap-2">
                {runningBatch.status === 'running' && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancelImport(runningBatch, false)}
                      className="text-orange-600 hover:bg-orange-50"
                    >
                      <PowerOff className="w-3 h-3 ml-1" />
                      בטל
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCancelImport(runningBatch, true)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <Trash2 className="w-3 h-3 ml-1" />
                      בטל + מחק
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['currentBatch', 'batchLogs'] })}
                >
                  רענן סטטוס
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-sm">{runningBatch.file_name}</p>
                <p className="text-xs text-slate-500">
                  {runningBatch.rows_processed} / {runningBatch.rows_total} שורות
                </p>
                <p className="text-xs font-medium mt-1" style={{
                  color: runningBatch.status === 'completed' ? '#10b981' :
                         runningBatch.status === 'failed' ? '#ef4444' :
                         runningBatch.status === 'stopped' ? '#f59e0b' : '#3b82f6'
                }}>
                  {runningBatch.status === 'completed' ? '✓ הושלם' :
                   runningBatch.status === 'failed' ? '✗ נכשל' :
                   runningBatch.status === 'stopped' ? '⏸ נעצר' : '⏳ רץ'}
                </p>
              </div>
              {runningBatch.last_error && (
                <div className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded max-w-xs">
                  {runningBatch.last_error}
                </div>
              )}
            </div>

            {/* Progress Bar */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span>התקדמות</span>
                <span className="font-bold">{runningBatch.progress_percent}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div 
                  className="bg-teal-600 h-2 rounded-full transition-all"
                  style={{ width: `${runningBatch.progress_percent}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="text-center p-2 bg-green-50 rounded">
                <p className="font-bold text-green-600">{runningBatch.rows_added}</p>
                <p className="text-green-700">נוספו</p>
              </div>
              <div className="text-center p-2 bg-blue-50 rounded">
                <p className="font-bold text-blue-600">{runningBatch.rows_updated}</p>
                <p className="text-blue-700">עודכנו</p>
              </div>
              <div className="text-center p-2 bg-red-50 rounded">
                <p className="font-bold text-red-600">{runningBatch.rows_failed}</p>
                <p className="text-red-700">נכשלו</p>
              </div>
            </div>

            {/* Stuck Import Detection */}
            {runningBatch.status === 'running' && addedCount > 0 && (
              <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-center">
                <p className="font-medium text-blue-900">
                  נוספו בפועל: <span className="text-lg font-bold">{addedCount}</span> מוצרים
                </p>
              </div>
            )}

            {runningBatch.status === 'running' && runningBatch.progress_percent <= 5 && Date.now() - new Date(runningBatch.created_date).getTime() > 30000 && (
              <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                <p className="text-sm font-bold text-red-800 mb-2">⚠️ הייבוא נראה תקוע</p>
                <p className="text-xs text-red-700 mb-3">לא היה התקדמות במשך 30 שניות. מומלץ לבטל.</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setStuckReportBatch(runningBatch); setShowStuckReport(true); }}
                    className="text-blue-600 hover:bg-blue-50 border-blue-300"
                  >
                    <Activity className="w-3 h-3 ml-1" />
                    דוח
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancelImport(runningBatch, false)}
                    className="text-orange-600 hover:bg-orange-50 border-orange-300"
                  >
                    בטל
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleCancelImport(runningBatch, true)}
                    className="text-red-600 hover:bg-red-50 border-red-300"
                  >
                    בטל + מחק
                  </Button>
                </div>
              </div>
            )}

            {/* Live Logs */}
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-slate-100 p-2 text-xs font-medium flex justify-between items-center">
                <span>לוג חי (10 אחרונים)</span>
                <Button size="sm" variant="ghost" onClick={() => setShowLogs(true)}>
                  הצג הכל
                </Button>
              </div>
              <div className="max-h-48 overflow-y-auto text-xs bg-slate-50">
                {batchLogs.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">אין לוגים עדיין...</div>
                ) : (
                  batchLogs.slice(0, 10).map((log, idx) => (
                    <div key={idx} className={`p-2 border-t flex gap-2 ${
                      log.level === 'error' ? 'bg-red-50' : log.level === 'warn' ? 'bg-yellow-50' : ''
                    }`}>
                      <span className="text-slate-400 flex-shrink-0 text-[10px]">
                        {new Date(log.created_date).toLocaleTimeString('he-IL')}
                      </span>
                      <span className={
                        log.level === 'error' ? 'text-red-700 font-medium' : 
                        log.level === 'warn' ? 'text-yellow-700' : 'text-slate-600'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {(isProcessing || importResult) && (
        <Card>
          <CardHeader>
            <CardTitle>{isProcessing ? 'ייבוא בתהליך' : 'תוצאות ייבוא'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isProcessing && activeBatch && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span>התקדמות:</span>
                  <span className="font-bold text-teal-600">{activeBatch.progress_percent}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                  <div 
                    className="bg-teal-600 h-full transition-all duration-300"
                    style={{ width: `${activeBatch.progress_percent}%` }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="text-center p-2 bg-slate-50 rounded">
                    <p className="font-bold">{activeBatch.rows_processed || 0}/{activeBatch.rows_total || 0}</p>
                    <p className="text-slate-600">שורות מעובדות</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded">
                    <p className="font-bold text-green-600">{activeBatch.rows_added || 0}</p>
                    <p className="text-green-700">נוספו</p>
                  </div>
                </div>
              </div>
            )}

            {!isProcessing && importResult && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-2xl font-bold text-green-600">{importResult.added || 0}</p>
                    <p className="text-xs text-green-700">נוספו</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-600">{importResult.updated || 0}</p>
                    <p className="text-xs text-blue-700">עודכנו</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-600">{importResult.failed || 0}</p>
                    <p className="text-xs text-red-700">נכשלו</p>
                  </div>
                  <div className="text-center p-3 bg-slate-50 rounded-lg">
                    <p className="text-2xl font-bold text-slate-600">{importResult.invalid || 0}</p>
                    <p className="text-xs text-slate-700">לא תקינים</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <p className="text-2xl font-bold text-orange-600">{importResult.skipped_db || 0}</p>
                    <p className="text-xs text-orange-700">כפילויות DB</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <p className="text-2xl font-bold text-yellow-600">{importResult.skipped_file || 0}</p>
                    <p className="text-xs text-yellow-700">כפילויות קובץ</p>
                  </div>
                </div>

                {addedCount > 0 && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-center">
                    <p className="text-sm font-medium text-blue-900">
                      ✅ נוספו בפועל למאגר: <span className="text-xl font-bold">{addedCount}</span> מוצרים
                    </p>
                  </div>
                )}
              </>
            )}

            {importResult && (Array.isArray(importResult?.duplicates_in_db) || Array.isArray(importResult?.duplicates_in_file)) && ((importResult?.duplicates_in_db?.length > 0) || (importResult?.duplicates_in_file?.length > 0)) && (
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <div>
                    <p className="text-sm font-medium text-blue-900">נמצאו כפילויות</p>
                    <p className="text-xs text-blue-700">
                      {(importResult.duplicates_in_db || []).length} במאגר • {(importResult.duplicates_in_file || []).length} בקובץ
                    </p>
                  </div>
                  <Button size="sm" onClick={downloadDuplicatesReport} variant="outline">
                    <Download className="w-3 h-3 ml-1" />
                    הורד דוח
                  </Button>
                </div>

                {Array.isArray(importResult?.duplicates_in_db) && importResult.duplicates_in_db.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-orange-100 p-2 text-sm font-medium text-orange-800">
                      כפילויות מול המאגר ({importResult.duplicates_in_db.length}):
                    </div>
                    <div className="max-h-40 overflow-y-auto bg-orange-50">
                      {importResult.duplicates_in_db.slice(0, 10).map((dup, idx) => (
                        <div key={idx} className="p-2 border-t text-xs">
                          שורה {dup.line}: {dup.name}
                        </div>
                      ))}
                      {importResult.duplicates_in_db.length > 10 && (
                        <div className="p-2 border-t text-xs text-orange-600 text-center">
                          ועוד {importResult.duplicates_in_db.length - 10}...
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {Array.isArray(importResult?.duplicates_in_file) && importResult.duplicates_in_file.length > 0 && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-yellow-100 p-2 text-sm font-medium text-yellow-800">
                      כפילויות בתוך הקובץ ({importResult.duplicates_in_file.length}):
                    </div>
                    <div className="max-h-40 overflow-y-auto bg-yellow-50">
                      {importResult.duplicates_in_file.slice(0, 10).map((dup, idx) => (
                        <div key={idx} className="p-2 border-t text-xs">
                          שורה {dup.line}: {dup.name}
                        </div>
                      ))}
                      {importResult.duplicates_in_file.length > 10 && (
                        <div className="p-2 border-t text-xs text-yellow-600 text-center">
                          ועוד {importResult.duplicates_in_file.length - 10}...
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {importResult && Array.isArray(importResult?.errors) && importResult.errors.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-slate-100 p-2 font-medium text-sm">שגיאות ({importResult.errors.length}):</div>
                <div className="max-h-40 overflow-y-auto">
                  {importResult.errors.slice(0, 10).map((err, idx) => (
                    <div key={idx} className="p-2 border-t text-sm">
                      <span className="font-medium">{err.line ? `שורה ${err.line}` : err.name}:</span> {err.reason}
                    </div>
                  ))}
                  {importResult.errors.length > 10 && (
                    <div className="p-2 border-t text-xs text-slate-600 text-center">
                      ועוד {importResult.errors.length - 10}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {importResult?.batchId && addedCount > 0 && (
              <div className="pt-4 border-t">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={async () => {
                    if (!confirm(`האם למחוק ${addedCount} מוצרים שיובאו?`)) return;
                    try {
                      const itemsToDelete = await base44.entities.FoodItem.filter({ import_batch_id: importResult.batchId });
                      for (const item of itemsToDelete) {
                        await base44.entities.FoodItem.delete(item.id);
                      }
                      await base44.entities.ImportBatch.update(importResult.batchId, { status: 'rolled_back' });
                      toast.success(`${addedCount} מוצרים נמחקו`);
                      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
                      queryClient.invalidateQueries({ queryKey: ['importedItems'] });
                      setImportResult(null);
                    } catch (err) {
                      toast.error(`שגיאה: ${err.message}`);
                    }
                  }}
                >
                  <PowerOff className="w-4 h-4 ml-2" />
                  בטל ייבוא ({addedCount} מוצרים)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Management Button */}
      <Button
        variant="outline"
        onClick={() => setShowHistory(!showHistory)}
        className="w-full"
      >
        <Database className="w-4 h-4 ml-2" />
        {showHistory ? 'הסתר היסטוריה' : 'היסטוריית ייבוא מלאה'}
      </Button>

      {/* Import History */}
      {showHistory && (
        <Card>
          <CardHeader>
            <CardTitle>היסטוריית ייבוא מלאה</CardTitle>
          </CardHeader>
          <CardContent>
            {importBatches.length === 0 ? (
              <p className="text-center text-slate-500 py-4">אין היסטוריית ייבוא</p>
            ) : (
              <div className="space-y-3">
                {importBatches.map(batch => (
                  <div key={batch.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-bold">{batch.file_name}</h4>
                        <p className="text-xs text-slate-500">
                          {new Date(batch.created_date).toLocaleString('he-IL')}
                        </p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded ${
                        batch.status === 'completed' ? 'bg-green-100 text-green-700' :
                        batch.status === 'running' ? 'bg-yellow-100 text-yellow-700' :
                        batch.status === 'rolled_back' ? 'bg-orange-100 text-orange-700' :
                        batch.status === 'deleted' ? 'bg-slate-100 text-slate-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {batch.status === 'completed' ? 'הושלם' :
                         batch.status === 'running' ? 'רץ' :
                         batch.status === 'stopped' ? 'הופסק' :
                         batch.status === 'rolled_back' ? 'בוטל' :
                         batch.status === 'deleted' ? 'נמחק' : 'נכשל'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-xs mb-3">
                      <div className="text-center p-2 bg-green-50 rounded">
                        <p className="font-bold text-green-600">{batch.rows_added}</p>
                        <p className="text-green-700">נוספו</p>
                      </div>
                      <div className="text-center p-2 bg-blue-50 rounded">
                        <p className="font-bold text-blue-600">{batch.rows_updated}</p>
                        <p className="text-blue-700">עודכנו</p>
                      </div>
                      <div className="text-center p-2 bg-red-50 rounded">
                        <p className="font-bold text-red-600">{batch.rows_failed}</p>
                        <p className="text-red-700">נכשלו</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {batch.status === 'completed' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleRollback(batch)}
                            className="text-orange-600 hover:bg-orange-50"
                          >
                            <PowerOff className="w-3 h-3 ml-1" />
                            בטל ייבוא
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDeletePermanently(batch)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3 ml-1" />
                            מחק לצמיתות
                          </Button>
                        </>
                      )}
                      {batch.status === 'running' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelImport(batch, false)}
                            className="text-orange-600 hover:bg-orange-50"
                          >
                            <PowerOff className="w-3 h-3 ml-1" />
                            בטל
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleCancelImport(batch, true)}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-3 h-3 ml-1" />
                            בטל + מחק
                          </Button>
                        </>
                      )}
                      {(batch.status === 'stopped' || batch.status === 'rolled_back' || batch.status === 'completed') && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeletePermanently(batch)}
                          className="text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="w-3 h-3 ml-1" />
                          מחק לצמיתות
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelectedBatchForLogs(batch.id); setShowLogs(true); }}
                      >
                        <Database className="w-3 h-3 ml-1" />
                        הצג לוגים
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportBatchItems(batch)}
                      >
                        <Download className="w-3 h-3 ml-1" />
                        ייצא CSV
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Logs Dialog */}
      <Dialog open={showLogs} onOpenChange={setShowLogs}>
        <DialogContent className="max-w-2xl max-h-[80vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle>לוגים מלאים</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-96">
            {batchLogs.length === 0 ? (
              <p className="text-center text-slate-500 py-4">אין לוגים</p>
            ) : (
              <div className="space-y-1 text-xs">
                {batchLogs.map((log, idx) => (
                  <div key={idx} className={`p-2 rounded flex gap-2 ${
                    log.level === 'error' ? 'bg-red-50' : 
                    log.level === 'warn' ? 'bg-yellow-50' : 'bg-slate-50'
                  }`}>
                    <span className="text-slate-400 flex-shrink-0">
                      {new Date(log.created_date).toLocaleTimeString('he-IL')}
                    </span>
                    <span className={
                      log.level === 'error' ? 'text-red-700' : 
                      log.level === 'warn' ? 'text-yellow-700' : 'text-slate-700'
                    }>
                      {log.row_number && `[שורה ${log.row_number}] `}
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowLogs(false); setSelectedBatchForLogs(null); }}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stuck Report Dialog */}
      <StuckReportDialog
        open={showStuckReport}
        onClose={() => { setShowStuckReport(false); setStuckReportBatch(null); }}
        batch={stuckReportBatch}
      />
    </div>
  );
}

// Tab 2.5: Import Units
function ImportUnitsTab() {
  const [csvText, setCsvText] = useState('');
  const [validationResults, setValidationResults] = useState(null);
  const [importing, setImporting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [importResults, setImportResults] = useState(null);
  const [debugLogs, setDebugLogs] = useState([]);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: allFoodItems = [] } = useQuery({
    queryKey: ['foodItems'],
    queryFn: () => base44.entities.FoodItem.list(),
  });

  const { data: existingFoodUnits = [] } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
  });

  const VALID_UNITS = [
    'גרם', '100 גרם', 'כפית', 'כף', 'כוס', 'פרוסה', 'יחידה',
    'ביצה', 'בננה', 'תפוח', 'פיתה', 'לחמניה', 'קרקר', 'פריכית',
    'גביע', 'קופסה', 'פחית'
  ];

  const addLog = (action, details) => {
    const log = {
      timestamp: new Date().toISOString(),
      action,
      ...details
    };
    setDebugLogs(prev => [...prev, log]);
    console.log('[ImportUnits]', log);
  };

  const normalizeText = (text) => {
    if (!text) return '';
    return text
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/[\(\)\[\]]/g, '')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .toLowerCase();
  };

  const findMatchingProducts = (productName) => {
    const normalized = normalizeText(productName);
    const matches = allFoodItems.filter(f => {
      const foodNormalized = normalizeText(f.name_he);
      return foodNormalized.includes(normalized) || normalized.includes(foodNormalized);
    });
    return matches;
  };

  const handleCheck = async () => {
    console.log('[ImportUnits] Check button clicked');
    if (!csvText.trim()) {
      toast.error('נא להדביק CSV');
      return;
    }

    setChecking(true);
    setValidationResults(null);
    setImportResults(null);
    toast.loading('בודק את ה-CSV...', { id: 'check' });
    addLog('preview_start', { rows: csvText.split('\n').length });
    console.log('[ImportUnits] Starting check process');

    const checkTimeout = setTimeout(() => {
      console.error('[ImportUnits] Check timeout');
      toast.error('לא התקבלה תשובה מהשרת (timeout). נסה שוב.');
      setChecking(false);
      addLog('preview_timeout', {});
    }, 12000);

    try {
      const lines = csvText.trim().split('\n').filter(l => l.trim());
      
      if (lines.length < 2) {
        toast.error('CSV חייב להכיל לפחות כותרת ושורה אחת');
        clearTimeout(checkTimeout);
        setChecking(false);
        return;
      }

      const header = lines[0].toLowerCase().trim();
      if (!header.includes('product_name') || !header.includes('unit_name') || !header.includes('grams_per_unit')) {
        toast.error('כותרות חובה: product_name,unit_name,grams_per_unit');
        addLog('preview_error', { error: 'Invalid headers' });
        clearTimeout(checkTimeout);
        setChecking(false);
        return;
      }

      const rows = lines.slice(1);
      const results = {
        valid: [],
        invalid: [],
        willCreate: 0,
        willUpdate: 0,
        total: rows.length
      };

      for (let idx = 0; idx < rows.length; idx++) {
        const line = rows[idx];
        const rowNum = idx + 2;
        const parts = line.split(',').map(p => p.trim());
        
        if (parts.length < 3) {
          results.invalid.push({
            rowNum,
            error: 'שורה לא תקינה - חסרים שדות (נדרשות 3 עמודות)'
          });
          continue;
        }

        const [productName, unitName, gramsStr] = parts;

        if (!productName) {
          results.invalid.push({ rowNum, error: 'חסר שדה required: product_name' });
          continue;
        }
        if (!unitName) {
          results.invalid.push({ rowNum, error: 'חסר שדה required: unit_name' });
          continue;
        }
        if (!gramsStr) {
          results.invalid.push({ rowNum, error: 'חסר שדה required: grams_per_unit' });
          continue;
        }

        if (!VALID_UNITS.includes(unitName)) {
          results.invalid.push({ 
            rowNum, 
            error: `unit_name לא תקין: '${unitName}' (מותרים: ${VALID_UNITS.slice(0, 5).join(', ')}...)` 
          });
          continue;
        }
        
        const grams = parseFloat(gramsStr);
        if (isNaN(grams) || grams <= 0) {
          results.invalid.push({ rowNum, error: `ערך מספרי לא תקין: grams_per_unit = '${gramsStr}'` });
          continue;
        }

        const matches = findMatchingProducts(productName);
        
        if (matches.length === 0) {
          results.invalid.push({ 
            rowNum, 
            error: `מוצר לא נמצא: '${productName}'` 
          });
          continue;
        }
        
        if (matches.length > 1) {
          const matchNames = matches.map(m => m.name_he).join(', ');
          results.invalid.push({ 
            rowNum, 
            error: `נמצאו כמה התאמות למוצר '${productName}': [${matchNames}]` 
          });
          continue;
        }

        const product = matches[0];

        const existingUnit = existingFoodUnits.find(u => 
          u.scope_type === 'food' && 
          u.scope_value === product.id && 
          u.unit_name_he === unitName
        );

        results.valid.push({
          rowNum,
          productName,
          productId: product.id,
          productNameHe: product.name_he,
          unitName,
          grams,
          willUpdate: !!existingUnit,
          existingUnitId: existingUnit?.id
        });

        if (existingUnit) {
          results.willUpdate++;
        } else {
          results.willCreate++;
        }
      }

      clearTimeout(checkTimeout);
      setValidationResults(results);
      addLog('preview_complete', { 
        valid: results.valid.length, 
        invalid: results.invalid.length,
        willCreate: results.willCreate,
        willUpdate: results.willUpdate
      });
      
      if (results.valid.length > 0) {
        console.log('[ImportUnits] Check complete:', results);
        toast.success(`✅ ${results.valid.length} תקינים, ${results.invalid.length} שגויים`, { id: 'check' });
      } else {
        toast.error('אין שורות תקינות לייבוא', { id: 'check' });
      }
    } catch (err) {
      clearTimeout(checkTimeout);
      console.error('[ImportUnits] Check error:', err);
      toast.error(`שגיאה בבדיקה: ${err.message}`, { id: 'check' });
      addLog('preview_error', { error: err.message });
    } finally {
      console.log('[ImportUnits] Check finished');
      setChecking(false);
    }
  };

  const handleImport = async () => {
    console.log('[ImportUnits] Import button clicked');
    if (!validationResults || validationResults.valid.length === 0) {
      toast.error('אין שורות תקינות לייבוא');
      return;
    }

    setImporting(true);
    toast.loading('מייבא יחידות...', { id: 'import' });
    const results = { 
      added: 0, 
      updated: 0, 
      failed: 0, 
      errors: [] 
    };

    addLog('import_start', { total: validationResults.valid.length });
    console.log('[ImportUnits] Starting import process');

    const importTimeout = setTimeout(() => {
      console.error('[ImportUnits] Import timeout');
      toast.error('לא התקבלה תשובה מהשרת (timeout). נסה שוב.', { id: 'import' });
      setImporting(false);
      addLog('import_timeout', {});
    }, 12000);

    try {
      console.log('[ImportUnits] Processing', validationResults.valid.length, 'rows');

      for (const row of validationResults.valid) {
        try {
          if (row.willUpdate) {
            await base44.entities.FoodUnit.update(row.existingUnitId, {
              grams_per_unit: row.grams,
            });
            results.updated++;
          } else {
            await base44.entities.FoodUnit.create({
              scope_type: 'food',
              scope_value: row.productId,
              unit_name_he: row.unitName,
              grams_per_unit: row.grams,
              created_by: user?.email || user?.id
            });
            results.added++;
          }
        } catch (err) {
          results.failed++;
          results.errors.push({
            rowNum: row.rowNum,
            productName: row.productName,
            unitName: row.unitName,
            error: err.message
          });
        }
      }

      clearTimeout(importTimeout);
      setImportResults(results);
      queryClient.invalidateQueries({ queryKey: ['allFoodUnits'] });
      
      addLog('import_complete', { 
        added: results.added, 
        updated: results.updated, 
        failed: results.failed 
      });

      const summary = [];
      if (results.added > 0) summary.push(`${results.added} נוספו`);
      if (results.updated > 0) summary.push(`${results.updated} עודכנו`);
      
      console.log('[ImportUnits] Import complete:', results);
      if (results.failed === 0) {
        toast.success(`✅ הייבוא הושלם: ${summary.join(', ')}`, { id: 'import' });
      } else {
        toast.warning(`⚠️ ${summary.join(', ')}, ${results.failed} נכשלו`, { id: 'import' });
      }
    } catch (err) {
      clearTimeout(importTimeout);
      console.error('[ImportUnits] Import error:', err);
      toast.error(`שגיאה בייבוא: ${err.message}`, { id: 'import' });
      addLog('import_error', { error: err.message });
    } finally {
      console.log('[ImportUnits] Import finished');
      setImporting(false);
    }
  };

  const handleReset = () => {
    setCsvText('');
    setValidationResults(null);
    setImportResults(null);
  };

  const handleCopyLogs = () => {
    const logsText = debugLogs.map(log => 
      `[${new Date(log.timestamp).toLocaleTimeString('he-IL')}] ${log.action}: ${JSON.stringify(log)}`
    ).join('\n');
    
    navigator.clipboard.writeText(logsText);
    toast.success('לוגים הועתקו ללוח');
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>ייבוא יחידות מידה</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-medium text-blue-800 mb-2">📋 פורמט CSV:</p>
            <div className="bg-white rounded p-2 text-xs font-mono text-slate-700">
              product_name,unit_name,grams_per_unit<br/>
              גבינה לבנה 5%,כף,15<br/>
              אורז מבושל,כף,25<br/>
              אורז מבושל,כוס,180<br/>
              לחם אחיד,פרוסה,35<br/>
              טונה בשמן 160 גרם,קופסה,160
            </div>
            <div className="mt-3 pt-3 border-t border-blue-300">
              <p className="text-sm font-medium text-blue-800 mb-1">יחידות מותרות:</p>
              <div className="flex flex-wrap gap-1">
                {VALID_UNITS.map(u => (
                  <span key={u} className="text-xs bg-white px-2 py-0.5 rounded text-blue-700">{u}</span>
                ))}
              </div>
            </div>
            <p className="text-xs text-blue-700 mt-3">
              💡 התאמת מוצרים חכמה - יוכל למצוא מוצר גם עם שם חלקי
            </p>
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
              onClick={handleCheck}
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
              disabled={importing || checking || !validationResults || validationResults.valid.length === 0}
            >
              <Upload className="w-4 h-4 ml-2" />
              {importing ? 'מייבא...' : 'ייבא'}
            </Button>
            <Button
              onClick={handleReset}
              variant="ghost"
              disabled={importing || checking}
            >
              נקה
            </Button>
          </div>
        </CardContent>
      </Card>

      {validationResults && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">תוצאות בדיקה</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-4 gap-3">
              <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{validationResults.valid.length}</p>
                <p className="text-xs text-green-700">תקינות</p>
              </div>
              <div className="text-center p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-3xl font-bold text-red-600">{validationResults.invalid.length}</p>
                <p className="text-xs text-red-700">שגויות</p>
              </div>
              <div className="text-center p-4 bg-teal-50 border border-teal-200 rounded-lg">
                <p className="text-3xl font-bold text-teal-600">{validationResults.willCreate || 0}</p>
                <p className="text-xs text-teal-700">יווצרו</p>
              </div>
              <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-3xl font-bold text-blue-600">{validationResults.willUpdate || 0}</p>
                <p className="text-xs text-blue-700">יעודכנו</p>
              </div>
            </div>

            {validationResults.valid.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-green-100 p-2 text-sm font-medium text-green-800">
                  מוכן לייבוא ({validationResults.valid.length}):
                </div>
                <div className="max-h-48 overflow-y-auto bg-green-50">
                  {validationResults.valid.slice(0, 10).map((row, idx) => (
                    <div key={idx} className="p-2 border-t text-xs flex justify-between items-center">
                      <div>
                        <span className="text-slate-500">שורה {row.rowNum}:</span>{' '}
                        <span className="font-medium">{row.productNameHe}</span> →{' '}
                        <span className="text-teal-600">{row.unitName}</span> ={' '}
                        <span className="font-bold">{row.grams}g</span>
                      </div>
                      {row.willUpdate && (
                        <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">עדכון</span>
                      )}
                    </div>
                  ))}
                  {validationResults.valid.length > 10 && (
                    <div className="p-2 border-t text-xs text-green-600 text-center">
                      ועוד {validationResults.valid.length - 10}...
                    </div>
                  )}
                </div>
              </div>
            )}

            {validationResults.invalid.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <div className="bg-red-100 p-2 text-sm font-medium text-red-800">
                  שגיאות ({validationResults.invalid.length}):
                </div>
                <div className="max-h-48 overflow-y-auto bg-red-50">
                  {validationResults.invalid.map((row, idx) => (
                    <div key={idx} className="p-2 border-t text-xs">
                      <span className="font-medium text-red-700">שורה {row.rowNum}:</span>{' '}
                      <span className="text-red-600">{row.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {importResults && (
        <Card className="border-l-4 border-l-green-500">
          <CardHeader>
            <CardTitle className="text-base">✅ תוצאות ייבוא</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <p className="text-3xl font-bold text-green-600">{importResults.added}</p>
                <p className="text-xs text-green-700">נוספו</p>
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
                      <span className="text-slate-700">{err.productName}</span> / {err.unitName} -{' '}
                      <span className="text-red-600">{err.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {debugLogs.length > 0 && (user?.role === 'admin' || user?.email?.includes('coach')) && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-base">🔍 Debug Logs</CardTitle>
              <Button size="sm" variant="outline" onClick={handleCopyLogs}>
                <Copy className="w-3 h-3 ml-1" />
                העתק לוגים
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="max-h-48 overflow-y-auto bg-slate-50 rounded border p-2 space-y-1">
              {debugLogs.map((log, idx) => (
                <div key={idx} className="text-xs font-mono text-slate-700">
                  <span className="text-slate-400">[{new Date(log.timestamp).toLocaleTimeString('he-IL')}]</span>{' '}
                  <span className="font-medium">{log.action}</span>:{' '}
                  {JSON.stringify(log, null, 2).split('\n').slice(1, -1).join(' ')}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Tab 3: Units Management (Legacy + Import)
function UnitsTab() {
  const [editingUnit, setEditingUnit] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportUnits, setShowImportUnits] = useState(false);
  const [showLegacy, setShowLegacy] = useState(false);
  const queryClient = useQueryClient();

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['portionReferences'],
    queryFn: () => base44.entities.PortionReference.list(),
  });

  const { data: productOverrides = [] } = useQuery({
    queryKey: ['allProductUnitOverrides'],
    queryFn: () => base44.entities.ProductUnitOverride.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.PortionReference.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portionReferences'] });
      setShowDialog(false);
      setEditingUnit(null);
      toast.success('היחידה נוספה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PortionReference.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portionReferences'] });
      setShowDialog(false);
      setEditingUnit(null);
      toast.success('היחידה עודכנה');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.PortionReference.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['portionReferences'] });
      toast.success('היחידה נמחקה');
    },
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-3xl font-bold text-blue-600">{units.length}</p>
          <p className="text-xs text-blue-700">יחידות כלליות (PortionReference)</p>
        </div>
        <div className="text-center p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-3xl font-bold text-purple-600">{productOverrides.length}</p>
          <p className="text-xs text-purple-700">המרות למוצרים (ProductUnitOverride)</p>
        </div>
        <div className="text-center p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-3xl font-bold text-teal-600">
            {new Set(productOverrides.map(o => o.product_id)).size}
          </p>
          <p className="text-xs text-teal-700">מוצרים עם המרות</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowImportUnits(!showImportUnits)} variant="outline" className="flex-1 md:flex-none border-teal-300 text-teal-700 hover:bg-teal-50">
          <Upload className="w-4 h-4 ml-2" />
          ייבוא יחידות
        </Button>
        <Button onClick={() => setShowImport(!showImport)} variant="outline" className="flex-1 md:flex-none border-purple-300 text-purple-700 hover:bg-purple-50">
          <Upload className="w-4 h-4 ml-2" />
          ייבוא overrides
        </Button>
        <Button onClick={() => setShowLegacy(!showLegacy)} variant="outline" className="flex-1 md:flex-none border-orange-300 text-orange-700 hover:bg-orange-50">
          <Upload className="w-4 h-4 ml-2" />
          ייבוא legacy
        </Button>
      </div>

      {/* Import Sections */}
      {showImportUnits && <ImportFoodUnits />}
      {showImport && <ImportProductOverrides />}
      {showLegacy && <ImportLegacyCSV />}

      <div className="grid gap-4">
        {isLoading ? (
          <Card><CardContent className="pt-6 text-center">טוען יחידות...</CardContent></Card>
        ) : units.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-slate-500">לא הוגדרו יחידות</CardContent></Card>
        ) : (
          units.map(unit => (
            <Card key={unit.id}>
              <CardContent className="pt-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h3 className="font-bold text-lg">{unit.unit_name}</h3>
                    <p className="text-sm text-slate-600">
                      גרמים ברירת מחדל: <span className="font-medium">{unit.grams_default}g</span>
                    </p>
                    {unit.description && (
                      <p className="text-xs text-slate-500 mt-1">{unit.description}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="icon" variant="ghost" onClick={() => { setEditingUnit(unit); setShowDialog(true); }}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        if (window.confirm(`למחוק את היחידה "${unit.unit_name}"?`)) {
                          deleteMutation.mutate(unit.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-red-600" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <UnitDialog
        open={showDialog}
        onClose={() => { setShowDialog(false); setEditingUnit(null); }}
        unit={editingUnit}
        onSave={(data) => {
          if (editingUnit?.id) {
            updateMutation.mutate({ id: editingUnit.id, data });
          } else {
            createMutation.mutate(data);
          }
        }}
      />
    </div>
  );
}

// Stuck Report Dialog Component
function StuckReportDialog({ open, onClose, batch }) {
  const { data: batchLogs = [] } = useQuery({
    queryKey: ['stuckReportLogs', batch?.id],
    queryFn: () => base44.entities.ImportBatchLog.filter({ batch_id: batch?.id }, '-created_date', 20),
    enabled: !!batch?.id && open,
  });

  const { data: actualCount = 0 } = useQuery({
    queryKey: ['stuckReportCount', batch?.id],
    queryFn: async () => {
      const items = await base44.entities.FoodItem.filter({ import_batch_id: batch?.id });
      return items.length;
    },
    enabled: !!batch?.id && open,
  });

  const [csvHeaders, setCsvHeaders] = React.useState([]);
  const [headerIssues, setHeaderIssues] = React.useState([]);

  React.useEffect(() => {
    if (!batch?.id || !open) return;

    // Try to extract headers from first log
    const parseLog = batchLogs.find(log => log.message.includes('CSV parsed'));
    if (parseLog) {
      const match = parseLog.message.match(/CSV parsed.*?(\d+) rows/);
      if (match) {
        // Headers analysis
        const requiredHeaders = ['name_he', 'per100_kcal', 'per100_protein', 'per100_carbs', 'per100_fat'];
        const optionalHeaders = ['category', 'brand', 'barcodes'];
        
        // Try to get actual headers from logs
        const headerLog = batchLogs.find(log => log.message.includes('headers:') || log.message.includes('columns:'));
        if (headerLog) {
          const extractedHeaders = headerLog.message.split(':')[1]?.trim().split(',').map(h => h.trim()) || [];
          setCsvHeaders(extractedHeaders);
          
          const missing = requiredHeaders.filter(h => !extractedHeaders.includes(h));
          if (missing.length > 0) {
            setHeaderIssues(missing);
          }
        } else {
          setCsvHeaders(['לא זוהו כותרות בלוגים']);
        }
      }
    }
  }, [batch?.id, batchLogs, open]);

  if (!batch) return null;

  const stuckDuration = batch.created_date ? 
    Math.floor((Date.now() - new Date(batch.created_date).getTime()) / 1000) : 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>🔍 דוח תקיעת ייבוא</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Overview */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">סטטוס כללי</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">קובץ</p>
                  <p className="font-medium">{batch.file_name}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">סטטוס</p>
                  <p className="font-medium text-yellow-600">{batch.status}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">התחיל</p>
                  <p className="font-medium">{new Date(batch.created_date).toLocaleString('he-IL')}</p>
                </div>
                <div className="p-2 bg-slate-50 rounded">
                  <p className="text-xs text-slate-500">זמן מאז</p>
                  <p className="font-medium">{Math.floor(stuckDuration / 60)}:{(stuckDuration % 60).toString().padStart(2, '0')} דקות</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Progress Data */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">נתוני התקדמות</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-4 gap-2 text-xs">
                <div className="text-center p-2 bg-blue-50 rounded">
                  <p className="font-bold text-lg">{batch.rows_total}</p>
                  <p className="text-slate-600">סך שורות</p>
                </div>
                <div className="text-center p-2 bg-green-50 rounded">
                  <p className="font-bold text-lg text-green-600">{batch.rows_processed}</p>
                  <p className="text-green-700">עובדו</p>
                </div>
                <div className="text-center p-2 bg-teal-50 rounded">
                  <p className="font-bold text-lg text-teal-600">{batch.rows_added}</p>
                  <p className="text-teal-700">נוספו</p>
                </div>
                <div className="text-center p-2 bg-red-50 rounded">
                  <p className="font-bold text-lg text-red-600">{batch.rows_failed}</p>
                  <p className="text-red-700">נכשלו</p>
                </div>
              </div>
              <div className="flex justify-between text-xs mt-2">
                <span>אחוז התקדמות:</span>
                <span className="font-bold">{batch.progress_percent}%</span>
              </div>
            </CardContent>
          </Card>

          {/* DB Count vs Reported */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">בדיקת מאגר נתונים</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-xs text-blue-600 mb-1">דווח בייבוא</p>
                  <p className="text-2xl font-bold text-blue-900">{batch.rows_added}</p>
                  <p className="text-xs text-blue-700">מוצרים נוספו</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                  <p className="text-xs text-green-600 mb-1">ספירה ב-DB</p>
                  <p className="text-2xl font-bold text-green-900">{actualCount}</p>
                  <p className="text-xs text-green-700">מוצרים בפועל</p>
                </div>
              </div>
              {actualCount !== batch.rows_added && (
                <div className="mt-2 p-2 bg-yellow-50 border border-yellow-300 rounded text-xs text-yellow-800">
                  ⚠️ אי-התאמה: הספירה ב-DB לא תואמת לדיווח הייבוא
                </div>
              )}
            </CardContent>
          </Card>

          {/* CSV Headers Check */}
          {csvHeaders.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">בדיקת כותרות CSV</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-xs">
                  <p className="text-slate-600 mb-2">כותרות שזוהו:</p>
                  <div className="flex flex-wrap gap-1">
                    {csvHeaders.map((header, idx) => (
                      <span key={idx} className="px-2 py-1 bg-slate-100 rounded text-slate-700">
                        {header}
                      </span>
                    ))}
                  </div>
                </div>
                {headerIssues.length > 0 && (
                  <div className="p-3 bg-red-50 border-2 border-red-300 rounded-lg">
                    <p className="text-sm font-bold text-red-800 mb-2">❌ כותרות חסרות!</p>
                    <p className="text-xs text-red-700">השדות הבאים חובה אך חסרים:</p>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {headerIssues.map((missing, idx) => (
                        <span key={idx} className="px-2 py-1 bg-red-200 text-red-900 rounded font-medium text-xs">
                          {missing}
                        </span>
                      ))}
                    </div>
                    <p className="text-xs text-red-600 mt-2">
                      💡 וודא שהקובץ מכיל את כל השדות הנדרשים בשורה הראשונה
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Last Error */}
          {batch.last_error && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base text-red-700">שגיאה אחרונה</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800 font-mono">
                  {batch.last_error}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recent Logs */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">לוגים אחרונים (20)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="max-h-64 overflow-y-auto space-y-1">
                {batchLogs.length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-4">אין לוגים</p>
                ) : (
                  batchLogs.map((log, idx) => (
                    <div key={idx} className={`p-2 rounded text-xs flex gap-2 ${
                      log.level === 'error' ? 'bg-red-50 border border-red-200' : 
                      log.level === 'warn' ? 'bg-yellow-50 border border-yellow-200' : 
                      'bg-slate-50'
                    }`}>
                      <span className="text-slate-400 flex-shrink-0">
                        {new Date(log.created_date).toLocaleTimeString('he-IL')}
                      </span>
                      <span className={
                        log.level === 'error' ? 'text-red-700 font-medium' : 
                        log.level === 'warn' ? 'text-yellow-700' : 
                        'text-slate-700'
                      }>
                        {log.message}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          <Card className="border-blue-300 bg-blue-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base text-blue-900">💡 המלצות</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-blue-800 space-y-2">
              {headerIssues.length > 0 && (
                <p>• תקן את כותרות ה-CSV ונסה שוב</p>
              )}
              {batch.rows_failed > 0 && (
                <p>• יש {batch.rows_failed} שורות כושלות - בדוק את הלוגים לפרטים</p>
              )}
              {actualCount !== batch.rows_added && (
                <p>• אי-התאמה בין דיווח לספירה - ייתכן שהייבוא נקטע באמצע</p>
              )}
              {batch.progress_percent <= 5 && (
                <p>• הייבוא לא התקדם מעבר ל-{batch.progress_percent}% - סביר שיש בעיה בקובץ או בחיבור</p>
              )}
              <p>• מומלץ לבטל את הייבוא ולנסות מחדש עם קובץ מתוקן</p>
            </CardContent>
          </Card>
        </div>

        <DialogFooter>
          <Button onClick={onClose}>סגור</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Tab 4: Food Units Management
function FoodUnitsTab() {
  const [showQualityCheck, setShowQualityCheck] = useState(false);
  const [showInitDialog, setShowInitDialog] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: units = [], isLoading } = useQuery({
    queryKey: ['allFoodUnits'],
    queryFn: () => base44.entities.FoodUnit.list(),
  });

  const handleInitialize = async () => {
    try {
      toast.loading('מאתחל יחידות...', { id: 'init' });
      const response = await base44.functions.invoke('initializeDefaultUnits', {});
      
      if (response.data.success) {
        toast.success(`יחידות ברירת מחדל נוצרו: ${response.data.total}`, { id: 'init' });
        queryClient.invalidateQueries({ queryKey: ['allFoodUnits'] });
        setShowInitDialog(false);
      } else {
        toast.info(response.data.message, { id: 'init' });
      }
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`, { id: 'init' });
    }
  };

  const globalUnits = units.filter(u => u.scope_type === 'global');
  const categoryUnits = units.filter(u => u.scope_type === 'category');
  const foodUnits = units.filter(u => u.scope_type === 'food');

  return (
    <div className="space-y-4">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-3xl font-bold text-blue-600">{units.length}</p>
          <p className="text-xs text-blue-700">סה״כ יחידות</p>
        </div>
        <div className="text-center p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-3xl font-bold text-green-600">{globalUnits.length}</p>
          <p className="text-xs text-green-700">גלובליות</p>
        </div>
        <div className="text-center p-4 bg-teal-50 border border-teal-200 rounded-lg">
          <p className="text-3xl font-bold text-teal-600">{categoryUnits.length}</p>
          <p className="text-xs text-teal-700">לפי קטגוריה</p>
        </div>
        <div className="text-center p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-3xl font-bold text-purple-600">{foodUnits.length}</p>
          <p className="text-xs text-purple-700">למוצר ספציפי</p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => setShowInitDialog(true)} className="flex-1 md:flex-none bg-teal-600 hover:bg-teal-700">
          <CheckCircle className="w-4 h-4 ml-2" />
          אתחל יחידות ברירת מחדל
        </Button>
        <Button onClick={() => setShowQualityCheck(true)} variant="outline" className="flex-1 md:flex-none border-blue-300 text-blue-700 hover:bg-blue-50">
          <Shield className="w-4 h-4 ml-2" />
          בדיקת איכות יחידות
        </Button>
      </div>

      {/* Units List by Category */}
      {isLoading ? (
        <div className="text-center py-8">טוען יחידות...</div>
      ) : (
        <div className="space-y-4">
          {/* Global Units */}
          {globalUnits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">יחידות גלובליות ({globalUnits.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {globalUnits
                    .sort((a, b) => a.display_order - b.display_order)
                    .map(unit => (
                      <div key={unit.id} className="p-2 bg-blue-50 rounded-lg border border-blue-200">
                        <div className="flex justify-between items-center">
                          <span className="font-medium text-sm">{unit.unit_name_he}</span>
                          <span className="text-xs text-blue-600">{unit.grams_per_unit}g</span>
                        </div>
                        {unit.notes && (
                          <p className="text-xs text-slate-500 mt-1">{unit.notes}</p>
                        )}
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Category Units */}
          {categoryUnits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">יחידות לפי קטגוריה ({categoryUnits.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(
                    categoryUnits.reduce((acc, unit) => {
                      const cat = unit.scope_value || 'אחר';
                      if (!acc[cat]) acc[cat] = [];
                      acc[cat].push(unit);
                      return acc;
                    }, {})
                  ).map(([category, catUnits]) => (
                    <div key={category} className="border rounded-lg p-3 bg-green-50">
                      <p className="font-medium text-sm text-green-800 mb-2">{category}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {catUnits
                          .sort((a, b) => a.display_order - b.display_order)
                          .map(unit => (
                            <div key={unit.id} className="p-2 bg-white rounded border border-green-200">
                              <div className="flex justify-between items-center">
                                <span className="text-xs font-medium">{unit.unit_name_he}</span>
                                <span className="text-xs text-green-600">{unit.grams_per_unit}g</span>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Food-Specific Units */}
          {foodUnits.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">יחידות למוצרים ספציפיים ({foodUnits.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {foodUnits.map(unit => (
                    <div key={unit.id} className="p-2 bg-purple-50 rounded-lg border border-purple-200">
                      <div className="flex justify-between items-center">
                        <div>
                          <span className="font-medium text-sm">{unit.unit_name_he}</span>
                          <span className="text-xs text-slate-500 mr-2">({unit.scope_value})</span>
                        </div>
                        <span className="text-xs text-purple-600">{unit.grams_per_unit}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {units.length === 0 && (
            <Card>
              <CardContent className="pt-6 text-center text-slate-500">
                <Scale className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                <p className="mb-4">לא הוגדרו יחידות עדיין</p>
                <Button onClick={() => setShowInitDialog(true)} className="bg-teal-600 hover:bg-teal-700">
                  <CheckCircle className="w-4 h-4 ml-2" />
                  אתחל יחידות ברירת מחדל
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Initialize Dialog */}
      <Dialog open={showInitDialog} onOpenChange={setShowInitDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>אתחול יחידות ברירת מחדל</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              פעולה זו תיצור את כל יחידות המידה הבסיסיות:
            </p>
            <ul className="text-xs text-slate-700 space-y-1 pr-4">
              <li>• 10 יחידות גלובליות (גרם, כף, כפית, כוס וכו׳)</li>
              <li>• 35+ יחידות לפי קטגוריות (ביצים, לחמים, יוגורטים, פירות וכו׳)</li>
            </ul>
            <p className="text-xs text-orange-600 bg-orange-50 p-2 rounded">
              ⚠️ אם כבר קיימות יחידות, הפעולה תדלג על הכפילויות
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitDialog(false)}>ביטול</Button>
            <Button onClick={handleInitialize} className="bg-teal-600 hover:bg-teal-700">
              <CheckCircle className="w-4 h-4 ml-2" />
              אתחל עכשיו
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Quality Check */}
      <UnitsQualityCheck
        open={showQualityCheck}
        onClose={() => setShowQualityCheck(false)}
      />
    </div>
  );
}

function UnitDialog({ open, onClose, unit, onSave }) {
  const [formData, setFormData] = useState({
    unit_name: '',
    grams_default: '',
    description: '',
  });

  React.useEffect(() => {
    if (unit) {
      setFormData({
        unit_name: unit.unit_name || '',
        grams_default: unit.grams_default || '',
        description: unit.description || '',
      });
    } else {
      setFormData({
        unit_name: '',
        grams_default: '',
        description: '',
      });
    }
  }, [unit, open]);

  const handleSubmit = () => {
    if (!formData.unit_name) {
      toast.error('שם היחידה חובה');
      return;
    }
    if (!formData.grams_default || formData.grams_default <= 0) {
      toast.error('גרמים חייבים להיות מספר חיובי');
      return;
    }

    onSave({
      ...formData,
      grams_default: parseFloat(formData.grams_default),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>{unit?.id ? 'עריכת יחידה' : 'הוספת יחידה'}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <div>
            <Label>שם היחידה *</Label>
            <Input
              value={formData.unit_name}
              onChange={(e) => setFormData({ ...formData, unit_name: e.target.value })}
              placeholder="לדוגמה: כפית, כף, כוס"
              disabled={!!unit?.id}
            />
          </div>

          <div>
            <Label>גרמים ברירת מחדל *</Label>
            <Input
              type="number"
              value={formData.grams_default}
              onChange={(e) => setFormData({ ...formData, grams_default: e.target.value })}
              placeholder="0"
            />
          </div>

          <div>
            <Label>תיאור (אופציונלי)</Label>
            <Input
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="תיאור נוסף"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} className="bg-teal-600 hover:bg-teal-700">
            <Save className="w-4 h-4 ml-2" />
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}