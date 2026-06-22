import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Search, Users, UserPlus, Trash2, CheckSquare, Square, X,
  Utensils, Droplets, Dumbbell, Scale, MessageSquare,
  Target, TrendingUp, Sparkles, Send, Plus, Settings, ChevronLeft,
  BookOpen, Calendar, Brain, Bell, BellOff, Eye, RotateCcw, UserX, Lock, ArrowRight
} from "lucide-react";
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { toast } from 'sonner';
import { format, startOfWeek, endOfWeek, eachDayOfInterval } from 'date-fns';
import { he } from 'date-fns/locale/he';
import { getIsraelDateString, nutritionRecordMatchesTrainee, metricRecordMatchesTrainee, invalidateCoachTraineeSyncQueries, localDateInRange } from '@/utils/nutritionSync';
import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, LineChart, Line } from 'recharts';
import SendLoginLinkButton from '../components/coach/SendLoginLinkButton';
import ChatWithTrainee from '../components/coach/ChatWithTrainee';
import CoachAIAssistant from '../components/coach/CoachAIAssistant';
import CoachMetricsView from '../components/coach/CoachMetricsView';
import WorkoutPerformanceAnalyzer from '../components/coach/WorkoutPerformanceAnalyzer';
import ResendInviteDialog from '../components/coach/ResendInviteDialog';
import TraineeNotificationsTab from '../components/coach/TraineeNotificationsTab';
import TraineeLearningInsights from '../components/coach/TraineeLearningInsights';
import TraineePersonalDetailsDialog from '../components/coach/TraineePersonalDetailsDialog';
import TraineePanelVisibilityDialog from '../components/coach/TraineePanelVisibilityDialog';
import SetTraineePasswordDialog from '../components/coach/SetTraineePasswordDialog';

// ─── helpers ───────────────────────────────────────────────────────────────
function getStatusBadge(pct) {
  if (pct >= 80) return { label: 'מצוין', cls: 'bg-emerald-100 text-emerald-700' };
  if (pct >= 50) return { label: 'חלקי', cls: 'bg-amber-100 text-amber-700' };
  return { label: 'חסר', cls: 'bg-red-100 text-red-700' };
}

// ─── MiniCard (in list) ─────────────────────────────────────────────────────
const DAY_LABELS_SHORT = { sunday: 'א', monday: 'ב', tuesday: 'ג', wednesday: 'ד', thursday: 'ה', friday: 'ו', saturday: 'ש' };

