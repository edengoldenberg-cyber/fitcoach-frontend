import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, Eye, Edit, AlertCircle, Copy, MoveRight } from 'lucide-react';
import { toast } from 'sonner';
import CreateTemplateDialog from '../components/coach/CreateTemplateDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const MEAL_TYPE_LABELS = {
  breakfast: '🌅 בוקר',
  lunch: '☀️ צהריים',
  dinner: '🌙 ערב',
  snack: '🍎 נשנוש'
};

export default function TemplateManager() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['mealTemplates'],
    queryFn: () => base44.entities.MealTemplate.list(),
    refetchOnMount: true
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: (id) => base44.entities.MealTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
      toast.success('✅ טמפלט נמחק');
    },
    onError: (err) => {
      toast.error('❌ שגיאה במחיקה: ' + err?.message);
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.MealTemplate.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
      toast.success('✅ סטטוס עודכן');
    }
  });

  const duplicateTemplateMutation = useMutation({
    mutationFn: async ({ template, newMealType }) => {
      console.log('[TEMPLATE_DUPLICATE_START]', { templateId: template.id, newMealType });
      
      const duplicateData = {
        name: `${template.name} - עותק`,
        description: template.description,
        meal_type: newMealType || template.meal_type,
        items: template.items,
        base_calories: template.base_calories,
        is_active: true
      };
      
      const result = await base44.entities.MealTemplate.create(duplicateData);
      console.log('[TEMPLATE_DUPLICATE_SUCCESS]', { newId: result.id });
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
      toast.success('✅ טמפלט שוכפל בהצלחה');
    },
    onError: (err) => {
      console.error('[TEMPLATE_DUPLICATE_ERROR]', err);
      toast.error('❌ שגיאה בשכפול טמפלט');
    }
  });

  const changeMealTypeMutation = useMutation({
    mutationFn: async ({ id, newMealType }) => {
      console.log('[TEMPLATE_CHANGE_MEALTYPE_START]', { id, newMealType });
      const result = await base44.entities.MealTemplate.update(id, { meal_type: newMealType });
      console.log('[TEMPLATE_CHANGE_MEALTYPE_SUCCESS]', { id, newMealType });
      return result;
    },
    onSuccess: (_, { newMealType }) => {
      queryClient.invalidateQueries({ queryKey: ['mealTemplates'] });
      const mealTypeLabels = { breakfast: 'בוקר', lunch: 'צהריים', dinner: 'ערב', snack: 'ביניים' };
      toast.success(`✅ הועבר ל${mealTypeLabels[newMealType] || newMealType}`);
    },
    onError: (err) => {
      console.error('[TEMPLATE_CHANGE_MEALTYPE_ERROR]', err);
      toast.error('❌ שגיאה בשינוי סוג ארוחה');
    }
  });

  const handleDelete = (template) => {
    if (window.confirm(`למחוק "${template.name}"?`)) {
      deleteTemplateMutation.mutate(template.id);
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setShowCreateDialog(true);
  };

  const handleCloseDialog = () => {
    setShowCreateDialog(false);
    setEditingTemplate(null);
  };

  // Group templates by meal type
  const templatesByType = templates.reduce((acc, t) => {
    if (!acc[t.meal_type]) acc[t.meal_type] = [];
    acc[t.meal_type].push(t);
    return acc;
  }, {});

  const activeCount = templates.filter(t => t.is_active).length;
  const totalCount = templates.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-3xl font-bold text-slate-800">ניהול טמפלטים</h1>
              <p className="text-slate-600 mt-1">
                צור טמפלטים מוכנים להצעות ארוחה מתוך מאגר המזון
              </p>
            </div>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4 ml-2" />
              צור טמפלט חדש
            </Button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4 bg-white">
              <div className="text-sm text-slate-600">סה״כ טמפלטים</div>
              <div className="text-2xl font-bold text-slate-800">{totalCount}</div>
            </Card>
            <Card className="p-4 bg-white">
              <div className="text-sm text-slate-600">פעילים</div>
              <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            </Card>
            <Card className="p-4 bg-white">
              <div className="text-sm text-slate-600">לא פעילים</div>
              <div className="text-2xl font-bold text-slate-400">{totalCount - activeCount}</div>
            </Card>
          </div>
        </div>

        {isLoading && (
          <div className="text-center py-12 text-slate-500">טוען טמפלטים...</div>
        )}

        {!isLoading && templates.length === 0 && (
          <Card className="p-12 text-center bg-amber-50 border-amber-200">
            <AlertCircle className="w-12 h-12 mx-auto mb-4 text-amber-600" />
            <h3 className="text-lg font-semibold text-amber-900 mb-2">
              אין טמפלטים עדיין
            </h3>
            <p className="text-amber-700 mb-4">
              צור טמפלט ראשון כדי להתחיל להציע ארוחות מוכנות למתאמנים
            </p>
            <Button
              onClick={() => setShowCreateDialog(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              <Plus className="w-4 h-4 ml-2" />
              צור טמפלט ראשון
            </Button>
          </Card>
        )}

        {/* Templates by Type */}
        {!isLoading && templates.length > 0 && (
          <div className="space-y-6">
            {Object.entries(MEAL_TYPE_LABELS).map(([type, label]) => {
              const typeTemplates = templatesByType[type] || [];
              if (typeTemplates.length === 0) return null;

              return (
                <div key={type}>
                  <h2 className="text-xl font-bold text-slate-800 mb-4">{label}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {typeTemplates.map((template) => {
                      const itemsCount = template.items?.length || 0;
                      const baseCalories = template.base_calories || 0;

                      return (
                        <Card 
                          key={template.id}
                          className={`p-4 border-r-4 ${
                            template.is_active 
                              ? 'bg-white border-teal-500' 
                              : 'bg-slate-50 border-slate-300 opacity-60'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div>
                              <h3 className="font-bold text-slate-800">{template.name}</h3>
                              {template.description && (
                                <p className="text-sm text-slate-600 mt-1">{template.description}</p>
                              )}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(template)}
                                className="text-slate-600 hover:text-slate-800"
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-slate-600 hover:text-slate-800">
                                    <Copy className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => duplicateTemplateMutation.mutate({ template })}
                                  >
                                    <Copy className="w-4 h-4 ml-2" />
                                    שכפל באותו סוג
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => duplicateTemplateMutation.mutate({ 
                                      template, 
                                      newMealType: 'breakfast' 
                                    })}
                                  >
                                    שכפל לבוקר
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => duplicateTemplateMutation.mutate({ 
                                      template, 
                                      newMealType: 'lunch' 
                                    })}
                                  >
                                    שכפל לצהריים
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => duplicateTemplateMutation.mutate({ 
                                      template, 
                                      newMealType: 'dinner' 
                                    })}
                                  >
                                    שכפל לערב
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => duplicateTemplateMutation.mutate({ 
                                      template, 
                                      newMealType: 'snack' 
                                    })}
                                  >
                                    שכפל לביניים
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>

                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="ghost" size="icon" className="text-slate-600 hover:text-slate-800">
                                    <MoveRight className="w-4 h-4" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    onClick={() => changeMealTypeMutation.mutate({ 
                                      id: template.id, 
                                      newMealType: 'breakfast' 
                                    })}
                                    disabled={template.meal_type === 'breakfast'}
                                  >
                                    העבר לבוקר
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => changeMealTypeMutation.mutate({ 
                                      id: template.id, 
                                      newMealType: 'lunch' 
                                    })}
                                    disabled={template.meal_type === 'lunch'}
                                  >
                                    העבר לצהריים
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => changeMealTypeMutation.mutate({ 
                                      id: template.id, 
                                      newMealType: 'dinner' 
                                    })}
                                    disabled={template.meal_type === 'dinner'}
                                  >
                                    העבר לערב
                                  </DropdownMenuItem>
                                  <DropdownMenuItem
                                    onClick={() => changeMealTypeMutation.mutate({ 
                                      id: template.id, 
                                      newMealType: 'snack' 
                                    })}
                                    disabled={template.meal_type === 'snack'}
                                  >
                                    העבר לביניים
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                              
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDelete(template)}
                                className="text-red-600 hover:text-red-800"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>

                          {/* Items */}
                          <div className="mb-3 text-sm">
                            {itemsCount > 0 ? (
                              <div className="space-y-1">
                                <div className="text-slate-400 text-xs">
                                  {itemsCount} פריטים
                                </div>
                              </div>
                            ) : (
                              <div className="text-slate-400 italic">אין פריטים</div>
                            )}
                          </div>

                          {/* Stats */}
                          <div className="flex justify-between items-center pt-3 border-t">
                            <div className="text-sm">
                              <span className="font-bold text-teal-600">{baseCalories}</span>
                              <span className="text-slate-500 mr-1">קל׳ בסיס</span>
                            </div>
                            <div className="text-xs text-slate-600">
                              {itemsCount} פריטים
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => toggleActiveMutation.mutate({
                                id: template.id,
                                is_active: !template.is_active
                              })}
                              className={template.is_active ? 'text-green-600' : 'text-slate-400'}
                            >
                              {template.is_active ? '✓ פעיל' : '✗ לא פעיל'}
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreateDialog && (
        <CreateTemplateDialog
          open={showCreateDialog}
          onClose={handleCloseDialog}
          editTemplate={editingTemplate}
        />
      )}
    </div>
  );
}