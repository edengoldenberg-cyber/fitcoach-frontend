import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Upload, Plus } from 'lucide-react';

const CATEGORIES = ["חלבון", "פחמימה", "שומן", "ממרח", "חלב ומוצריו", "ירקות", "פירות", "קטניות", "דגנים", "משקאות", "מתוקים", "מנות מוכנות", "תוספים", "רטבים"];

export default function SuggestFoodDialog({ open, onClose, trainee }) {
  const [formData, setFormData] = useState({
    name_he: '',
    category: 'אחר',
    per100_kcal: '',
    per100_protein: '',
    per100_carbs: '',
    per100_fat: '',
    brand: '',
    barcode: '',
    notes: '',
  });
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    setImage(file);
    const reader = new FileReader();
    reader.onloadend = () => {
      setImagePreview(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!formData.name_he) {
      toast.error('שם המוצר חובה');
      return;
    }

    if (!formData.per100_kcal || formData.per100_kcal < 0) {
      toast.error('קלוריות חייבות להיות מספר חיובי');
      return;
    }

    setSubmitting(true);
    try {
      let imageUrl = null;
      
      // Upload image if provided
      if (image) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file: image });
        imageUrl = file_url;
      }

      // Create pending food item
      await base44.entities.PendingFoodItem.create({
        proposed_by_email: trainee.user_email,
        proposed_by_name: trainee.full_name,
        name_he: formData.name_he,
        category: formData.category,
        per100_kcal: parseFloat(formData.per100_kcal),
        per100_protein: parseFloat(formData.per100_protein || 0),
        per100_carbs: parseFloat(formData.per100_carbs || 0),
        per100_fat: parseFloat(formData.per100_fat || 0),
        brand: formData.brand || '',
        barcode: formData.barcode || '',
        image_url: imageUrl,
        notes: formData.notes || '',
        status: 'pending',
      });

      toast.success('ההצעה נשלחה למאמן לאישור');
      
      // Reset form
      setFormData({
        name_he: '',
        category: 'אחר',
        per100_kcal: '',
        per100_protein: '',
        per100_carbs: '',
        per100_fat: '',
        brand: '',
        barcode: '',
        notes: '',
      });
      setImage(null);
      setImagePreview(null);
      onClose();
    } catch (err) {
      toast.error(`שגיאה: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle>הצע מוצר חדש למאגר</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            💡 המוצר ייבדק ויאושר על ידי המאמן לפני הוספתו למאגר
          </div>

          <div>
            <Label>שם המוצר *</Label>
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
              <Label>חלבון/100g (גרם)</Label>
              <Input
                type="number"
                value={formData.per100_protein}
                onChange={(e) => setFormData({ ...formData, per100_protein: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>פחמימות/100g (גרם)</Label>
              <Input
                type="number"
                value={formData.per100_carbs}
                onChange={(e) => setFormData({ ...formData, per100_carbs: e.target.value })}
                placeholder="0"
              />
            </div>
            <div>
              <Label>שומן/100g (גרם)</Label>
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
            <Label>ברקוד (אופציונלי)</Label>
            <Input
              value={formData.barcode}
              onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
              placeholder="7290000000000"
            />
          </div>

          <div>
            <Label>תמונת המוצר (אופציונלי)</Label>
            <div className="flex gap-2">
              <label className="flex-1">
                <Button variant="outline" className="w-full" asChild>
                  <span>
                    <Upload className="w-4 h-4 ml-2" />
                    {image ? 'שנה תמונה' : 'העלה תמונה'}
                  </span>
                </Button>
                <input type="file" accept="image/*" onChange={handleImageSelect} className="hidden" />
              </label>
            </div>
            {imagePreview && (
              <img src={imagePreview} alt="תצוגה מקדימה" className="mt-2 max-h-40 rounded border" />
            )}
          </div>

          <div>
            <Label>הערות (אופציונלי)</Label>
            <Textarea
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="הערות נוספות למאמן..."
              className="h-20"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>ביטול</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
            <Plus className="w-4 h-4 ml-2" />
            שלח הצעה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}