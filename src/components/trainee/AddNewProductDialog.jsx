import React, { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { Upload, X } from 'lucide-react';

export default function AddNewProductDialog({ open, onClose, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name_he: '',
    name: '',
    per100_kcal: '',
    per100_protein: '',
    per100_carbs: '',
    per100_fat: '',
    category: 'משקאות',
    brand: '',
    image_url: null,
    imageFile: null,
  });
  const [imagePreview, setImagePreview] = useState(null);
  const fileInputRef = useRef(null);

  const handleImageSelect = async (file) => {
    if (!file) return;
    
    // Preview
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);

    setFormData(prev => ({ ...prev, imageFile: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validation
    if (!formData.name_he || !formData.per100_kcal || !formData.per100_protein || !formData.per100_carbs || !formData.per100_fat) {
      toast.error('אנא מלא את כל השדות הנדרשים');
      return;
    }

    setLoading(true);
    try {
      // Upload image if selected
      let imageUrl = null;
      if (formData.imageFile) {
        const uploadRes = await base44.integrations.Core.UploadFile({ file: formData.imageFile });
        imageUrl = uploadRes.file_url;
      }

      // Create FoodItem
      const foodData = {
        name_he: formData.name_he,
        name: formData.name || formData.name_he,
        per100_kcal: parseFloat(formData.per100_kcal),
        per100_protein: parseFloat(formData.per100_protein),
        per100_carbs: parseFloat(formData.per100_carbs),
        per100_fat: parseFloat(formData.per100_fat),
        category: formData.category,
        brand: formData.brand || '',
        source: 'manual',
        active: true,
        image_url: imageUrl,
      };

      const created = await base44.entities.FoodItem.create(foodData);
      
      toast.success('✓ מוצר נוצר בהצלחה! המערכת לומדת ממנו...');
      
      // Reset form
      setFormData({
        name_he: '',
        name: '',
        per100_kcal: '',
        per100_protein: '',
        per100_carbs: '',
        per100_fat: '',
        category: 'משקאות',
        brand: '',
        image_url: null,
        imageFile: null,
      });
      setImagePreview(null);
      
      onSuccess?.();
      onClose();
    } catch (err) {
      console.error('Error creating product:', err);
      toast.error('שגיאה ביצירת המוצר: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="w-full max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>הוסף מוצר חדש</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name (Hebrew) */}
          <div>
            <Label className="text-sm font-medium">שם המוצר (עברית) *</Label>
            <Input
              placeholder="למשל: ריי בר, קוקה קולה"
              value={formData.name_he}
              onChange={(e) => setFormData({ ...formData, name_he: e.target.value })}
              disabled={loading}
            />
          </div>

          {/* Name (English) */}
          <div>
            <Label className="text-sm font-medium">שם המוצר (אנגלית)</Label>
            <Input
              placeholder="למשל: REI Bar, Coca Cola"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              disabled={loading}
            />
          </div>

          {/* Brand */}
          <div>
            <Label className="text-sm font-medium">מותג</Label>
            <Input
              placeholder="מותג (אופציונלי)"
              value={formData.brand}
              onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
              disabled={loading}
            />
          </div>

          {/* Category */}
          <div>
            <Label className="text-sm font-medium">קטגוריה</Label>
            <select
              value={formData.category}
              onChange={(e) => setFormData({ ...formData, category: e.target.value })}
              disabled={loading}
              className="w-full h-10 px-3 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-400 text-sm"
            >
              <option>חלבון</option>
              <option>פחמימה</option>
              <option>שומן</option>
              <option>משקאות</option>
              <option>ירקות</option>
              <option>פירות</option>
              <option>קטניות</option>
              <option>דגנים</option>
              <option>מתוקים</option>
              <option>מנות מוכנות</option>
              <option>חלב ומוצריו</option>
              <option>תוספים</option>
              <option>רטבים</option>
            </select>
          </div>

          {/* Nutrition Values */}
          <div className="bg-slate-50 p-3 rounded-lg">
            <p className="text-xs font-semibold text-slate-600 mb-3">ערכים תזונתיים ל-100 גרם *</p>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">קלוריות</Label>
                <Input
                  type="number"
                  placeholder="קל׳"
                  value={formData.per100_kcal}
                  onChange={(e) => setFormData({ ...formData, per100_kcal: e.target.value })}
                  disabled={loading}
                  step="0.1"
                />
              </div>
              <div>
                <Label className="text-xs">חלבון (ג׳)</Label>
                <Input
                  type="number"
                  placeholder="חלבון"
                  value={formData.per100_protein}
                  onChange={(e) => setFormData({ ...formData, per100_protein: e.target.value })}
                  disabled={loading}
                  step="0.1"
                />
              </div>
              <div>
                <Label className="text-xs">פחמימות (ג׳)</Label>
                <Input
                  type="number"
                  placeholder="פחמימות"
                  value={formData.per100_carbs}
                  onChange={(e) => setFormData({ ...formData, per100_carbs: e.target.value })}
                  disabled={loading}
                  step="0.1"
                />
              </div>
              <div>
                <Label className="text-xs">שומן (ג׳)</Label>
                <Input
                  type="number"
                  placeholder="שומן"
                  value={formData.per100_fat}
                  onChange={(e) => setFormData({ ...formData, per100_fat: e.target.value })}
                  disabled={loading}
                  step="0.1"
                />
              </div>
            </div>
          </div>

          {/* Image Upload */}
          <div>
            <Label className="text-sm font-medium mb-2 block">תמונת מוצר</Label>
            {imagePreview ? (
              <div className="relative">
                <img 
                  src={imagePreview} 
                  alt="preview" 
                  className="w-full h-32 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    setImagePreview(null);
                    setFormData({ ...formData, imageFile: null, image_url: null });
                  }}
                  className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-4 border-2 border-dashed border-slate-300 rounded-lg hover:border-slate-400 transition-colors text-center"
              >
                <Upload className="w-5 h-5 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">לחץ כדי להעלות תמונה</p>
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => handleImageSelect(e.target.files?.[0])}
              className="hidden"
              disabled={loading}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1"
            >
              ביטול
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1 bg-teal-600 hover:bg-teal-700 text-white"
            >
              {loading ? 'שומר...' : 'הוסף מוצר'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}