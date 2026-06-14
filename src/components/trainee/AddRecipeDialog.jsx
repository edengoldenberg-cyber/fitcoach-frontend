import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Plus, X, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

export default function AddRecipeDialog({ open, onOpenChange, onSuccess }) {
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState([{ name: '', quantity: '', unit: 'גרם' }]);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (event) => setImagePreview(event.target.result);
      reader.readAsDataURL(file);
    }
  };

  const handleIngredientChange = (index, field, value) => {
    const newIngredients = [...ingredients];
    newIngredients[index][field] = value;
    setIngredients(newIngredients);
  };

  const addIngredient = () => {
    setIngredients([...ingredients, { name: '', quantity: '', unit: 'גרם' }]);
  };

  const removeIngredient = (index) => {
    setIngredients(ingredients.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!title.trim() || !description.trim()) {
      toast.error('שם ותיאור הם שדות חובה');
      return;
    }

    const validIngredients = ingredients.filter(ing => ing.name && ing.quantity);
    if (validIngredients.length === 0) {
      toast.error('יש להוסיף לפחות מרכיב אחד');
      return;
    }

    setLoading(true);
    try {
      const user = await base44.auth.me();
      
      let imageUrl = null;
      if (imageFile) {
        const uploadResult = await base44.integrations.Core.UploadFile({ file: imageFile });
        imageUrl = uploadResult.file_url;
      }

      const recipeData = {
        title: title.trim(),
        description: description.trim(),
        user_email: user.email,
        user_name: user.full_name,
        ingredients: validIngredients.map(ing => ({
          name: ing.name,
          quantity: parseFloat(ing.quantity),
          unit: ing.unit
        }))
      };

      if (imageUrl) {
        recipeData.image_url = imageUrl;
      }

      await base44.entities.Recipe.create(recipeData);
      
      toast.success('המתכון הועלה בהצלחה! ה-AI מנתח את הערכים...');
      
      setTitle('');
      setDescription('');
      setIngredients([{ name: '', quantity: '', unit: 'גרם' }]);
      setImageFile(null);
      setImagePreview(null);
      onOpenChange(false);
      
      if (onSuccess) onSuccess();
    } catch (error) {
      console.error('Error creating recipe:', error);
      toast.error('שגיאה בהעלאת המתכון');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-screen overflow-y-auto">
        <DialogHeader>
          <DialogTitle>הוסף מתכון חדש</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div>
            <Label>שם המתכון *</Label>
            <Input
              placeholder="למשל: עוף בתנור עם ירקות"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={loading}
            />
          </div>

          {/* Description */}
          <div>
            <Label>הוראות הכנה *</Label>
            <Textarea
              placeholder="תאר את שלבי ההכנה..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={loading}
              className="h-24"
            />
          </div>

          {/* Image Upload */}
          <div>
            <Label>תמונה (אופציונלי)</Label>
            <div className="border-2 border-dashed rounded-lg p-4 text-center">
              {imagePreview ? (
                <div className="relative">
                  <img src={imagePreview} alt="Preview" className="w-full h-40 object-cover rounded" />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview(null);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-2">
                  <Upload className="w-6 h-6 text-slate-400" />
                  <span className="text-sm text-slate-600">לחץ להעלאת תמונה</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageSelect}
                    className="hidden"
                    disabled={loading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Ingredients */}
          <div>
            <Label className="mb-2 block">מרכיבים *</Label>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {ingredients.map((ing, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    placeholder="שם מרכיב"
                    value={ing.name}
                    onChange={(e) => handleIngredientChange(index, 'name', e.target.value)}
                    disabled={loading}
                    className="flex-1"
                  />
                  <Input
                    placeholder="כמות"
                    type="number"
                    value={ing.quantity}
                    onChange={(e) => handleIngredientChange(index, 'quantity', e.target.value)}
                    disabled={loading}
                    className="w-20"
                  />
                  <select
                    value={ing.unit}
                    onChange={(e) => handleIngredientChange(index, 'unit', e.target.value)}
                    disabled={loading}
                    className="px-2 border rounded"
                  >
                    <option>גרם</option>
                    <option>מיליליטר</option>
                    <option>כוס</option>
                    <option>כף</option>
                    <option>כפית</option>
                    <option>יחידה</option>
                  </select>
                  {ingredients.length > 1 && (
                    <button
                      onClick={() => removeIngredient(index)}
                      disabled={loading}
                      className="text-red-500 hover:text-red-700"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addIngredient}
              disabled={loading}
              className="mt-2 w-full"
            >
              <Plus className="w-4 h-4 mr-2" />
              הוסף מרכיב
            </Button>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              ביטול
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={loading}
              className="flex-1"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  מעלה...
                </>
              ) : (
                'העלה מתכון'
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}