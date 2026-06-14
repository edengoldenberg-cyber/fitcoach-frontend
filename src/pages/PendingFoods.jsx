import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ClipboardList, Check, X, Edit2, User } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ["חלבון", "פחמימה", "שומן", "ממרח", "חלב ומוצריו", "ירקות", "פירות", "קטניות", "דגנים", "משקאות", "מתוקים", "מנות מוכנות", "תוספים", "רטבים"];

export default function PendingFoods() {
  const [selectedItem, setSelectedItem] = useState(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [editData, setEditData] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const queryClient = useQueryClient();

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

  const { data: pendingItems = [], isLoading } = useQuery({
    queryKey: ['pendingFoodItems'],
    queryFn: () => base44.entities.PendingFoodItem.list('-created_date'),
    enabled: isCoach,
  });

  const approveMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // Create the food item
      const normalized = data.name_he.trim().replace(/\s+/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '').toLowerCase();
      const foodItem = await base44.entities.FoodItem.create({
        name_he: data.name_he,
        normalized_name: normalized,
        category: data.category,
        per100_kcal: data.per100_kcal,
        per100_protein: data.per100_protein,
        per100_carbs: data.per100_carbs,
        per100_fat: data.per100_fat,
        brand: data.brand || '',
        barcodes: data.barcode ? [data.barcode] : [],
        source: 'manual',
        active: true,
      });

      // Update pending item
      await base44.entities.PendingFoodItem.update(id, {
        status: 'approved',
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
        food_item_id: foodItem.id,
      });

      return foodItem;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingFoodItems'] });
      queryClient.invalidateQueries({ queryKey: ['foodItems'] });
      toast.success('המוצר אושר ונוסף למאגר');
      setShowEditDialog(false);
      setSelectedItem(null);
      setEditData(null);
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id, reason }) => {
      await base44.entities.PendingFoodItem.update(id, {
        status: 'rejected',
        reviewed_by: user.email,
        reviewed_at: new Date().toISOString(),
        rejection_reason: reason,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pendingFoodItems'] });
      toast.success('ההצעה נדחתה');
      setSelectedItem(null);
      setRejectionReason('');
    },
    onError: (err) => toast.error(`שגיאה: ${err.message}`),
  });

  const handleEdit = (item) => {
    setEditData({
      name_he: item.name_he,
      category: item.category,
      per100_kcal: item.per100_kcal,
      per100_protein: item.per100_protein,
      per100_carbs: item.per100_carbs,
      per100_fat: item.per100_fat,
      brand: item.brand || '',
      barcode: item.barcode || '',
    });
    setSelectedItem(item);
    setShowEditDialog(true);
  };

  const handleApprove = () => {
    if (!editData) return;
    approveMutation.mutate({ id: selectedItem.id, data: editData });
  };

  const handleReject = () => {
    if (!rejectionReason.trim()) {
      toast.error('נא להזין סיבת דחייה');
      return;
    }
    rejectMutation.mutate({ id: selectedItem.id, reason: rejectionReason });
  };

  if (!isCoach) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" dir="rtl">
        <Card className="max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-red-600 font-medium">אין הרשאה לצפות במסך זה</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const pendingCount = pendingItems.filter(i => i.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex items-center gap-3 mb-6">
          <ClipboardList className="w-8 h-8 text-teal-600" />
          <div>
            <h1 className="text-2xl font-bold text-slate-800">הצעות מוצרים חדשים</h1>
            <p className="text-sm text-slate-600">
              {pendingCount > 0 ? `${pendingCount} הצעות ממתינות לאישור` : 'אין הצעות חדשות'}
            </p>
          </div>
        </div>

        {isLoading ? (
          <Card><CardContent className="pt-6 text-center">טוען...</CardContent></Card>
        ) : pendingItems.length === 0 ? (
          <Card><CardContent className="pt-6 text-center text-slate-500">אין הצעות</CardContent></Card>
        ) : (
          <div className="space-y-4">
            {pendingItems.map(item => (
              <Card key={item.id} className={
                item.status === 'pending' ? 'border-l-4 border-l-yellow-500' :
                item.status === 'approved' ? 'border-l-4 border-l-green-500 opacity-60' :
                'border-l-4 border-l-red-500 opacity-60'
              }>
                <CardContent className="pt-6">
                  <div className="flex gap-4">
                    {item.image_url && (
                      <img src={item.image_url} alt={item.name_he} className="w-24 h-24 object-cover rounded border" />
                    )}
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h3 className="font-bold text-lg">{item.name_he}</h3>
                          <div className="flex items-center gap-2 text-sm text-slate-600 mt-1">
                            <User className="w-3 h-3" />
                            <span>{item.proposed_by_name}</span>
                            <span className="text-slate-400">•</span>
                            <span>{new Date(item.created_date).toLocaleDateString('he-IL')}</span>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded text-xs font-medium ${
                          item.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          item.status === 'approved' ? 'bg-green-100 text-green-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {item.status === 'pending' ? 'ממתין' : item.status === 'approved' ? 'אושר' : 'נדחה'}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm mb-3">
                        <div className="bg-slate-50 p-2 rounded">
                          <p className="text-xs text-slate-500">קטגוריה</p>
                          <p className="font-medium">{item.category}</p>
                        </div>
                        <div className="bg-green-50 p-2 rounded">
                          <p className="text-xs text-green-600">קלוריות</p>
                          <p className="font-bold text-green-700">{item.per100_kcal}</p>
                        </div>
                        <div className="bg-blue-50 p-2 rounded">
                          <p className="text-xs text-blue-600">חלבון</p>
                          <p className="font-bold text-blue-700">{item.per100_protein}g</p>
                        </div>
                        <div className="bg-orange-50 p-2 rounded">
                          <p className="text-xs text-orange-600">פחמימות</p>
                          <p className="font-bold text-orange-700">{item.per100_carbs}g</p>
                        </div>
                        <div className="bg-purple-50 p-2 rounded">
                          <p className="text-xs text-purple-600">שומן</p>
                          <p className="font-bold text-purple-700">{item.per100_fat}g</p>
                        </div>
                      </div>

                      {item.brand && (
                        <p className="text-sm text-slate-600 mb-1">מותג: {item.brand}</p>
                      )}
                      {item.barcode && (
                        <p className="text-xs text-slate-500 mb-1">ברקוד: {item.barcode}</p>
                      )}
                      {item.notes && (
                        <p className="text-sm text-slate-700 bg-slate-50 p-2 rounded mt-2">
                          💬 {item.notes}
                        </p>
                      )}
                      {item.rejection_reason && (
                        <p className="text-sm text-red-700 bg-red-50 p-2 rounded mt-2">
                          ❌ סיבת דחייה: {item.rejection_reason}
                        </p>
                      )}

                      {item.status === 'pending' && (
                        <div className="flex gap-2 mt-3">
                          <Button size="sm" onClick={() => handleEdit(item)} className="bg-teal-600 hover:bg-teal-700">
                            <Edit2 className="w-3 h-3 ml-1" />
                            ערוך ואשר
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setSelectedItem(item);
                              setRejectionReason('');
                            }}
                            className="text-red-600 hover:bg-red-50"
                          >
                            <X className="w-3 h-3 ml-1" />
                            דחה
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Edit & Approve Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>ערוך ואשר מוצר</DialogTitle>
            </DialogHeader>

            {editData && (
              <div className="space-y-4">
                <div>
                  <Label>שם המוצר</Label>
                  <Input
                    value={editData.name_he}
                    onChange={(e) => setEditData({ ...editData, name_he: e.target.value })}
                  />
                </div>

                <div>
                  <Label>קטגוריה</Label>
                  <Select value={editData.category} onValueChange={(v) => setEditData({ ...editData, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>קלוריות/100g</Label>
                    <Input
                      type="number"
                      value={editData.per100_kcal}
                      onChange={(e) => setEditData({ ...editData, per100_kcal: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>חלבון/100g</Label>
                    <Input
                      type="number"
                      value={editData.per100_protein}
                      onChange={(e) => setEditData({ ...editData, per100_protein: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>פחמימות/100g</Label>
                    <Input
                      type="number"
                      value={editData.per100_carbs}
                      onChange={(e) => setEditData({ ...editData, per100_carbs: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>שומן/100g</Label>
                    <Input
                      type="number"
                      value={editData.per100_fat}
                      onChange={(e) => setEditData({ ...editData, per100_fat: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <Label>מותג</Label>
                  <Input
                    value={editData.brand}
                    onChange={(e) => setEditData({ ...editData, brand: e.target.value })}
                  />
                </div>

                <div>
                  <Label>ברקוד</Label>
                  <Input
                    value={editData.barcode}
                    onChange={(e) => setEditData({ ...editData, barcode: e.target.value })}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditDialog(false)}>ביטול</Button>
              <Button onClick={handleApprove} className="bg-green-600 hover:bg-green-700">
                <Check className="w-4 h-4 ml-2" />
                אשר והוסף למאגר
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={!!selectedItem && !showEditDialog} onOpenChange={() => setSelectedItem(null)}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>דחיית הצעה</DialogTitle>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>סיבת הדחייה</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="למה ההצעה נדחתה..."
                  className="h-24"
                />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedItem(null)}>ביטול</Button>
              <Button onClick={handleReject} className="bg-red-600 hover:bg-red-700">
                <X className="w-4 h-4 ml-2" />
                דחה הצעה
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}