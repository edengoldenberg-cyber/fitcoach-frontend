import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  ArrowRight, Utensils, Droplets, Dumbbell, Scale, Settings, Lock,
  MessageSquare, Target, TrendingUp, Calendar, Plus, Send, Sparkles, User, Mail
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, BarChart, Bar, Cell } from 'recharts';
import StatusBadge from '../components/shared/StatusBadge';
import ChatWithTrainee from '../components/coach/ChatWithTrainee';
import CoachAIAssistant from '../components/coach/CoachAIAssistant';
import WorkoutPerformanceAnalyzer from '../components/coach/WorkoutPerformanceAnalyzer';
import CoachMetricsView from '../components/coach/CoachMetricsView';
import ChangePasswordDialog from '../components/coach/ChangePasswordDialog';
import SetTraineePasswordDialog from '../components/coach/SetTraineePasswordDialog';
import ChangeEmailDialog from '../components/coach/ChangeEmailDialog';
import ResendInviteDialog from '../components/coach/ResendInviteDialog';
import PersonalAccessLinkManager from '../components/coach/PersonalAccessLinkManager';
import SimpleLoginLinkButton from '../components/coach/SimpleLoginLinkButton';
import TraineePersonalDetailsDialog from '../components/coach/TraineePersonalDetailsDialog';
import TraineeNotificationTimeline from '../components/coach/TraineeNotificationTimeline';

import { parseCoachRating, encodeCoachRating } from '@/utils/workoutUtils';