function TraineeMiniCard({ trainee, stats, selected, selectMode, onSelect, onDelete, onClick, notifStatus, coachEmail, firstMealDate, meals = [], workouts = [] }) {
  const initials = trainee.full_name?.split(' ').map(n => n[0]).join('') || '?';
  const avg = Math.round(((stats?.nutrition || 0) + (stats?.water || 0) + (stats?.workout || 0)) / 3);
  const badge = getStatusBadge(avg);
  const remindersOn = notifStatus?.remindersOn ?? true;
  const mutedDays = notifStatus?.mutedDays || [];
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const queryClient = useQueryClient();

  const resetOnboardingMutation = useMutation({
    mutationFn: async () => {
      await base44.entities.Trainee.update(trainee.id, {
        onboarding_status: 'pending',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
    },
  });

  // Calculate days until next weigh-in
  let daysUntilWeighIn = null;
  if (firstMealDate) {
    const first = new Date(firstMealDate);
    const now = new Date();
    const daysSinceFirst = (now - first) / (1000 * 60 * 60 * 24);
    const weeksElapsed = Math.floor(daysSinceFirst / 7);
    const nextWeighInWeek = (weeksElapsed + 1) * 3; // next cycle (3, 6, 9...)
    const nextWeighInDate = new Date(first.getTime() + nextWeighInWeek * 7 * 24 * 60 * 60 * 1000);
    daysUntilWeighIn = Math.ceil((nextWeighInDate - now) / (1000 * 60 * 60 * 24));
  }

  const handleSendWelcome = async (e) => {
    e.stopPropagation();
    if (!trainee.phone) { toast.error('אין מספר טלפון למתאמן'); return; }
    setSending(true);
    try {
      await base44.functions.invoke('onTraineeCreated', {
        event: { type: 'create' },
        data: trainee,
        entity_id: trainee.id,
      });
      setSent(true);
      toast.success(`הודעת פתיחה נשלחה ל-${trainee.full_name}`);
      setTimeout(() => setSent(false), 5000);
    } catch (err) {
      toast.error('שגיאה בשליחת ההודעה');
    }
    setSending(false);
  };

  return (
    <Card className={`border transition-all cursor-pointer ${selected ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white hover:border-teal-300'}`}>
      <div className="flex items-center gap-3 p-3" onClick={selectMode ? onSelect : onClick}>
        {selectMode && (
          <button onClick={e => { e.stopPropagation(); onSelect(); }} className="flex-shrink-0 p-1 min-h-0 min-w-0">
            {selected ? <CheckSquare className="w-5 h-5 text-red-500" /> : <Square className="w-5 h-5 text-slate-300" />}
          </button>
        )}
        <Avatar className="w-11 h-11 border-2 border-slate-100 flex-shrink-0">
          <AvatarImage src={trainee.profile_image} />
          <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white font-bold text-sm">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-bold text-slate-800 truncate text-sm">{trainee.full_name}</span>
            <Badge className={`${badge.cls} text-[10px] px-1.5 py-0`}>{badge.label}</Badge>
            {daysUntilWeighIn !== null && (
              <Badge className={`text-[10px] px-1.5 py-0 ${daysUntilWeighIn <= 2 ? 'bg-red-100 text-red-700' : daysUntilWeighIn <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                ⚖️ {daysUntilWeighIn} ימים
              </Badge>
            )}
            {/* notif status indicator */}
            {!remindersOn ? (
              <span title="תזכורות כבויות" className="flex items-center gap-0.5 text-[10px] text-red-400 font-medium">
                <BellOff className="w-3 h-3" />כבוי
              </span>
            ) : mutedDays.length > 0 ? (
              <span title={`מושתק: ${mutedDays.map(d => DAY_LABELS_SHORT[d]).join(',')}`} className="flex items-center gap-0.5 text-[10px] text-amber-500 font-medium">
                <BellOff className="w-3 h-3" />{mutedDays.map(d => DAY_LABELS_SHORT[d]).join(',')}
              </span>
            ) : (
              <Bell className="w-3 h-3 text-teal-400" title="תזכורות פעילות" />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Utensils className="w-3 h-3 text-emerald-500" />
            <span>{stats?.mealsCount || 0} ארוחות · {stats?.calories || 0}/{stats?.targetCalories || 0} קל׳</span>
            <span>·</span>
            <span>חל׳ {stats?.protein || 0}g</span>
            <Dumbbell className={`w-3 h-3 mr-auto ${stats?.workout ? 'text-orange-500' : 'text-slate-300'}`} />
          </div>
        </div>
        {!selectMode && <ChevronLeft className="w-4 h-4 text-slate-300 flex-shrink-0" />}
      </div>
      {!selectMode && (
        <div className="px-3 pb-3 space-y-3" onClick={e => e.stopPropagation()}>
          <TraineeLearningInsights trainee={trainee} meals={meals} workouts={workouts} />
          <div className="flex gap-2 items-center">
            <div className="flex-1">
              <SendLoginLinkButton trainee={trainee} variant="outline" size="sm" showStatus={true} />
            </div>
            <button
              onClick={handleSendWelcome}
              disabled={sending}
              title="שלח הודעת פתיחה בוואטסאפ"
              className={`min-h-0 min-w-0 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs font-medium border
                ${sent ? 'bg-green-50 text-green-600 border-green-200' : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'}`}>
              {sending ? (
                <span className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin inline-block" />
              ) : sent ? (
                <span>✓</span>
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {!sending && <span>{sent ? 'נשלח' : 'פתיחה'}</span>}
            </button>
            <button
              onClick={e => { 
                e.stopPropagation(); 
                resetOnboardingMutation.mutate();
              }}
              className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 transition-colors"
              title="התחל הדרכה מחדש"
              disabled={resetOnboardingMutation.isPending}
            >
              <BookOpen className="w-4 h-4" />
            </button>
            {onDelete && (
              <button onClick={e => { e.stopPropagation(); onDelete(trainee.id); }}
                className="min-h-0 min-w-0 p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="מחק מתאמן">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── TraineeDetail (full panel) ─────────────────────────────────────────────
function TraineeDetail({ trainee, onBack, currentUser }) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showTargets, setShowTargets] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showResend, setShowResend] = useState(false);
  const [showPersonalDetails, setShowPersonalDetails] = useState(false);
  const [showPanelVisibility, setShowPanelVisibility] = useState(false);
  const [showSetPassword, setShowSetPassword] = useState(false);
  const [targets, setTargets] = useState({});
  const [newNote, setNewNote] = useState('');

  const email = trainee.user_email;
  const today = getIsraelDateString();
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 0 });
  const weekEnd = endOfWeek(new Date(), { weekStartsOn: 0 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const { data: meals = [] } = useQuery({
    queryKey: ['tm-meals', trainee.id],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: email }, '-created_date', 500),
    enabled: !!email,
  });
  const { data: water = [] } = useQuery({
    queryKey: ['tm-water', trainee.id],
    queryFn: () => base44.entities.WaterEntry.filter({ trainee_email: email }, '-created_date', 500),
    enabled: !!email,
  });
  const { data: workouts = [] } = useQuery({
    queryKey: ['tm-workouts', email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: measurements = [] } = useQuery({
    queryKey: ['tm-measurements', trainee.id],
    queryFn: () => base44.entities.MetricsEntry.filter({ trainee_email: email }, '-date', 100),
    enabled: !!email,
  });
  const { data: notes = [] } = useQuery({
    queryKey: ['tm-notes', email],
    queryFn: () => base44.entities.CoachNote.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: aiConsultations = [] } = useQuery({
    queryKey: ['tm-ai', email],
    queryFn: () => base44.entities.AIConsultation.filter({ trainee_email: email }),
    enabled: !!email,
  });
  const { data: mealPlan } = useQuery({
    queryKey: ['tm-mealplan', trainee.id],
    queryFn: async () => {
      const plans = await base44.entities.PersonalMealPlan.filter({ trainee_id: trainee.id, is_active: true });
      return plans[0] || null;
    },
    enabled: !!trainee.id,
  });

  const updateMutation = useMutation({
    mutationFn: (data) => base44.entities.Trainee.update(trainee.id, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['trainees'] }); invalidateCoachTraineeSyncQueries(queryClient); setShowTargets(false); },
  });
  const addNoteMutation = useMutation({
    mutationFn: (data) => base44.entities.CoachNote.create(data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tm-notes'] }); setShowNote(false); setNewNote(''); toast.success('הערה נשמרה'); },
  });

  const todayCalories = meals.filter(m => m.date === today).reduce((s, m) => s + (m.calories || 0), 0);
  const todayWater = water.filter(w => w.date === today).reduce((s, w) => s + (w.amount_ml || 0), 0);
  const todayWorkout = workouts.some(w => w.date === today);
  const lastWeight = measurements.sort((a, b) => new Date(b.date) - new Date(a.date))[0]?.weight_kg;

  const weeklyCaloriesData = weekDays.map(day => {
    const d = getIsraelDateString(day);
    return {
      day: format(day, 'EEE', { locale: he }),
      calories: meals.filter(m => m.date === d).reduce((s, m) => s + (m.calories || 0), 0),
      target: trainee.target_calories || 2000,
    };
  });
  const weeklyWaterData = weekDays.map(day => {
    const d = getIsraelDateString(day);
    return {
      day: format(day, 'EEE', { locale: he }),
      water: water.filter(w => w.date === d).reduce((s, w) => s + (w.amount_ml || 0), 0),
      target: trainee.water_target_ml || 3000,
    };
  });
  const weightData = [...measurements]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-14)
    .map(m => ({ date: m.date?.slice(5)?.replace('-', '/'), weight: m.weight_kg }));

  const initials = trainee.full_name?.split(' ').map(n => n[0]).join('') || '?';

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-full hover:bg-slate-100 min-h-0 min-w-0">
            <ArrowRight className="w-5 h-5 text-slate-600" />
          </button>
          <Avatar className="w-10 h-10 border-2 border-white shadow flex-shrink-0">
            <AvatarImage src={trainee.profile_image} />
            <AvatarFallback className="bg-gradient-to-br from-emerald-400 to-blue-500 text-white font-bold text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-slate-800 text-base truncate">{trainee.full_name}</h2>
            <p className="text-xs text-slate-500 truncate">{trainee.user_email}</p>
          </div>
          <div className="flex gap-1.5 overflow-x-auto flex-nowrap">
            <Button size="sm" onClick={() => setShowAI(true)}
              className="gap-1 text-white text-xs h-8 px-2.5 flex-shrink-0" style={{ backgroundColor: '#79DBD6' }}>
              <Sparkles className="w-3.5 h-3.5" />AI
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowChat(true)} className="h-8 px-2.5 gap-1 text-xs flex-shrink-0">
              <MessageSquare className="w-3.5 h-3.5" />צ׳אט
            </Button>
            {trainee.phone && (
              <Button size="sm" variant="outline"
                onClick={() => window.open(`https://wa.me/${trainee.phone.replace(/\D/g,'')}?text=${encodeURIComponent(`שלום ${trainee.full_name} 💪`)}`, '_blank')}
                className="h-8 px-2.5 bg-[#25D366] text-white border-0 hover:bg-[#20BA5A] text-xs gap-1 flex-shrink-0">
                <Send className="w-3.5 h-3.5" />WA
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowPersonalDetails(true)} className="h-8 px-2.5 gap-1 text-xs flex-shrink-0">
              <Settings className="w-3.5 h-3.5" />ערוך
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        {/* Today Stats */}
        <div className="grid grid-cols-4 gap-2">
          <Card className="p-3 bg-emerald-50 border-emerald-100 text-center">
            <Utensils className="w-4 h-4 text-emerald-500 mx-auto mb-1" />
            <p className="text-base font-bold text-emerald-700">{todayCalories}</p>
            <p className="text-[10px] text-emerald-600">/{trainee.target_calories || 2000} קל׳</p>
          </Card>
          <Card className="p-3 bg-blue-50 border-blue-100 text-center">
            <Droplets className="w-4 h-4 text-blue-500 mx-auto mb-1" />
            <p className="text-base font-bold text-blue-700">{(todayWater / 1000).toFixed(1)}L</p>
            <p className="text-[10px] text-blue-600">/{(trainee.water_target_ml || 3000) / 1000}L</p>
          </Card>
          <Card className="p-3 bg-orange-50 border-orange-100 text-center">
            <Dumbbell className="w-4 h-4 text-orange-500 mx-auto mb-1" />
            <p className="text-base font-bold text-orange-700">{todayWorkout ? '✓' : '✗'}</p>
            <p className="text-[10px] text-orange-600">אימון</p>
          </Card>
          <Card className="p-3 bg-purple-50 border-purple-100 text-center">
            <Scale className="w-4 h-4 text-purple-500 mx-auto mb-1" />
            <p className="text-base font-bold text-purple-700">{lastWeight || '—'}</p>
            <p className="text-[10px] text-purple-600">ק״ג</p>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
            onClick={() => setShowPanelVisibility(true)}>
            <Eye className="w-3.5 h-3.5" />פאנלים
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1"
            onClick={() => { setTargets({ target_calories: trainee.target_calories || 2000, target_protein: trainee.target_protein || 150, target_carbs: trainee.target_carbs || 200, target_fat: trainee.target_fat || 70, water_target_ml: trainee.water_target_ml || 3000 }); setShowTargets(true); }}>
            <Target className="w-3.5 h-3.5" />יעדים
          </Button>
          <Button size="sm" variant="outline" className="text-xs h-8 gap-1" onClick={() => setShowNote(true)}>
            <Plus className="w-3.5 h-3.5" />הערה
          </Button>
          {!trainee.first_login_at && (
            <Button size="sm" variant="outline" className="text-xs h-8 gap-1 text-blue-600" onClick={() => setShowResend(true)}>
              <Send className="w-3.5 h-3.5" />שלח הזמנה
            </Button>
          )}
          <Button size="sm" variant="outline"
            className="text-xs h-8 gap-1 text-teal-600 border-teal-200 hover:bg-teal-50"
            onClick={() => setShowSetPassword(true)}>
            <Lock className="w-3.5 h-3.5" />הגדר סיסמה / הזמן
          </Button>
          <div className="flex-shrink-0">
            <SendLoginLinkButton trainee={trainee} variant="outline" size="sm" />
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="bg-white border w-full justify-start overflow-x-auto flex-nowrap h-9 mb-1">
            <TabsTrigger value="overview" className="flex-shrink-0 text-xs h-7">סיכום</TabsTrigger>
            <TabsTrigger value="nutrition" className="flex-shrink-0 text-xs h-7">תזונה</TabsTrigger>
            <TabsTrigger value="mealplan" className="flex-shrink-0 text-xs h-7">תפריט</TabsTrigger>
            <TabsTrigger value="workouts" className="flex-shrink-0 text-xs h-7">אימונים</TabsTrigger>
            <TabsTrigger value="metrics" className="flex-shrink-0 text-xs h-7">מדדים</TabsTrigger>
            <TabsTrigger value="ai" className="flex-shrink-0 text-xs h-7">AI</TabsTrigger>
            <TabsTrigger value="notes" className="flex-shrink-0 text-xs h-7">הערות</TabsTrigger>
            <TabsTrigger value="notifications" className="flex-shrink-0 text-xs h-7">🔔 התראות</TabsTrigger>
          </TabsList>

          {/* OVERVIEW */}
          <TabsContent value="overview" className="space-y-3 mt-3">
            <WorkoutPerformanceAnalyzer workouts={workouts} />
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">קלוריות שבועיות</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyCaloriesData}>
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis hide />
                    <Bar dataKey="calories" radius={[4, 4, 0, 0]}>
                      {weeklyCaloriesData.map((e, i) => (
                        <Cell key={i} fill={e.calories >= e.target * 0.8 ? '#10B981' : e.calories >= e.target * 0.5 ? '#F59E0B' : '#EF4444'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">שתיית מים שבועית</h3>
              <div className="h-36">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyWaterData}>
                    <XAxis dataKey="day" fontSize={11} />
                    <YAxis hide />
                    <Bar dataKey="water" radius={[4, 4, 0, 0]}>
                      {weeklyWaterData.map((e, i) => (
                        <Cell key={i} fill={e.water >= e.target ? '#3B82F6' : e.water >= e.target * 0.5 ? '#93C5FD' : '#DBEAFE'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </TabsContent>

          {/* NUTRITION */}
          <TabsContent value="nutrition" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">ארוחות אחרונות</h3>
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {meals.length === 0 && <p className="text-center text-slate-400 py-8">אין ארוחות מתועדות</p>}
                {meals.slice(-30).reverse().map(meal => (
                  <div key={meal.id} className="flex justify-between p-3 bg-slate-50 rounded-lg">
                    <div>
                      <p className="font-medium text-slate-700 text-sm">{meal.food_name}</p>
                      <p className="text-xs text-slate-400">{meal.date} | {meal.meal_type}</p>
                      <div className="flex gap-2 text-xs text-slate-500 mt-0.5">
                        {meal.protein > 0 && <span>חל׳ {Math.round(meal.protein)}g</span>}
                        {meal.carbs > 0 && <span>פח׳ {Math.round(meal.carbs)}g</span>}
                        {meal.fat > 0 && <span>שומן {Math.round(meal.fat)}g</span>}
                      </div>
                    </div>
                    <span className="font-bold text-emerald-600 text-sm">{meal.calories} קל׳</span>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* MEAL PLAN */}
          <TabsContent value="mealplan" className="mt-3 space-y-3">
            {!mealPlan ? (
              <Card className="p-6 text-center border-dashed border-2 border-slate-200">
                <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium mb-1">אין תפריט אישי פעיל</p>
                <p className="text-xs text-slate-400 mb-3">המתאמן עדיין לא בנה תפריט אישי</p>
              </Card>
            ) : (
              <Card className="p-4 bg-white border-0 shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-700 text-sm">תפריט: {mealPlan.plan_name || 'תפריט אישי'}</h3>
                  <Badge className="bg-teal-100 text-teal-700 text-[10px]">{mealPlan.is_weekly ? 'שבועי' : 'יומי'}</Badge>
                </div>
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <div className="text-center p-2 bg-slate-50 rounded-lg">
                    <p className="text-sm font-bold text-slate-800">{Math.round(mealPlan.daily_calories || 0)}</p>
                    <p className="text-[10px] text-slate-500">קל׳</p>
                  </div>
                  <div className="text-center p-2 bg-blue-50 rounded-lg">
                    <p className="text-sm font-bold text-blue-700">{Math.round(mealPlan.daily_protein || 0)}g</p>
                    <p className="text-[10px] text-blue-500">חל׳</p>
                  </div>
                  <div className="text-center p-2 bg-amber-50 rounded-lg">
                    <p className="text-sm font-bold text-amber-700">{Math.round(mealPlan.daily_carbs || 0)}g</p>
                    <p className="text-[10px] text-amber-500">פח׳</p>
                  </div>
                  <div className="text-center p-2 bg-green-50 rounded-lg">
                    <p className="text-sm font-bold text-green-700">{Math.round(mealPlan.daily_fat || 0)}g</p>
                    <p className="text-[10px] text-green-500">שומן</p>
                  </div>
                </div>
                {mealPlan.ai_notes && (
                  <div className="bg-teal-50 rounded-xl p-3 border border-teal-100 mb-3">
                    <p className="text-xs font-bold text-teal-700 mb-1">💡 המלצות AI</p>
                    <p className="text-xs text-slate-700 leading-relaxed">{mealPlan.ai_notes}</p>
                  </div>
                )}
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {(mealPlan.is_weekly ? mealPlan.weekly_days?.[0]?.meals : mealPlan.meals)?.map((meal, idx) => (
                    <div key={idx} className="p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-slate-700 text-sm">{meal.meal_name}</span>
                        <span className="text-xs text-slate-500">{Math.round(meal.meal_calories)} קל׳</span>
                      </div>
                      <div className="flex gap-3 text-xs text-slate-500">
                        <span>חל׳ {Math.round(meal.meal_protein || 0)}g</span>
                        <span>פח׳ {Math.round(meal.meal_carbs || 0)}g</span>
                        <span>שומן {Math.round(meal.meal_fat || 0)}g</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* WORKOUTS */}
          <TabsContent value="workouts" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <h3 className="font-medium text-slate-700 mb-3 text-sm">אימונים אחרונים</h3>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                {workouts.length === 0 && <p className="text-center text-slate-400 py-8">אין אימונים מתועדים</p>}
                {workouts.slice(0, 15).map(w => (
                  <Card key={w.id} className="p-3 bg-slate-50">
                    <div className="flex justify-between items-start mb-1">
                      <p className="font-medium text-slate-700 text-sm">{w.workout_name || 'אימון'}</p>
                      <span className="text-xs text-slate-500">{w.date}</span>
                    </div>
                    {w.exercises?.length > 0 && (
                      <div className="space-y-1.5 mt-2">
                        {w.exercises.slice(0, 3).map((ex, i) => (
                          <div key={i} className="border-r-2 border-teal-300 pr-2">
                            <p className="text-xs font-medium text-slate-600">{ex.exercise_name}</p>
                            {ex.sets?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-0.5">
                                {ex.sets?.map((s, si) => (
                                  <span key={si} className="text-[10px] bg-white px-1.5 py-0.5 rounded border border-slate-200">{s.weight}kg×{s.reps}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {w.exercises.length > 3 && <p className="text-xs text-slate-400">+{w.exercises.length - 3} תרגילים נוספים</p>}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* METRICS */}
          <TabsContent value="metrics" className="mt-3 space-y-3">
            <CoachMetricsView traineeEmail={email} trainee={trainee} />
            {weightData.length >= 2 && (
              <Card className="p-4 bg-white border-0 shadow-sm">
                <h3 className="font-medium text-slate-700 mb-3 text-sm">גרף משקל</h3>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={weightData}>
                      <XAxis dataKey="date" fontSize={10} />
                      <YAxis fontSize={10} domain={['auto', 'auto']} />
                      <Line type="monotone" dataKey="weight" stroke="#8B5CF6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}
          </TabsContent>

          {/* AI */}
          <TabsContent value="ai" className="mt-3 space-y-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm">
                  <Brain className="w-4 h-4" style={{ color: '#79DBD6' }} />ייעוצי AI
                </h3>
                <Button size="sm" onClick={() => setShowAI(true)} className="text-white h-8 px-3 text-xs gap-1" style={{ backgroundColor: '#79DBD6' }}>
                  <Sparkles className="w-3.5 h-3.5" />פתח AI
                </Button>
              </div>
              {aiConsultations.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">המתאמן עדיין לא השתמש ב-AI Coach</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {aiConsultations.slice(0, 15).map(c => (
                    <Card key={c.id} className="p-3 bg-slate-50">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className={c.topic === 'nutrition' ? 'bg-green-100 text-green-800 text-[10px]' : c.topic === 'training' ? 'bg-blue-100 text-blue-800 text-[10px]' : 'bg-slate-100 text-slate-800 text-[10px]'}>
                          {c.topic === 'nutrition' ? 'תזונה' : c.topic === 'training' ? 'אימון' : 'כללי'}
                        </Badge>
                        <span className="text-xs text-slate-500">{new Date(c.date).toLocaleDateString('he-IL')}</span>
                      </div>
                      <p className="text-xs text-slate-500 mb-0.5">שאלה:</p>
                      <p className="text-sm text-slate-700 mb-2">{c.user_question}</p>
                      <p className="text-xs text-slate-500 mb-0.5">המלצה:</p>
                      <p className="text-sm text-slate-700">{c.ai_recommendation}</p>
                    </Card>
                  ))}
                </div>
              )}
            </Card>
          </TabsContent>

          {/* NOTIFICATIONS */}
          <TabsContent value="notifications">
            <TraineeNotificationsTab trainee={trainee} />
          </TabsContent>

          {/* NOTES */}
          <TabsContent value="notes" className="mt-3">
            <Card className="p-4 bg-white border-0 shadow-sm">
              <div className="flex justify-between items-center mb-3">
                <h3 className="font-medium text-slate-700 text-sm">הערות מאמן</h3>
                <Button size="sm" onClick={() => setShowNote(true)} className="h-8 text-xs gap-1">
                  <Plus className="w-3.5 h-3.5" />הערה
                </Button>
              </div>
              {notes.length === 0 ? (
                <p className="text-center py-8 text-slate-400 text-sm">אין הערות עדיין</p>
              ) : (
                <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                  {notes.slice().reverse().map(n => (
                    <div key={n.id} className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                      <p className="text-slate-700 text-sm">{n.note}</p>
                      <p className="text-xs text-slate-400 mt-1">
                        {n.date ? format(new Date(n.date), 'd/M/yyyy') : format(new Date(n.created_date), 'd/M/yyyy')}
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
      <Dialog open={showTargets} onOpenChange={setShowTargets}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>עריכת יעדים</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {[
              { key: 'target_calories', label: 'קלוריות יומי' },
              { key: 'target_protein', label: 'חלבון (גרם)' },
              { key: 'target_carbs', label: 'פחמימות (גרם)' },
              { key: 'target_fat', label: 'שומן (גרם)' },
              { key: 'water_target_ml', label: 'מים (מ״ל)' },
            ].map(({ key, label }) => (
              <div key={key}>
                <Label className="text-sm">{label}</Label>
                <Input type="number" value={targets[key] || ''} onChange={e => setTargets({ ...targets, [key]: +e.target.value })} />
              </div>
            ))}
            <Button onClick={() => updateMutation.mutate(targets)} className="w-full" style={{ backgroundColor: '#79DBD6' }}>שמור יעדים</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Note Dialog */}
      <Dialog open={showNote} onOpenChange={setShowNote}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>הוסף הערה</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <Textarea value={newNote} onChange={e => setNewNote(e.target.value)} placeholder="כתוב הערה למתאמן..." rows={4} />
            <Button onClick={() => addNoteMutation.mutate({ trainee_email: email, coach_email: currentUser?.email, note: newNote, date: today })}
              disabled={!newNote.trim()} className="w-full">שמור הערה</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Chat */}
      <ChatWithTrainee open={showChat} onClose={() => setShowChat(false)} traineeEmail={email} traineeName={trainee.full_name} coachEmail={currentUser?.email} />

      {/* AI Assistant */}
      <CoachAIAssistant open={showAI} onClose={() => setShowAI(false)} trainee={trainee} />

      {/* Resend Invite */}
      <ResendInviteDialog open={showResend} onClose={() => setShowResend(false)} trainee={trainee} />

      {/* Personal Details */}
      <TraineePersonalDetailsDialog
        open={showPersonalDetails}
        onClose={() => setShowPersonalDetails(false)}
        trainee={trainee}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['trainees'] })}
      />

      {/* Panel Visibility */}
      <TraineePanelVisibilityDialog
        open={showPanelVisibility}
        onClose={() => setShowPanelVisibility(false)}
        trainee={trainee}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['trainees'] })}
      />

      <SetTraineePasswordDialog
        open={showSetPassword}
        onClose={() => setShowSetPassword(false)}
        trainee={trainee}
      />
    </div>
  );
}

// ─── Main Coach Dashboard ────────────────────────────────────────────────────
export default function CoachDashboard() {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedTrainee, setSelectedTrainee] = useState(null);
  const today = getIsraelDateString();
  const recentStart = getIsraelDateString(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000));
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
    retry: 3,
    retryDelay: 1000,
    staleTime: 60_000,
  });
  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: async () => {
      const records = await base44.entities.Trainee.filter({ coach_email: user?.email });
      return records.filter(t => !['deleted', 'inactive'].includes(t.status));
    },
    enabled: !!user?.email,
    // Preserve the last known trainee list on any refetch failure (network hiccup, token refresh).
    // Without this, a transient 401 or network error clears data to undefined → trainees = [] → shows 0.
    placeholderData: (previousData) => previousData,
    retry: 2,
    staleTime: 30_000,
  });
  // Load ALL trainees for this coach, including deleted/inactive — for restore tab.
  // Uses a coach_email filter instead of global list() to avoid full-table scan.
  const { data: allTraineesIncDeleted = [] } = useQuery({
    queryKey: ['allTraineesDeleted', user?.email],
    queryFn: () => base44.entities.Trainee.filter({
      coach_email: user?.email,
    }, '-updated_date', 100).then(all => all.filter(t => ['deleted', 'inactive'].includes(t.status))),
    enabled: !!user?.email,
  });

  // Derive the list of trainee emails once trainees are loaded.
  // Used as the shared filter for all activity queries below.
  const traineeEmails = trainees.map(t => t.user_email).filter(Boolean);

  // Meals for the recent date range — one parallel query per trainee, then merged.
  // Replaces a single global list(3000) that scanned all coaches' data.
  const { data: allMeals = [] } = useQuery({
    queryKey: ['allMeals', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.MealEntry.filter({ trainee_email: email }, '-created_date', 150).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  // First-ever meal per trainee — sort ascending, limit 1 per trainee.
  // Replaces list(2000) that incorrectly sorted descending (would never find the oldest meal).
  const { data: allMealsEver = [] } = useQuery({
    queryKey: ['allMealsEver', traineeEmails.join(',')],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.MealEntry.filter({ trainee_email: email }, 'created_date', 1).catch(() => [])
        )
      );
      return perTrainee.flat();
    },
    enabled: traineeEmails.length > 0,
  });

  // Water for the recent date range — one parallel query per trainee.
  // Replaces global list(3000).
  const { data: allWater = [] } = useQuery({
    queryKey: ['allWater', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.WaterEntry.filter({ trainee_email: email }, '-created_date', 150).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  React.useEffect(() => {
    const refresh = () => invalidateCoachTraineeSyncQueries(queryClient);
    const unsubMeal = base44.entities.MealEntry.subscribe(refresh);
    const unsubWater = base44.entities.WaterEntry.subscribe(refresh);
    const unsubMetrics = base44.entities.MetricsEntry.subscribe(refresh);
    const unsubTrainee = base44.entities.Trainee.subscribe(refresh);
    return () => { unsubMeal(); unsubWater(); unsubMetrics(); unsubTrainee(); };
  }, [queryClient]);
  // Workouts for the recent date range — one parallel query per trainee.
  // Replaces global list(3000).
  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts', traineeEmails.join(','), recentStart, today],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.WorkoutSession.filter({ trainee_email: email }, '-created_date', 50).catch(() => [])
        )
      );
      return perTrainee.flat().filter(r => localDateInRange(r.date, recentStart, today));
    },
    enabled: traineeEmails.length > 0,
  });

  // Notification preferences — filtered by trainee emails rather than global list().
  const { data: allNotifPrefs = [] } = useQuery({
    queryKey: ['allNotifPrefs', traineeEmails.join(',')],
    queryFn: async () => {
      const perTrainee = await Promise.all(
        traineeEmails.map(email =>
          base44.entities.NotificationPreference.filter({ trainee_email: email }).catch(() => [])
        )
      );
      return perTrainee.flat();
    },
    enabled: traineeEmails.length > 0,
  });

  const traineeStatuses = useMemo(() => {
    const s = {};
    trainees.forEach(t => {
      const e = t.user_email;
      const m = allMeals.filter(meal => nutritionRecordMatchesTrainee(meal, t));
      const w = allWater.filter(water => nutritionRecordMatchesTrainee(water, t));
      const wo = allWorkouts.filter(w => w.trainee_email === e);
      const cal = m.reduce((sum, x) => sum + (x.calories || 0), 0);
      const waterMl = w.reduce((sum, x) => sum + (x.amount_ml || 0), 0);
      s[e] = {
        nutrition: Math.min(Math.round((cal / (t.target_calories || 2000)) * 100), 100),
        water: Math.min(Math.round((waterMl / (t.water_target_ml || 3000)) * 100), 100),
        workout: wo.length > 0 ? 100 : 0,
        mealsCount: m.length,
        calories: cal,
        protein: Math.round(m.reduce((sum, x) => sum + (x.protein || 0), 0)),
        targetCalories: t.target_calories || 2000,
      };
    });
    return s;
  }, [trainees, allMeals, allWater, allWorkouts]);

  const filteredTrainees = useMemo(() => trainees.filter(t => {
    if (!t.full_name?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filter === 'all') return true;
    const s = traineeStatuses[t.user_email];
    const avg = ((s?.nutrition || 0) + (s?.water || 0) + (s?.workout || 0)) / 3;
    if (filter === 'good') return avg >= 80;
    if (filter === 'partial') return avg >= 50 && avg < 80;
    if (filter === 'bad') return avg < 50;
    return true;
  }), [trainees, search, filter, traineeStatuses]);

  const stats = useMemo(() => {
    let good = 0, partial = 0, bad = 0;
    trainees.forEach(t => {
      const s = traineeStatuses[t.user_email];
      const avg = ((s?.nutrition || 0) + (s?.water || 0) + (s?.workout || 0)) / 3;
      if (avg >= 80) good++; else if (avg >= 50) partial++; else bad++;
    });
    return { good, partial, bad, total: trainees.length };
  }, [trainees, traineeStatuses]);

  // Today-specific activity counts
  const todayActivity = useMemo(() => {
    let loggedToday = 0, workoutToday = 0, silentToday = 0;
    trainees.forEach(t => {
      const hasMeal = allMeals.some(m => nutritionRecordMatchesTrainee(m, t) && m.date === today);
      const hasWorkout = allWorkouts.some(w => w.trainee_email === t.user_email && w.date === today);
      if (hasMeal) loggedToday++;
      if (hasWorkout) workoutToday++;
      if (!hasMeal && !hasWorkout) silentToday++;
    });
    return { loggedToday, workoutToday, silentToday };
  }, [trainees, allMeals, allWorkouts, today]);

  const deleteMutation = useMutation({
    // Soft delete: set status: 'deleted' so the Restore tab can recover them
    // and all related MealEntry/WorkoutSession/MetricsEntry records stay intact.
    // Hard entity deletion was replaced here to prevent unrecoverable data loss.
    mutationFn: async (ids) => {
      for (const id of ids) {
        await base44.entities.Trainee.update(id, {
          status: 'deleted',
        });
      }
    },
    onSuccess: (_, ids) => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesDeleted'] });
      toast.success(`✅ ${ids.length} מתאמנים נמחקו`);
      setSelectedIds([]); setSelectMode(false);
    },
    onError: () => toast.error('שגיאה במחיקה'),
  });

  const restoreMutation = useMutation({
    mutationFn: async (trainee) => {
      // Clear user binding so they must re-register fresh
      await base44.entities.Trainee.update(trainee.id, {
        status: 'active',
        user_id: null,
        user_email: null,
        invite_status: 'invited',
        first_login_at: null,
        last_login_at: null,
        onboarding_status: 'pending',
      });
    },
    onSuccess: (_, trainee) => {
      queryClient.invalidateQueries({ queryKey: ['trainees'] });
      queryClient.invalidateQueries({ queryKey: ['allTraineesDeleted'] });
      toast.success(`✅ ${trainee.full_name} שוחזר — יש לשלוח לו הזמנה חדשה להרשמה`);
    },
    onError: () => toast.error('שגיאה בשחזור מתאמן'),
  });

  const toggleSelect = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  const toggleSelectAll = () => setSelectedIds(selectedIds.length === filteredTrainees.length ? [] : filteredTrainees.map(t => t.id));
  const handleDeleteSelected = () => {
    if (!selectedIds.length) return;
    if (!window.confirm(`למחוק ${selectedIds.length} מתאמנים?`)) return;
    deleteMutation.mutate(selectedIds);
  };
  const handleDeleteOne = id => {
    if (!window.confirm('למחוק מתאמן זה?')) return;
    deleteMutation.mutate([id]);
  };

  React.useEffect(() => {
    if (!selectedTrainee?.id) return;
    const latest = trainees.find(t => t.id === selectedTrainee.id);
    if (latest && latest.updated_date !== selectedTrainee.updated_date) {
      setSelectedTrainee(latest);
    }
  }, [trainees, selectedTrainee?.id, selectedTrainee?.updated_date]);

  // If a trainee is selected — show detail view
  if (selectedTrainee) {
    return <TraineeDetail trainee={selectedTrainee} onBack={() => setSelectedTrainee(null)} currentUser={user} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-2xl mx-auto px-4 py-5">

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">שלום{user?.full_name ? ` ${user.full_name.split(' ')[0]}` : ''} 👋</h1>
            <p className="text-sm text-slate-500">{stats.total} מתאמנים פעילים</p>
          </div>
          <Link to={createPageUrl('AddTrainee')}>
            <Button size="sm" className="bg-emerald-500 hover:bg-emerald-600 h-9 gap-1.5">
              <UserPlus className="w-4 h-4" />הוסף מתאמן
            </Button>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Link to={createPageUrl('AddTrainee')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-emerald-300 hover:bg-emerald-50 transition-colors cursor-pointer">
              <UserPlus className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">הוסף מתאמן</p>
            </div>
          </Link>
          <Link to={createPageUrl('CoachDailyWorkout')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-orange-300 hover:bg-orange-50 transition-colors cursor-pointer">
              <Dumbbell className="w-5 h-5 text-orange-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">אימון יומי</p>
            </div>
          </Link>
          <Link to={createPageUrl('CoachReports')} className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer">
              <TrendingUp className="w-5 h-5 text-blue-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">דוחות</p>
            </div>
          </Link>
          <Link to="/CoachAsTrainee" className="block">
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-center hover:border-amber-300 hover:bg-amber-50 transition-colors cursor-pointer">
              <Eye className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-[10px] text-slate-600 font-medium">ממשק מתאמן</p>
            </div>
          </Link>
        </div>

        {/* Today Summary */}
        <Card className="p-4 mb-4 bg-gradient-to-br from-teal-50 to-emerald-50 border-teal-200">
          <h2 className="text-sm font-bold text-teal-800 mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            פעילות היום
          </h2>
          <div className="grid grid-cols-3 gap-2">
            <div
              className="bg-white rounded-lg p-2.5 text-center cursor-pointer hover:bg-emerald-50 transition-colors border border-emerald-100"
              onClick={() => setFilter('good')}
            >
              <p className="text-2xl font-bold text-emerald-600">{todayActivity.loggedToday}</p>
              <p className="text-[10px] text-emerald-700 mt-0.5">דיווחו היום</p>
            </div>
            <div
              className="bg-white rounded-lg p-2.5 text-center cursor-pointer hover:bg-orange-50 transition-colors border border-orange-100"
              onClick={() => setFilter('all')}
            >
              <p className="text-2xl font-bold text-orange-500">{todayActivity.workoutToday}</p>
              <p className="text-[10px] text-orange-700 mt-0.5">אימנו היום</p>
            </div>
            <div
              className="bg-white rounded-lg p-2.5 text-center cursor-pointer hover:bg-red-50 transition-colors border border-red-100"
              onClick={() => setFilter('bad')}
            >
              <p className="text-2xl font-bold text-red-500">{todayActivity.silentToday}</p>
              <p className="text-[10px] text-red-700 mt-0.5">לא פעילים</p>
            </div>
          </div>
        </Card>

        {/* Weekly Adherence Stats */}
        <div className="grid grid-cols-4 gap-2 mb-4">
          <Card className="p-3 text-center bg-white shadow-sm border-slate-100 cursor-pointer hover:border-slate-300" onClick={() => setFilter('all')}>
            <p className="text-xl font-bold text-slate-800">{stats.total}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">סה״כ</p>
          </Card>
          <Card className="p-3 text-center bg-emerald-50 border-emerald-100 cursor-pointer hover:border-emerald-300" onClick={() => setFilter('good')}>
            <p className="text-xl font-bold text-emerald-700">{stats.good}</p>
            <p className="text-[10px] text-emerald-600 mt-0.5">מצוין</p>
          </Card>
          <Card className="p-3 text-center bg-amber-50 border-amber-100 cursor-pointer hover:border-amber-300" onClick={() => setFilter('partial')}>
            <p className="text-xl font-bold text-amber-700">{stats.partial}</p>
            <p className="text-[10px] text-amber-600 mt-0.5">חלקי</p>
          </Card>
          <Card className="p-3 text-center bg-red-50 border-red-100 cursor-pointer hover:border-red-300" onClick={() => setFilter('bad')}>
            <p className="text-xl font-bold text-red-700">{stats.bad}</p>
            <p className="text-[10px] text-red-600 mt-0.5">זקוקים לתשומת לב</p>
          </Card>
        </div>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="חפש מתאמן..." className="pr-10 bg-white h-10" />
        </div>

        {/* Filters + select */}
        <div className="flex items-center justify-between mb-4 gap-2">
          <Tabs value={filter} onValueChange={setFilter} className="flex-1">
            <TabsList className="bg-white border w-full justify-start overflow-x-auto flex-nowrap h-9">
              <TabsTrigger value="all" className="flex-shrink-0 text-xs h-7">הכל ({stats.total})</TabsTrigger>
              <TabsTrigger value="good" className="text-emerald-600 flex-shrink-0 text-xs h-7">מצוין ({stats.good})</TabsTrigger>
              <TabsTrigger value="partial" className="text-amber-600 flex-shrink-0 text-xs h-7">חלקי ({stats.partial})</TabsTrigger>
              <TabsTrigger value="bad" className="text-red-600 flex-shrink-0 text-xs h-7">חסר ({stats.bad})</TabsTrigger>
              {allTraineesIncDeleted.length > 0 && (
                <TabsTrigger value="deleted" className="text-slate-500 flex-shrink-0 text-xs h-7">
                  <UserX className="w-3 h-3 ml-1" />מחוקים ({allTraineesIncDeleted.length})
                </TabsTrigger>
              )}
            </TabsList>
          </Tabs>
          <Button variant={selectMode ? 'default' : 'outline'} size="sm"
            onClick={() => { setSelectMode(!selectMode); setSelectedIds([]); }}
            className={`h-9 gap-1.5 flex-shrink-0 text-xs ${selectMode ? 'bg-slate-700' : ''}`}>
            <CheckSquare className="w-3.5 h-3.5" />בחירה
          </Button>
        </div>

        {/* Bulk bar */}
        {selectMode && (
          <div className="flex items-center justify-between bg-slate-800 text-white rounded-xl px-4 py-2.5 mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={toggleSelectAll} className="flex items-center gap-1.5 text-sm min-h-0 min-w-0">
                {selectedIds.length === filteredTrainees.length
                  ? <CheckSquare className="w-4 h-4 text-teal-300" />
                  : <Square className="w-4 h-4 text-slate-400" />}
                <span className="text-xs">{selectedIds.length === filteredTrainees.length ? 'בטל הכל' : 'בחר הכל'}</span>
              </button>
              <span className="text-xs text-slate-300">{selectedIds.length} נבחרו</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => { setSelectMode(false); setSelectedIds([]); }}
                className="h-7 text-slate-300 hover:text-white px-2 min-h-0"><X className="w-3.5 h-3.5" /></Button>
              <Button size="sm" onClick={handleDeleteSelected} disabled={!selectedIds.length || deleteMutation.isPending}
                className="h-7 bg-red-500 hover:bg-red-600 text-white gap-1 text-xs px-3 min-h-0">
                <Trash2 className="w-3.5 h-3.5" />{deleteMutation.isPending ? 'מוחק...' : `מחק (${selectedIds.length})`}
              </Button>
            </div>
          </div>
        )}

        {/* Deleted Trainees Restore Panel */}
        {filter === 'deleted' && (
          <div className="space-y-2 mb-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-3 text-sm text-amber-800">
              ⚠️ מתאמנים אלו לא פעילים. שחזור יאפשר להם להתחבר מחדש. WhatsApp יהיה <strong>כבוי</strong> אחרי שחזור.
            </div>
            {allTraineesIncDeleted.map(t => (
              <Card key={t.id} className="border border-slate-200 bg-slate-50 p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-slate-700 text-sm truncate">{t.full_name}</p>
                  <p className="text-xs text-slate-400 truncate">{t.user_email}</p>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-600">{t.status}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => restoreMutation.mutate(t)}
                  disabled={restoreMutation.isPending}
                  className="gap-1.5 text-xs h-8 bg-emerald-500 hover:bg-emerald-600 text-white flex-shrink-0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />שחזר
                </Button>
              </Card>
            ))}
            {allTraineesIncDeleted.length === 0 && (
              <p className="text-center text-slate-400 py-8 text-sm">אין מתאמנים מחוקים/לא פעילים</p>
            )}
          </div>
        )}

        {/* List */}
        {filter !== 'deleted' && <div className="space-y-2">
          {isLoading ? (
            <div className="text-center py-12 text-slate-500">טוען...</div>
          ) : filteredTrainees.length === 0 ? (
            <Card className="p-12 text-center bg-white border-0">
              <Users className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">{trainees.length === 0 ? 'אין מתאמנים עדיין' : 'לא נמצאו מתאמנים'}</p>
              {trainees.length === 0 && (
                <Link to={createPageUrl('AddTrainee')}>
                  <Button className="mt-4 bg-emerald-500 hover:bg-emerald-600">
                    <UserPlus className="w-4 h-4 ml-2" />הוסף מתאמן ראשון
                  </Button>
                </Link>
              )}
            </Card>
          ) : (
            filteredTrainees.map(trainee => {
              const notifPref = allNotifPrefs.find(p => p.trainee_email === trainee.user_email);
              const remindersOn = notifPref ? notifPref.whatsapp_reminders_enabled !== false : true;
              const mutedDays = notifPref?.disabled_days || [];
              const traineeFirstMeal = allMealsEver
                .filter(m => nutritionRecordMatchesTrainee(m, trainee))
                .sort((a, b) => new Date(a.created_date) - new Date(b.created_date))[0];
              return (
                <TraineeMiniCard
                   key={trainee.id}
                   trainee={trainee}
                   stats={traineeStatuses[trainee.user_email]}
                   selectMode={selectMode}
                   selected={selectedIds.includes(trainee.id)}
                   onSelect={() => toggleSelect(trainee.id)}
                   onDelete={handleDeleteOne}
                   onClick={() => setSelectedTrainee(trainee)}
                   notifStatus={{ remindersOn, mutedDays }}
                   firstMealDate={traineeFirstMeal?.created_date}
                   meals={allMealsEver}
                   workouts={allWorkouts}
                 />
              );
            })
          )}
        </div>}
      </div>
    </div>
  );
}