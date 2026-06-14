import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Flag } from 'lucide-react';

/**
 * דיווח אי-דיוק ביחידת מידה (מתאמן)
 */
export default function ReportUnitInaccuracy({ 
  open, 
  onClose, 
  product, 
  selectedUnit,
  userEmail 
}) {
  const [suggestedGrams, setSuggestedGrams] = useState('');
  const [freeText, setFreeText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!product || !selectedUnit) {
      toast.error('חסרים נתונים');
      return;
    }

    setSubmitting(true);

    try {
      await base44.entities.UnitInaccuracyReport.create({
        user_email: userEmail,
        product_id: product.id,
        product_name: product.name_he || product.name,
        chosen_unit_name: selectedUnit.name,
        suggested_grams: suggestedGrams ? parseFloat(suggestedGrams) : null,
        free_text: freeText,
        status: 'pending',
      });

      toast.success('הדיווח נשלח בהצלחה! תודה על הפידבק 🙏');
      onClose();
      setSuggestedGrams('');
      setFreeText('');
    } catch (error) {
      console.error('Error reporting inaccuracy:', error);
      toast.error('שגיאה בשליחת הדיווח');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="w-5 h-5 text-orange-500" />
            דיווח על אי-דיוק ביחידת מידה
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* מוצר ויחידה */}
          <div className="bg-slate-50 p-3 rounded-lg text-sm">
            <div className="font-bold">{product?.name_he || product?.name}</div>
            <div className="text-slate-600 text-xs mt-1">
              יחידה נבחרת: {selectedUnit?.name} ({selectedUnit?.grams_per_unit} גרם)
            </div>
          </div>

          {/* הצעה לגרמים */}
          <div>
            <label className="text-sm font-medium block mb-2">
              הצעה לגרמים ליחידה (אופציונלי)
            </label>
            <Input
              type="number"
              placeholder="למשל: 250"
              value={suggestedGrams}
              onChange={(e) => setSuggestedGrams(e.target.value)}
            />
          </div>

          {/* טקסט חופשי */}
          <div>
            <label className="text-sm font-medium block mb-2">
              פרטים נוספים
            </label>
            <Textarea
              placeholder="למשל: 'כפית' צריכה להיות 5 גרם ולא 10"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
            />
          </div>

          {/* כפתורים */}
          <div className="flex gap-2">
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1"
            >
              {submitting ? 'שולח...' : 'שלח דיווח'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
            >
              ביטול
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}