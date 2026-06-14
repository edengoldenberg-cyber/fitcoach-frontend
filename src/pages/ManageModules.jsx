import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Utensils, Droplets, Dumbbell, Scale, Settings } from "lucide-react";
import { toast } from 'sonner';

export default function ManageModules() {
  const [search, setSearch] = useState('');
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const [moduleSettings, setModuleSettings] = useState({});
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  const updateModulesMutation = useMutation({
    mutationFn: ({ traineeId, modules }) => 
      base44.entities.Trainee.update(traineeId, { visible_modules: modules }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      toast.success('✅ הגדרות הפאנלים עודכנו בהצלחה');
      setSelectedTrainee(null);
    },
    onError: () => {
      toast.error('❌ שגיאה בעדכון הגדרות');
    },
  });

  const filteredTrainees = trainees.filter(t => 
    t.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    t.user_email?.toLowerCase().includes(search.toLowerCase())
  );

  const openSettings = (trainee) => {
    setSelectedTrainee(trainee);
    setModuleSettings(trainee.visible_modules || {
      nutrition: true,
      water: true,
      workouts: true,
      metrics: true,
    });
  };

  const handleSave = () => {
    updateModulesMutation.mutate({
      traineeId: selectedTrainee.id,
      modules: moduleSettings,
    });
  };

  const getActiveModulesCount = (trainee) => {
    const modules = trainee.visible_modules || { nutrition: true, water: true, workouts: true, metrics: true };
    return Object.values(modules).filter(v => v !== false).length;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-800 mb-2">ניהול פאנלים</h1>
          <p className="text-slate-600">קבע אילו מודולים כל מתאמן יראה באפליקציה</p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש מתאמן..."
            className="pr-10 bg-white"
          />
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-slate-500">טוען...</div>
        ) : filteredTrainees.length === 0 ? (
          <Card className="p-12 text-center bg-white">
            <p className="text-slate-500">לא נמצאו מתאמנים</p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {filteredTrainees.map((trainee) => {
              const activeCount = getActiveModulesCount(trainee);
              const modules = trainee.visible_modules || {};
              
              return (
                <Card key={trainee.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-slate-800">{trainee.full_name}</h3>
                        <p className="text-sm text-slate-500">{trainee.user_email}</p>
                        <div className="flex gap-2 mt-2">
                          {(modules.nutrition !== false) && (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                              🍽️ תזונה
                            </span>
                          )}
                          {(modules.water !== false) && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                              💧 מים
                            </span>
                          )}
                          {(modules.workouts !== false) && (
                            <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                              💪 אימונים
                            </span>
                          )}
                          {(modules.metrics !== false) && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded">
                              ⚖️ מדדים
                            </span>
                          )}
                        </div>
                      </div>
                      <Button
                        onClick={() => openSettings(trainee)}
                        variant="outline"
                        className="flex items-center gap-2"
                      >
                        <Settings className="w-4 h-4" />
                        ערוך
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {/* Settings Dialog */}
        <Dialog open={!!selectedTrainee} onOpenChange={() => setSelectedTrainee(null)}>
          <DialogContent dir="rtl">
            <DialogHeader>
              <DialogTitle>הגדרות פאנלים - {selectedTrainee?.full_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-slate-600">בחר אילו מודולים המתאמן יראה:</p>
              
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Utensils className="w-5 h-5 text-green-600" />
                    <div>
                      <p className="font-medium text-slate-700">תזונה</p>
                      <p className="text-xs text-slate-500">מעקב אחר ארוחות וקלוריות</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={moduleSettings.nutrition !== false}
                    onChange={(e) => setModuleSettings({...moduleSettings, nutrition: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Droplets className="w-5 h-5 text-blue-600" />
                    <div>
                      <p className="font-medium text-slate-700">מים</p>
                      <p className="text-xs text-slate-500">מעקב אחר שתיית מים</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={moduleSettings.water !== false}
                    onChange={(e) => setModuleSettings({...moduleSettings, water: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Dumbbell className="w-5 h-5 text-orange-600" />
                    <div>
                      <p className="font-medium text-slate-700">אימונים</p>
                      <p className="text-xs text-slate-500">תיעוד אימונים ותרגילים</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={moduleSettings.workouts !== false}
                    onChange={(e) => setModuleSettings({...moduleSettings, workouts: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-300"
                  />
                </label>

                <label className="flex items-center justify-between p-3 bg-slate-50 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-3">
                    <Scale className="w-5 h-5 text-purple-600" />
                    <div>
                      <p className="font-medium text-slate-700">מדדים</p>
                      <p className="text-xs text-slate-500">מעקב אחר משקל ומדדי גוף</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={moduleSettings.metrics !== false}
                    onChange={(e) => setModuleSettings({...moduleSettings, metrics: e.target.checked})}
                    className="w-5 h-5 rounded border-slate-300"
                  />
                </label>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-xs text-amber-800">
                  💡 מודולים שלא מסומנים לא יופיעו בתפריט התחתון של המתאמן
                </p>
              </div>

              <Button 
                onClick={handleSave}
                disabled={updateModulesMutation.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {updateModulesMutation.isPending ? 'שומר...' : 'שמור הגדרות'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}