export default function TraineeProfile() {
  const [showTargetsDialog, setShowTargetsDialog] = useState(false);
  const [showNoteDialog, setShowNoteDialog] = useState(false);
  const [showChatDialog, setShowChatDialog] = useState(false);
  const [showRatingDialog, setShowRatingDialog] = useState(false);
  const [selectedWorkout, setSelectedWorkout] = useState(null);
  const [showAIAssistant, setShowAIAssistant] = useState(false);
  const [showChangePasswordDialog, setShowChangePasswordDialog] = useState(false);
  const [showSetPasswordDialog, setShowSetPasswordDialog] = useState(false);
  const [showChangeEmailDialog, setShowChangeEmailDialog] = useState(false);
  const [showResendInviteDialog, setShowResendInviteDialog] = useState(false);
  const [showModulesDialog, setShowModulesDialog] = useState(false);
  const [showPersonalDetailsDialog, setShowPersonalDetailsDialog] = useState(false);
  const [moduleSettings, setModuleSettings] = useState({});
  const [workoutRating, setWorkoutRating] = useState({ rating: 0, feedback: '' });
  const [newNote, setNewNote] = useState('');
  const [targets, setTargets] = useState({});
  
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const traineeEmail = urlParams.get('email');
  const today = format(new Date(), 'yyyy-MM-dd');
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', traineeEmail],
    queryFn: () => base44.entities.Trainee.filter({ user_email: traineeEmail }),
    enabled: !!traineeEmail,
    select: (data) => data[0],
  });

  const { data: meals = [] } = useQuery({
    queryKey: ['traineeMeals', traineeEmail],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const { data: waterEntries = [] } = useQuery({
    queryKey: ['traineeWater', traineeEmail],
    queryFn: () => base44.entities.WaterEntry.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ['traineeWorkouts', traineeEmail],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const { data: measurements = [] } = useQuery({
    queryKey: ['traineeMeasurements', traineeEmail],
    queryFn: () => base44.entities.BodyMeasurement.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const { data: notes = [] } = useQuery({
    queryKey: ['traineeNotes', traineeEmail],
    queryFn: () => base44.entities.CoachNote.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const { data: aiConsultations = [] } = useQuery({
    queryKey: ['aiConsultations', traineeEmail],
    queryFn: () => base44.entities.AIConsultation.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const updateTraineeMutation = useMutation({
    mutationFn: (data) => base44.entities.Trainee.update(trainee.id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainee'] });
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      setShowTargetsDialog(false);
      setShowModulesDialog(false);
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: (data) => base44.entities.CoachNote.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeNotes'] });
      setShowNoteDialog(false);
      setNewNote('');
    },
  });

  const rateWorkoutMutation = useMutation({
    mutationFn: ({ workoutId, rating, feedback }) =>
      base44.entities.WorkoutSession.update(workoutId, {
        notes: encodeCoachRating(rating, feedback),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
      setShowRatingDialog(false);
      setSelectedWorkout(null);
      setWorkoutRating({ rating: 0, feedback: '' });
    },
  });

  // Calculate weekly data
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  
  const weeklyCaloriesData = useMemo(() => {
    return weekDays.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayMeals = meals.filter(m => m.date === dayStr);
      return {
        day: format(day, 'EEE', { locale: he }),
        calories: dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0),
        target: trainee?.target_calories || 2000,
      };
    });
  }, [meals, weekDays, trainee]);

  const weeklyWaterData = useMemo(() => {
    return weekDays.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayWater = waterEntries.filter(w => w.date === dayStr);
      return {
        day: format(day, 'EEE', { locale: he }),
        water: dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0),
        target: trainee?.water_target_ml || 3000,
      };
    });
  }, [waterEntries, weekDays, trainee]);

  const weightData = useMemo(() => {
    return [...measurements]
      .sort((a, b) => new Date(a.date) - new Date(b.date))
      .slice(-14)
      .map(m => ({
        date: format(new Date(m.date), 'd/M'),
        weight: m.weight_kg,
      }));
  }, [measurements]);

  // Today stats
  const todayCalories = meals.filter(m => m.date === today).reduce((sum, m) => sum + (m.calories || 0), 0);
  const todayWater = waterEntries.filter(w => w.date === today).reduce((sum, w) => sum + (w.amount_ml || 0), 0);
  const todayWorkout = workouts.some(w => w.date === today);

  const targetCalories = trainee?.target_calories || 2000;
  const targetWater = trainee?.water_target_ml || 3000;

  const getOverallStatus = () => {
    const caloriesPct = (todayCalories / targetCalories) * 100;
    const waterPct = (todayWater / targetWater) * 100;
    const avg = (caloriesPct + waterPct + (todayWorkout ? 100 : 0)) / 3;
    if (avg >= 80) return 'good';
    if (avg >= 50) return 'partial';
    return 'bad';
  };

  const initials = trainee?.full_name?.split(' ').map(n => n[0]).join('') || '?';

  // Authorization guard: coaches may only view their own trainees; admins bypass.
  // Wait until BOTH currentUser and trainee are loaded before making the decision.
  const authReady = !!currentUser && (trainee !== undefined);
  const isAdmin = currentUser?.role === 'admin';
  const isOwner = currentUser?.email === trainee?.coach_email;
  if (authReady && trainee && !isAdmin && !isOwner) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50" dir="rtl">
        <div className="text-center p-8">
          <div className="text-5xl mb-4">🔒</div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">אין הרשאה</h2>
          <p className="text-slate-500 text-sm">פרופיל זה שייך למאמן אחר</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 pb-20" dir="rtl">
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to={createPageUrl('CoachDashboard')}>
            <Button variant="ghost" size="icon">
              <ArrowRight className="w-5 h-5" />
            </Button>
          </Link>
          <div className="flex items-center gap-4 flex-1">
            <Avatar className="w-16 h-16 border-2 border-white shadow-lg">
              <AvatarImage src={trainee?.profile_image} />
              <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white text-xl font-bold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{trainee?.full_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <StatusBadge status={getOverallStatus()} />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => setShowAIAssistant(true)}
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              className="flex items-center gap-1"
            >
              <Sparkles className="w-4 h-4" />
              AI
            </Button>
            <Button variant="outline" onClick={() => setShowChatDialog(true)}>
              <MessageSquare className="w-4 h-4 ml-1" />
              הודעה
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                const phone = trainee?.phone?.replace(/\D/g, '');
                const message = encodeURIComponent(`שלום ${trainee?.full_name}, ראיתי את הסיכום שלך. בוא נשפר ביחד! 💪`);
                window.open(`https://wa.me/${phone}?text=${message}`, '_blank');
              }}
              disabled={!trainee?.phone}
              className="bg-[#25D366] text-white hover:bg-[#20BA5A] border-0"
            >
              <Send className="w-4 h-4 ml-1" />
              WhatsApp
            </Button>
            <Button variant="outline" onClick={() => setShowNoteDialog(true)}>
              הערה
            </Button>
            <Button variant="outline" onClick={() => { 
              setTargets({
                target_calories: trainee?.target_calories || 2000,
                target_protein: trainee?.target_protein || 150,
                target_carbs: trainee?.target_carbs || 200,
                target_fat: trainee?.target_fat || 70,
                water_target_ml: trainee?.water_target_ml || 3000,
              });
              setShowTargetsDialog(true); 
            }}>
              <Target className="w-4 h-4 ml-1" />
              יעדים
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setModuleSettings(trainee?.visible_modules || {
                  nutrition: true,
                  water: true,
                  workouts: true,
                  metrics: true,
                });
                setShowModulesDialog(true);
              }}
              className="text-purple-600 hover:text-purple-700"
            >
              <Settings className="w-4 h-4 ml-1" />
              הגדרות גישה
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowSetPasswordDialog(true)}
              className="text-teal-600 hover:text-teal-700 border-teal-200"
            >
              <Lock className="w-4 h-4 ml-1" />
              הזמן / הגדר סיסמה
            </Button>
            <Button 
              variant="outline" 
              onClick={() => setShowChangeEmailDialog(true)}
              className="text-blue-600 hover:text-blue-700"
            >
              <Settings className="w-4 h-4 ml-1" />
              שינוי מייל
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPersonalDetailsDialog(true)}
              className="text-slate-700 hover:bg-slate-50"
            >
              <User className="w-4 h-4 ml-1" />
              ערוך פרטים אישיים
            </Button>
            {trainee && (
              <SimpleLoginLinkButton 
                trainee={trainee} 
                variant="outline" 
                size="default"
              />
            )}
            {!trainee?.first_login_at && (
              <Button 
                variant="outline" 
                onClick={() => setShowResendInviteDialog(true)}
                className="text-blue-600 hover:text-blue-700"
              >
                <Send className="w-4 h-4 ml-1" />
                שלח הזמנה
              </Button>
            )}
          </div>
        </div>



        {/* Today Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="p-3 sm:p-4 bg-emerald-50 border-emerald-200">
            <Utensils className="w-4 sm:w-5 h-4 sm:h-5 text-emerald-500 mb-2" />
            <p className="text-xl sm:text-2xl font-bold text-emerald-700">{todayCalories}</p>
            <p className="text-[10px] sm:text-xs text-emerald-600">קלוריות / {targetCalories}</p>
          </Card>
          <Card className="p-3 sm:p-4 bg-blue-50 border-blue-200">
            <Droplets className="w-4 sm:w-5 h-4 sm:h-5 text-blue-500 mb-2" />
            <p className="text-xl sm:text-2xl font-bold text-blue-700">{(todayWater/1000).toFixed(1)}L</p>
            <p className="text-[10px] sm:text-xs text-blue-600">מים / {targetWater/1000}L</p>
          </Card>
          <Card className="p-3 sm:p-4 bg-orange-50 border-orange-200">
            <Dumbbell className="w-4 sm:w-5 h-4 sm:h-5 text-orange-500 mb-2" />
            <p className="text-xl sm:text-2xl font-bold text-orange-700">{todayWorkout ? '✓' : '✗'}</p>
            <p className="text-[10px] sm:text-xs text-orange-600">אימון היום</p>
          </Card>
          <Card className="p-3 sm:p-4 bg-purple-50 border-purple-200">
            <Scale className="w-4 sm:w-5 h-4 sm:h-5 text-purple-500 mb-2" />
            <p className="text-xl sm:text-2xl font-bold text-purple-700">
              {measurements[measurements.length - 1]?.weight_kg || '—'}
            </p>
            <p className="text-[10px] sm:text-xs text-purple-600">משקל (ק״ג)</p>
          </Card>
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="bg-white border w-full justify-start overflow-x-auto flex-nowrap">
            <TabsTrigger value="overview" className="flex-shrink-0">סיכום</TabsTrigger>
            <TabsTrigger value="nutrition" className="flex-shrink-0">תזונה</TabsTrigger>
            <TabsTrigger value="workouts" className="flex-shrink-0">אימונים</TabsTrigger>
            <TabsTrigger value="metrics" className="flex-shrink-0">מדדים</TabsTrigger>
            <TabsTrigger value="ai" className="flex-shrink-0">AI</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-shrink-0">
              <Mail className="w-4 h-4 ml-1" />
              התראות
            </TabsTrigger>
            <TabsTrigger value="notes" className="flex-shrink-0">הערות</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <WorkoutPerformanceAnalyzer workouts={workouts} />
            {/* Weekly Calories */}
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">קלוריות שבועיות</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyCaloriesData}>
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis hide />
                    <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                      {weeklyCaloriesData.map((entry, i) => (
                        <Cell 
                          key={i} 
                          fill={entry.calories >= entry.target * 0.8 ? '#10B981' : entry.calories >= entry.target * 0.5 ? '#F59E0B' : '#EF4444'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* Weekly Water */}
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">שתיית מים שבועית</h3>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyWaterData}>
                    <XAxis dataKey="day" fontSize={12} />
                    <YAxis hide />
                    <Bar dataKey="water" radius={[4, 4, 0, 0]}>
                      {weeklyWaterData.map((entry, i) => (
                        <Cell 
                          key={i} 
                          fill={entry.water >= entry.target ? '#3B82F6' : entry.water >= entry.target * 0.5 ? '#93C5FD' : '#DBEAFE'} 
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-4">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">ארוחות אחרונות</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {meals.slice(-20).reverse().map(meal => (
                  <div key={meal.id} className="flex justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-700">{meal.food_name}</p>
                      <p className="text-xs text-slate-400">{meal.date} | {meal.meal_type}</p>
                    </div>
                    <span className="font-medium text-emerald-600">{meal.calories} קל׳</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="metrics" className="space-y-4">
            <CoachMetricsView traineeEmail={traineeEmail} />
          </TabsContent>

          <TabsContent value="measurements" className="space-y-4">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">גרף משקל</h3>
              {weightData.length < 2 ? (
                <p className="text-center py-8 text-slate-400">אין מספיק נתונים להצגת גרף</p>
              ) : (
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightData}>
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} domain={['auto', 'auto']} />
                      <Line type="monotone" dataKey="weight" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>

            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">מדידות אחרונות</h3>
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {measurements.slice(-10).reverse().map(m => (
                  <div key={m.id} className="p-3 bg-slate-50 rounded-lg">
                    <p className="font-medium text-slate-700 mb-1">{format(new Date(m.date), 'd/M/yyyy')}</p>
                    <div className="flex flex-wrap gap-3 text-sm">
                      {m.weight_kg && <span>משקל: {m.weight_kg}ק״ג</span>}
                      {m.body_fat_percent && <span>שומן: {m.body_fat_percent}%</span>}
                      {m.muscle_mass_kg && <span>שריר: {m.muscle_mass_kg}ק״ג</span>}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="ai" className="space-y-4">
            <Card className="p-4">
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5" style={{ color: '#79DBD6' }} />
                ייעוצי AI אחרונים
              </h3>
              {aiConsultations.length === 0 ? (
                <p className="text-center text-slate-500 py-8">המתאמן עדיין לא השתמש ב-AI Coach</p>
              ) : (
                <div className="space-y-3">
                  {aiConsultations.slice(0, 10).map(consultation => (
                    <Card key={consultation.id} className="p-3 bg-slate-50">
                      <div className="flex items-start justify-between mb-2">
                        <Badge className={
                          consultation.topic === 'nutrition' ? 'bg-green-100 text-green-800' :
                          consultation.topic === 'training' ? 'bg-blue-100 text-blue-800' :
                          'bg-slate-100 text-slate-800'
                        }>
                          {consultation.topic === 'nutrition' ? 'תזונה' :
                           consultation.topic === 'training' ? 'אימון' : 'כללי'}
                        </Badge>
                        <span className="text-xs text-slate-500">
                          {new Date(consultation.date).toLocaleDateString('he-IL')}
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <p className="text-xs text-slate-500">שאלה:</p>
                          <p className="text-sm text-slate-700">{consultation.user_question}</p>
                        </div>
                        {consultation.data_used && (
                          <div>
                            <p className="text-xs text-slate-500">נתונים ששימשו:</p>
                            <p className="text-xs text-slate-600">{consultation.data_used}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-slate-500">המלצת AI:</p>
                          <p className="text-sm text-slate-700">{consultation.ai_recommendation}</p>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-4">
            <TraineeNotificationTimeline trainee={trainee} />
          </TabsContent>

          <TabsContent value="workouts" className="space-y-4">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3">אימונים אחרונים</h3>
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {workouts.slice(0, 10).map(workout => (
                  <Card key={workout.id} className="p-3 bg-slate-50">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-medium text-slate-700">{workout.workout_name || 'אימון'}</p>
                        <p className="text-xs text-slate-500">{workout.date}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {workout.rpe && (
                          <Badge variant="outline" className={
                            workout.rpe >= 8 ? 'bg-red-100 text-red-700' :
                            workout.rpe >= 6 ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }>
                            RPE: {workout.rpe}
                          </Badge>
                        )}
                        {parseCoachRating(workout.notes).rating > 0 && (
                          <div className="flex gap-0.5">
                            {Array.from({length: 5}).map((_, i) => (
                              <span key={i} className={i < parseCoachRating(workout.notes).rating ? 'text-amber-500' : 'text-slate-300'}>
                                ★
                              </span>
                            ))}
                          </div>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => {
                            setSelectedWorkout(workout);
                            setWorkoutRating(parseCoachRating(workout.notes));
                            setShowRatingDialog(true);
                          }}
                        >
                          דרג
                        </Button>
                      </div>
                    </div>
                    
                    {workout.exercises?.length > 0 && (
                      <div className="space-y-2 text-sm">
                        {workout.exercises.map((ex, idx) => (
                          <div key={idx} className="border-r-2 border-slate-300 pr-2">
                            <p className="font-medium text-slate-600">{ex.exercise_name}</p>
                            {ex.sets?.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-1">
                                {ex.sets.map((set, setIdx) => (
                                  <span key={setIdx} className="text-xs bg-slate-100 px-2 py-1 rounded border border-slate-200">
                                    {set.weight}kg × {set.reps}
                                  </span>
                                ))}
                              </div>
                            )}
                            {ex.notes && (
                              <p className="text-xs text-amber-600 mt-1">💬 {ex.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {parseCoachRating(workout.notes).feedback && (
                      <div className="mt-2 pt-2 border-t text-xs bg-blue-50 p-2 rounded">
                        <p className="font-medium text-blue-900">משוב מאמן:</p>
                        <p className="text-blue-700">{parseCoachRating(workout.notes).feedback}</p>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="notes" className="space-y-4">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-slate-700">הערות מאמן</h3>
                <Button size="sm" onClick={() => setShowNoteDialog(true)}>
                  <Plus className="w-4 h-4 ml-1" />
                  הערה חדשה
                </Button>
              </div>
              
              {notes.length === 0 ? (
                <p className="text-center py-8 text-slate-400">אין הערות עדיין</p>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {notes.slice().reverse().map(note => (
                    <div key={note.id} className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-slate-700">{note.note}</p>
                      <p className="text-xs text-slate-400 mt-2">
                        {note.date ? format(new Date(note.date), 'd/M/yyyy') : format(new Date(note.created_date), 'd/M/yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Targets Dialog */}
      <Dialog open={showTargetsDialog} onOpenChange={setShowTargetsDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>עריכת יעדים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>יעד קלוריות יומי</Label>
              <Input
                type="number"
                value={targets.target_calories || ''}
                onChange={(e) => setTargets({...targets, target_calories: +e.target.value})}
              />
            </div>
            <div>
              <Label>יעד חלבון (גרם)</Label>
              <Input
                type="number"
                value={targets.target_protein || ''}
                onChange={(e) => setTargets({...targets, target_protein: +e.target.value})}
              />
            </div>
            <div>
              <Label>יעד פחמימות (גרם)</Label>
              <Input
                type="number"
                value={targets.target_carbs || ''}
                onChange={(e) => setTargets({...targets, target_carbs: +e.target.value})}
              />
            </div>
            <div>
              <Label>יעד שומן (גרם)</Label>
              <Input
                type="number"
                value={targets.target_fat || ''}
                onChange={(e) => setTargets({...targets, target_fat: +e.target.value})}
              />
            </div>
            <div>
              <Label>יעד שתיית מים (מ״ל)</Label>
              <Input
                type="number"
                value={targets.water_target_ml || ''}
                onChange={(e) => setTargets({...targets, water_target_ml: +e.target.value})}
              />
            </div>
            <Button onClick={() => updateTraineeMutation.mutate(targets)} className="w-full">
              שמור יעדים
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat Dialog */}
      <ChatWithTrainee
        open={showChatDialog}
        onClose={() => setShowChatDialog(false)}
        traineeEmail={traineeEmail}
        traineeName={trainee?.full_name}
        coachEmail={currentUser?.email}
      />

      {/* Workout Rating Dialog */}
      <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>דירוג איכות ביצוע</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>דירוג (1-5 כוכבים)</Label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map(star => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setWorkoutRating({...workoutRating, rating: star})}
                    className="text-3xl transition-colors"
                  >
                    <span className={star <= workoutRating.rating ? 'text-amber-500' : 'text-slate-300'}>
                      ★
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>משוב למתאמן (אופציונלי)</Label>
              <Textarea
                value={workoutRating.feedback}
                onChange={(e) => setWorkoutRating({...workoutRating, feedback: e.target.value})}
                placeholder="כתוב משוב על האימון..."
                rows={3}
              />
            </div>
            <Button 
              onClick={() => rateWorkoutMutation.mutate({
                workoutId: selectedWorkout?.id,
                rating: workoutRating.rating,
                feedback: workoutRating.feedback
              })}
              disabled={workoutRating.rating === 0}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              שמור דירוג
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNoteDialog} onOpenChange={setShowNoteDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הוסף הערה</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="כתוב הערה למתאמן..."
              rows={4}
            />
            <Button 
              onClick={() => addNoteMutation.mutate({
                trainee_email: traineeEmail,
                coach_email: currentUser?.email,
                note: newNote,
                date: today,
              })}
              disabled={!newNote.trim()}
              className="w-full"
            >
              שמור הערה
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* AI Assistant */}
      <CoachAIAssistant
        open={showAIAssistant}
        onClose={() => setShowAIAssistant(false)}
        trainee={trainee}
      />

      {/* Set Trainee Password / Invite Dialog (server-side bcrypt) */}
      {trainee && (
        <SetTraineePasswordDialog
          open={showSetPasswordDialog}
          onClose={() => setShowSetPasswordDialog(false)}
          trainee={trainee}
        />
      )}

      {/* Change Password Dialog (legacy — kept for backwards compat) */}
      {trainee && (
        <ChangePasswordDialog
          open={showChangePasswordDialog}
          onClose={() => setShowChangePasswordDialog(false)}
          trainee={trainee}
        />
      )}

      {/* Change Email Dialog */}
      {trainee && (
        <ChangeEmailDialog
          open={showChangeEmailDialog}
          onClose={() => setShowChangeEmailDialog(false)}
          trainee={trainee}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['trainee'] });
            queryClient.invalidateQueries({ queryKey: ['traineeMeals'] });
            queryClient.invalidateQueries({ queryKey: ['traineeWater'] });
            queryClient.invalidateQueries({ queryKey: ['traineeWorkouts'] });
          }}
        />
      )}

      {/* Resend Invite Dialog */}
      {trainee && (
        <ResendInviteDialog
          open={showResendInviteDialog}
          onClose={() => setShowResendInviteDialog(false)}
          trainee={trainee}
        />
      )}

      {/* Personal Details Dialog */}
      {trainee && (
        <TraineePersonalDetailsDialog
          open={showPersonalDetailsDialog}
          onClose={() => setShowPersonalDetailsDialog(false)}
          trainee={trainee}
          onSaved={() => queryClient.invalidateQueries({ queryKey: ['trainee', traineeEmail] })}
        />
      )}

      {/* Modules Access Dialog */}
      <Dialog open={showModulesDialog} onOpenChange={setShowModulesDialog}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>הגדרות גישה למודולים</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">בחר אילו מודולים המתאמן יראה באפליקציה:</p>
            
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
              onClick={() => {
                updateTraineeMutation.mutate({ visible_modules: moduleSettings });
                setShowModulesDialog(false);
              }}
              className="w-full"
              style={{ backgroundColor: '#79DBD6' }}
            >
              שמור הגדרות
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}