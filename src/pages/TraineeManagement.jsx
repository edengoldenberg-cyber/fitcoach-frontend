import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Search, User, Mail, Activity, Edit2, Save, X, Calendar, Utensils, Droplets, Dumbbell, MessageSquare, TrendingUp, Bell, BellOff } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';

export default function TraineeManagement() {
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTraineeId, setSelectedTraineeId] = useState(null);
  const [editingNutrition, setEditingNutrition] = useState(false);
  const [editingEmail, setEditingEmail] = useState(false);
  const [nutritionForm, setNutritionForm] = useState({});
  const [newEmail, setNewEmail] = useState('');

  // Fetch coach data
  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  // Fetch all trainees
  const { data: trainees = [] } = useQuery({
    queryKey: ['coachTrainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  // Selected trainee
  const selectedTrainee = trainees.find(t => t.id === selectedTraineeId);

  // Fetch activity logs for selected trainee
  const { data: activityLogs = [] } = useQuery({
    queryKey: ['activityLogs', selectedTrainee?.user_email],
    queryFn: async () => {
      if (!selectedTrainee?.user_email) return [];
      
      // Fetch last 30 days of activity
      const logs = [];
      
      // Meals
      const meals = await base44.entities.MealEntry.filter({ trainee_email: selectedTrainee.user_email });
      meals.slice(0, 50).forEach(m => {
        logs.push({
          type: 'meal',
          date: m.created_date,
          title: `${m.food_name} (${m.meal_type})`,
          details: `${m.calories} קק"ל | ח:${m.protein}g פח:${m.carbs}g ש:${m.fat}g`,
          icon: Utensils,
          color: 'text-orange-500'
        });
      });
      
      // Water
      const water = await base44.entities.WaterEntry.filter({ trainee_email: selectedTrainee.user_email });
      water.slice(0, 50).forEach(w => {
        logs.push({
          type: 'water',
          date: w.created_date,
          title: `מים`,
          details: `${w.amount_ml} מ"ל`,
          icon: Droplets,
          color: 'text-blue-500'
        });
      });
      
      // Workouts
      const workouts = await base44.entities.WorkoutSession.filter({ trainee_email: selectedTrainee.user_email });
      workouts.slice(0, 50).forEach(w => {
        logs.push({
          type: 'workout',
          date: w.created_date,
          title: w.title || 'אימון',
          details: `סטטוס: ${w.status}`,
          icon: Dumbbell,
          color: 'text-purple-500'
        });
      });
      
      // Messages (notifications)
      const notifications = await base44.entities.Notification.filter({ trainee_email: selectedTrainee.user_email });
      notifications.slice(0, 30).forEach(n => {
        logs.push({
          type: 'message',
          date: n.sent_at || n.created_date,
          title: n.title_he,
          details: n.body_he,
          icon: MessageSquare,
          color: 'text-green-500'
        });
      });
      
      // Sort by date descending
      return logs.sort((a, b) => new Date(b.date) - new Date(a.date));
    },
    enabled: !!selectedTrainee?.user_email,
  });

  // Filtered trainees based on search
  const filteredTrainees = trainees.filter(t => 
    t.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.phone?.includes(searchTerm)
  );

  // Update nutrition mutation
  const updateNutritionMutation = useMutation({
    mutationFn: async (data) => {
      await base44.entities.Trainee.update(selectedTraineeId, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachTrainees'] });
      setEditingNutrition(false);
      toast.success('✅ ערכי התזונה עודכנו');
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  // Toggle notifications prompt mutation
  const toggleNotificationsMutation = useMutation({
    mutationFn: async (enabled) => {
      await base44.entities.Trainee.update(selectedTraineeId, { notifications_prompt_enabled: enabled });
    },
    onSuccess: (_, enabled) => {
      queryClient.invalidateQueries({ queryKey: ['coachTrainees'] });
      toast.success(enabled ? '🔔 ממשק ההתראות הופעל' : '🔕 ממשק ההתראות כובה');
    },
  });

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async (newEmail) => {
      await base44.entities.Trainee.update(selectedTraineeId, { 
        user_email: newEmail 
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['coachTrainees'] });
      setEditingEmail(false);
      setNewEmail('');
      toast.success('✅ כתובת המייל עודכנה');
    },
    onError: (error) => {
      toast.error(`❌ שגיאה: ${error.message}`);
    }
  });

  const handleEditNutrition = () => {
    setNutritionForm({
      target_calories: selectedTrainee?.target_calories || 2000,
      target_protein: selectedTrainee?.target_protein || 150,
      target_carbs: selectedTrainee?.target_carbs || 200,
      target_fat: selectedTrainee?.target_fat || 70,
      target_water_ml: selectedTrainee?.target_water_ml || 3000,
    });
    setEditingNutrition(true);
  };

  const handleSaveNutrition = () => {
    updateNutritionMutation.mutate(nutritionForm);
  };

  const handleEditEmail = () => {
    setNewEmail(selectedTrainee?.user_email || '');
    setEditingEmail(true);
  };

  const handleSaveEmail = () => {
    if (!newEmail || !newEmail.includes('@')) {
      toast.error('כתובת מייל לא תקינה');
      return;
    }
    updateEmailMutation.mutate(newEmail);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-6xl mx-auto p-4">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">ניהול מתאמנים</h1>
          <p className="text-slate-600">חיפוש, עריכה וניהול מתאמנים</p>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          {/* Left Panel - Trainee List */}
          <div className="md:col-span-1">
            <Card>
              <CardHeader className="pb-3">
                <div className="relative">
                  <Search className="absolute right-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    type="text"
                    placeholder="חפש מתאמן..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10"
                  />
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-250px)] overflow-y-auto">
                  {filteredTrainees.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      לא נמצאו מתאמנים
                    </div>
                  ) : (
                    filteredTrainees.map((trainee) => (
                      <button
                        key={trainee.id}
                        onClick={() => setSelectedTraineeId(trainee.id)}
                        className={`w-full text-right p-4 border-b hover:bg-slate-50 transition-colors ${
                          selectedTraineeId === trainee.id ? 'bg-teal-50 border-r-4 border-r-teal-500' : ''
                        }`}
                      >
                        <div className="font-medium text-slate-800">{trainee.full_name}</div>
                        <div className="text-xs text-slate-500 mt-1">{trainee.user_email}</div>
                      </button>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Panel - Trainee Details */}
          <div className="md:col-span-2">
            {!selectedTrainee ? (
              <Card className="h-full flex items-center justify-center">
                <CardContent className="text-center p-12">
                  <User className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-500 text-lg">בחר מתאמן מהרשימה</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {/* Trainee Header */}
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h2 className="text-2xl font-bold text-slate-800">{selectedTrainee.full_name}</h2>
                        <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                          <Mail className="w-4 h-4" />
                          <span>{selectedTrainee.user_email}</span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleEditEmail}
                            className="h-6 px-2"
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                      <div className="text-left text-sm text-slate-500 space-y-1">
                        <div>📞 {selectedTrainee.phone || 'אין'}</div>
                        <div>🎂 {selectedTrainee.birth_date ? format(new Date(selectedTrainee.birth_date), 'dd/MM/yyyy') : 'אין'}</div>
                        <button
                          onClick={() => toggleNotificationsMutation.mutate(!(selectedTrainee.notifications_prompt_enabled !== false))}
                          disabled={toggleNotificationsMutation.isPending}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium transition-all ${
                            selectedTrainee.notifications_prompt_enabled !== false
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                          }`}
                        >
                          {selectedTrainee.notifications_prompt_enabled !== false
                            ? <><Bell className="w-3 h-3" /> התראות פועלות</>
                            : <><BellOff className="w-3 h-3" /> התראות כבויות</>
                          }
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">גובה</p>
                        <p className="font-bold">{selectedTrainee.height_cm || '-'} ס"מ</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">משקל</p>
                        <p className="font-bold">{selectedTrainee.weight_kg || '-'} ק"ג</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">רמת פעילות</p>
                        <p className="font-bold">{selectedTrainee.activity_level || '-'}</p>
                      </div>
                      <div className="bg-slate-50 p-3 rounded">
                        <p className="text-slate-600">יעד</p>
                        <p className="font-bold">{selectedTrainee.goal || '-'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tabs */}
                <Tabs defaultValue="nutrition" dir="rtl">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="nutrition">ערכי תזונה</TabsTrigger>
                    <TabsTrigger value="activity">לוג פעילות</TabsTrigger>
                  </TabsList>

                  <TabsContent value="nutrition" className="space-y-4">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between">
                        <CardTitle>יעדי תזונה יומיים</CardTitle>
                        {!editingNutrition && (
                          <Button
                            onClick={handleEditNutrition}
                            size="sm"
                            variant="outline"
                          >
                            <Edit2 className="w-4 h-4 ml-2" />
                            ערוך
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent>
                        {!editingNutrition ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div className="bg-orange-50 p-4 rounded-lg">
                              <p className="text-sm text-orange-600 mb-1">קלוריות</p>
                              <p className="text-2xl font-bold text-orange-700">
                                {selectedTrainee.target_calories || 2000}
                              </p>
                            </div>
                            <div className="bg-blue-50 p-4 rounded-lg">
                              <p className="text-sm text-blue-600 mb-1">חלבון</p>
                              <p className="text-2xl font-bold text-blue-700">
                                {selectedTrainee.target_protein || 150}g
                              </p>
                            </div>
                            <div className="bg-green-50 p-4 rounded-lg">
                              <p className="text-sm text-green-600 mb-1">פחמימות</p>
                              <p className="text-2xl font-bold text-green-700">
                                {selectedTrainee.target_carbs || 200}g
                              </p>
                            </div>
                            <div className="bg-purple-50 p-4 rounded-lg">
                              <p className="text-sm text-purple-600 mb-1">שומן</p>
                              <p className="text-2xl font-bold text-purple-700">
                                {selectedTrainee.target_fat || 70}g
                              </p>
                            </div>
                            <div className="bg-cyan-50 p-4 rounded-lg col-span-2">
                              <p className="text-sm text-cyan-600 mb-1">מים</p>
                              <p className="text-2xl font-bold text-cyan-700">
                                {(selectedTrainee.target_water_ml || 3000) / 1000}L
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <div>
                              <Label>קלוריות יומיות</Label>
                              <Input
                                type="number"
                                value={nutritionForm.target_calories}
                                onChange={(e) => setNutritionForm({...nutritionForm, target_calories: parseInt(e.target.value)})}
                              />
                            </div>
                            <div>
                              <Label>חלבון יומי (גרם)</Label>
                              <Input
                                type="number"
                                value={nutritionForm.target_protein}
                                onChange={(e) => setNutritionForm({...nutritionForm, target_protein: parseInt(e.target.value)})}
                              />
                            </div>
                            <div>
                              <Label>פחמימות יומיות (גרם)</Label>
                              <Input
                                type="number"
                                value={nutritionForm.target_carbs}
                                onChange={(e) => setNutritionForm({...nutritionForm, target_carbs: parseInt(e.target.value)})}
                              />
                            </div>
                            <div>
                              <Label>שומן יומי (גרם)</Label>
                              <Input
                                type="number"
                                value={nutritionForm.target_fat}
                                onChange={(e) => setNutritionForm({...nutritionForm, target_fat: parseInt(e.target.value)})}
                              />
                            </div>
                            <div>
                              <Label>מים יומיים (מ"ל)</Label>
                              <Input
                                type="number"
                                value={nutritionForm.target_water_ml}
                                onChange={(e) => setNutritionForm({...nutritionForm, target_water_ml: parseInt(e.target.value)})}
                              />
                            </div>
                            <div className="flex gap-2">
                              <Button
                                onClick={handleSaveNutrition}
                                disabled={updateNutritionMutation.isPending}
                                className="flex-1 bg-teal-600 hover:bg-teal-700"
                              >
                                <Save className="w-4 h-4 ml-2" />
                                {updateNutritionMutation.isPending ? 'שומר...' : 'שמור שינויים'}
                              </Button>
                              <Button
                                onClick={() => setEditingNutrition(false)}
                                variant="outline"
                                className="flex-1"
                              >
                                <X className="w-4 h-4 ml-2" />
                                ביטול
                              </Button>
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="activity" className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Activity className="w-5 h-5" />
                          לוג פעילות אחרון
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3 max-h-[500px] overflow-y-auto">
                          {activityLogs.length === 0 ? (
                            <div className="text-center py-8 text-slate-500">
                              אין פעילות להצגה
                            </div>
                          ) : (
                            activityLogs.map((log, idx) => {
                              const Icon = log.icon;
                              return (
                                <div
                                  key={idx}
                                  className="flex gap-3 p-3 bg-slate-50 rounded-lg hover:bg-slate-100 transition-colors"
                                >
                                  <div className={`flex-shrink-0 w-10 h-10 rounded-full bg-white flex items-center justify-center ${log.color}`}>
                                    <Icon className="w-5 h-5" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-start justify-between gap-2">
                                      <p className="font-medium text-slate-800 text-sm">{log.title}</p>
                                      <span className="text-xs text-slate-500 whitespace-nowrap">
                                        {format(new Date(log.date), 'dd/MM HH:mm')}
                                      </span>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1 truncate">{log.details}</p>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        </div>

        {/* Edit Email Dialog */}
        <Dialog open={editingEmail} onOpenChange={setEditingEmail}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>עריכת כתובת מייל</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>כתובת מייל חדשה</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="example@gmail.com"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveEmail}
                  disabled={updateEmailMutation.isPending}
                  className="flex-1 bg-teal-600 hover:bg-teal-700"
                >
                  <Save className="w-4 h-4 ml-2" />
                  {updateEmailMutation.isPending ? 'שומר...' : 'שמור'}
                </Button>
                <Button
                  onClick={() => setEditingEmail(false)}
                  variant="outline"
                  className="flex-1"
                >
                  ביטול
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}