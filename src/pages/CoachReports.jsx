import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Activity, Trophy, Calendar, User, TrendingDown, AlertTriangle, CheckCircle, Users } from 'lucide-react';
import { format, subDays, startOfWeek, endOfWeek, eachDayOfInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { he } from 'date-fns/locale';
import { getIsraelDateString, nutritionRecordMatchesTrainee, metricRecordMatchesTrainee, localDateInRange } from '@/utils/nutritionSync';

export default function CoachReports() {
  const [selectedTrainee, setSelectedTrainee] = useState('all');
  const [timeRange, setTimeRange] = useState('week'); // week, month, 3months, custom, day
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [activeTab, setActiveTab] = useState('nutrition');
  const [patternFilter, setPatternFilter] = useState('all'); // all, nutrition_good, workout_good, struggling

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainees = [] } = useQuery({
    queryKey: ['trainees', user?.email],
    queryFn: () => base44.entities.Trainee.filter({ coach_email: user?.email }),
    enabled: !!user?.email,
  });

  // Date range calculation
  const dateRange = useMemo(() => {
    const today = new Date();
    let start, end;
    
    if (timeRange === 'day') {
      start = today;
      end = today;
    } else if (timeRange === 'week') {
      start = subDays(today, 7);
      end = today;
    } else if (timeRange === 'month') {
      start = subDays(today, 30);
      end = today;
    } else if (timeRange === 'custom' && customStartDate && customEndDate) {
      start = parseISO(customStartDate);
      end = parseISO(customEndDate);
    } else {
      start = subDays(today, 90);
      end = today;
    }
    
    return { start, end };
  }, [timeRange, customStartDate, customEndDate]);

  // Fetch all data for selected trainee(s)
  const { data: allMeals = [] } = useQuery({
    queryKey: ['allMeals', selectedTrainee],
    queryFn: async () => {
      const records = await base44.entities.MealEntry.list('-created_date', 1000);
      if (selectedTrainee === 'all') {
        return records.filter(record => trainees.some(trainee => nutritionRecordMatchesTrainee(record, trainee)));
      }
      const trainee = trainees.find(t => t.id === selectedTrainee);
      return records.filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!user?.email && trainees.length > 0,
  });

  const { data: allWorkouts = [] } = useQuery({
    queryKey: ['allWorkouts', selectedTrainee],
    queryFn: async () => {
      if (selectedTrainee === 'all') {
        return base44.entities.WorkoutSession.list('-created_date', 1000);
      }
      const trainee = trainees.find(t => t.id === selectedTrainee);
      return base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email });
    },
    enabled: !!user?.email && trainees.length > 0,
  });

  const { data: allWater = [] } = useQuery({
    queryKey: ['allWater', selectedTrainee],
    queryFn: async () => {
      const records = await base44.entities.WaterEntry.list('-created_date', 1000);
      if (selectedTrainee === 'all') {
        return records.filter(record => trainees.some(trainee => nutritionRecordMatchesTrainee(record, trainee)));
      }
      const trainee = trainees.find(t => t.id === selectedTrainee);
      return records.filter(record => nutritionRecordMatchesTrainee(record, trainee));
    },
    enabled: !!user?.email && trainees.length > 0,
  });

  const { data: allAchievements = [] } = useQuery({
    queryKey: ['allAchievements', selectedTrainee],
    queryFn: async () => {
      if (selectedTrainee === 'all') {
        return base44.entities.Achievement.list('-created_date', 500);
      }
      const trainee = trainees.find(t => t.id === selectedTrainee);
      return base44.entities.Achievement.filter({ trainee_email: trainee?.user_email });
    },
    enabled: !!user?.email && trainees.length > 0,
  });

  const { data: allMetrics = [] } = useQuery({
    queryKey: ['allMetrics', selectedTrainee],
    queryFn: async () => {
      const records = await base44.entities.MetricsEntry.list('-date', 1000);
      if (selectedTrainee === 'all') {
        return records.filter(record => trainees.some(trainee => metricRecordMatchesTrainee(record, trainee)));
      }
      const trainee = trainees.find(t => t.id === selectedTrainee);
      return records.filter(record => metricRecordMatchesTrainee(record, trainee));
    },
    enabled: !!user?.email && trainees.length > 0,
  });

  // Process nutrition trends (calories & protein) + water
  const nutritionTrends = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    
    return days.map(day => {
      const dayStr = getIsraelDateString(day);
      const selected = selectedTrainee === 'all' ? null : trainees.find(t => t.id === selectedTrainee);
      const dayMeals = allMeals.filter(m => m.date === dayStr && (!selected || nutritionRecordMatchesTrainee(m, selected)));
      const dayWater = allWater.filter(w => w.date === dayStr && (!selected || nutritionRecordMatchesTrainee(w, selected)));
      
      const calories = dayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
      const protein = dayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
      const water = dayWater.reduce((sum, w) => sum + (w.amount_ml || 0), 0);
      
      return {
        date: timeRange === 'day' ? format(day, 'HH:mm', { locale: he }) : format(day, 'd/M', { locale: he }),
        fullDate: dayStr,
        calories: Math.round(calories),
        protein: Math.round(protein),
        water: Math.round(water),
      };
    });
  }, [allMeals, allWater, dateRange, timeRange]);

  // Process activity trends
  const activityTrends = useMemo(() => {
    const days = eachDayOfInterval({ start: dateRange.start, end: dateRange.end });
    
    return days.map(day => {
      const dayStr = getIsraelDateString(day);
      const dayWorkouts = allWorkouts.filter(w => w.date === dayStr);
      
      return {
        date: format(day, 'd/M', { locale: he }),
        fullDate: dayStr,
        workouts: dayWorkouts.length,
        duration: dayWorkouts.reduce((sum, w) => sum + (w.duration_minutes || 0), 0),
      };
    });
  }, [allWorkouts, dateRange]);

  // Weekly compliance calculation
  const weeklyCompliance = useMemo(() => {
    const weeks = [];
    let currentDate = new Date(dateRange.start);
    
    while (currentDate <= dateRange.end) {
      const weekStart = startOfWeek(currentDate, { weekStartsOn: 0 });
      const weekEnd = endOfWeek(currentDate, { weekStartsOn: 0 });
      
      const selected = selectedTrainee === 'all' ? null : trainees.find(t => t.id === selectedTrainee);
      const weekMeals = allMeals.filter(m => {
        const mDate = new Date(m.date);
        return mDate >= weekStart && mDate <= weekEnd && (!selected || nutritionRecordMatchesTrainee(m, selected));
      });
      
      const weekWorkouts = allWorkouts.filter(w => {
        return localDateInRange(w.date, getIsraelDateString(weekStart), getIsraelDateString(weekEnd));
      });
      
      const weekWater = allWater.filter(w => {
        return localDateInRange(w.date, getIsraelDateString(weekStart), getIsraelDateString(weekEnd)) && (!selected || nutritionRecordMatchesTrainee(w, selected));
      });
      
      const daysWithMeals = new Set(weekMeals.map(m => m.date)).size;
      const daysWithWorkouts = new Set(weekWorkouts.map(w => w.date)).size;
      const daysWithWater = new Set(weekWater.map(w => w.date)).size;
      
      const complianceScore = Math.round(
        ((daysWithMeals / 7) * 40 + (daysWithWorkouts / 7) * 30 + (daysWithWater / 7) * 30)
      );
      
      weeks.push({
        week: `${format(weekStart, 'd/M')} - ${format(weekEnd, 'd/M')}`,
        compliance: complianceScore,
        mealsLogged: daysWithMeals,
        workoutDays: daysWithWorkouts,
      });
      
      currentDate = new Date(weekEnd);
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return weeks;
  }, [allMeals, allWorkouts, allWater, dateRange]);

  // Achievements over time
  const achievementsByMonth = useMemo(() => {
    const months = {};
    
    allAchievements.forEach(ach => {
      const month = format(new Date(ach.earned_at || ach.created_date), 'MM/yyyy');
      months[month] = (months[month] || 0) + 1;
    });
    
    return Object.entries(months).map(([month, count]) => ({
      month,
      achievements: count,
    }));
  }, [allAchievements]);

  // Pattern Analysis - Trainee segmentation
  const traineePatterns = useMemo(() => {
    if (selectedTrainee !== 'all') return [];
    
    const last30Days = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    
    return trainees.map(trainee => {
      const traineeMeals = allMeals.filter(m => 
        nutritionRecordMatchesTrainee(m, trainee) && m.date >= last30Days
      );
      const traineeWorkouts = allWorkouts.filter(w => 
        w.trainee_email === trainee.user_email && w.date >= last30Days
      );
      const traineeWater = allWater.filter(w => 
        nutritionRecordMatchesTrainee(w, trainee) && w.date >= last30Days
      );
      
      // Calculate compliance rates
      const nutritionDays = new Set(traineeMeals.map(m => m.date)).size;
      const workoutDays = traineeWorkouts.length;
      const waterDays = new Set(traineeWater.map(w => w.date)).size;
      
      const nutritionRate = (nutritionDays / 30) * 100;
      const workoutRate = (workoutDays / 12) * 100; // 3 workouts/week = 12/month
      const waterRate = (waterDays / 30) * 100;
      
      // Calories vs target
      const avgCalories = traineeMeals.length > 0 
        ? traineeMeals.reduce((sum, m) => sum + (m.calories || 0), 0) / nutritionDays
        : 0;
      const calorieAdherence = trainee.target_calories 
        ? (avgCalories / trainee.target_calories) * 100 
        : 0;
      
      // Pattern classification
      let pattern = 'balanced';
      if (nutritionRate > 70 && workoutRate < 50) pattern = 'nutrition_focused';
      if (workoutRate > 70 && nutritionRate < 50) pattern = 'workout_focused';
      if (nutritionRate < 50 && workoutRate < 50) pattern = 'struggling';
      if (nutritionRate > 80 && workoutRate > 80) pattern = 'excellent';
      
      return {
        trainee,
        nutritionRate: Math.round(nutritionRate),
        workoutRate: Math.round(workoutRate),
        waterRate: Math.round(waterRate),
        avgCalories: Math.round(avgCalories),
        calorieAdherence: Math.round(calorieAdherence),
        pattern,
        daysActive: Math.max(nutritionDays, workoutDays, waterDays),
      };
    }).sort((a, b) => b.daysActive - a.daysActive);
  }, [trainees, allMeals, allWorkouts, allWater, selectedTrainee]);

  // Trend Analysis - Group comparison
  const groupTrends = useMemo(() => {
    if (selectedTrainee !== 'all') return null;
    
    const last30Days = format(subDays(new Date(), 30), 'yyyy-MM-dd');
    const last60Days = format(subDays(new Date(), 60), 'yyyy-MM-dd');
    
    const calcGroupAvg = (startDate) => {
      const meals = allMeals.filter(m => m.date >= startDate);
      const workouts = allWorkouts.filter(w => w.date >= startDate);
      
      const grouped = {};
      meals.forEach(m => {
        if (!grouped[m.date]) grouped[m.date] = { calories: 0, count: 0 };
        grouped[m.date].calories += m.calories || 0;
        grouped[m.date].count += 1;
      });
      
      const daysWithData = Object.keys(grouped).length;
      const avgCalories = daysWithData > 0 
        ? Object.values(grouped).reduce((sum, d) => sum + d.calories, 0) / daysWithData
        : 0;
      
      return {
        avgCalories: Math.round(avgCalories),
        avgWorkouts: workouts.length / (daysWithData || 1),
        activeDays: daysWithData,
      };
    };
    
    const last30 = calcGroupAvg(last30Days);
    const prev30 = calcGroupAvg(last60Days);
    
    const calorieChange = last30.avgCalories - prev30.avgCalories;
    const workoutChange = ((last30.avgWorkouts - prev30.avgWorkouts) / (prev30.avgWorkouts || 1)) * 100;
    
    return {
      current: last30,
      previous: prev30,
      calorieChange,
      workoutChange: Math.round(workoutChange),
      trend: calorieChange > 50 ? 'improving' : calorieChange < -50 ? 'declining' : 'stable',
    };
  }, [allMeals, allWorkouts, selectedTrainee]);

  // Filtered trainees by pattern
  const filteredTrainees = useMemo(() => {
    if (patternFilter === 'all') return traineePatterns;
    
    if (patternFilter === 'nutrition_good') {
      return traineePatterns.filter(t => t.nutritionRate > 70 && t.workoutRate < 60);
    }
    if (patternFilter === 'workout_good') {
      return traineePatterns.filter(t => t.workoutRate > 70 && t.nutritionRate < 60);
    }
    if (patternFilter === 'struggling') {
      return traineePatterns.filter(t => t.nutritionRate < 50 || t.workoutRate < 50);
    }
    
    return traineePatterns;
  }, [traineePatterns, patternFilter]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const selected = selectedTrainee === 'all' ? null : trainees.find(t => t.id === selectedTrainee);
    const totalMeals = allMeals.filter(m => {
      return localDateInRange(m.date, getIsraelDateString(dateRange.start), getIsraelDateString(dateRange.end)) && (!selected || nutritionRecordMatchesTrainee(m, selected));
    }).length;
    
    const totalWorkouts = allWorkouts.filter(w => {
      return localDateInRange(w.date, getIsraelDateString(dateRange.start), getIsraelDateString(dateRange.end));
    }).length;
    
    const avgCalories = nutritionTrends.reduce((sum, d) => sum + d.calories, 0) / nutritionTrends.length;
    const avgProtein = nutritionTrends.reduce((sum, d) => sum + d.protein, 0) / nutritionTrends.length;
    
    return {
      totalMeals,
      totalWorkouts,
      avgCalories: Math.round(avgCalories) || 0,
      avgProtein: Math.round(avgProtein) || 0,
      totalAchievements: allAchievements.length,
    };
  }, [allMeals, allWorkouts, nutritionTrends, allAchievements, dateRange]);

  return (
    <div className="min-h-screen bg-slate-50 pb-20" dir="rtl">
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-3">
            <TrendingUp className="w-8 h-8" style={{ color: '#79DBD6' }} />
            דוחות ומגמות
          </h1>
          <p className="text-slate-600 mt-2">ניתוח מעמיק של התקדמות המתאמנים</p>
        </div>

        {/* Filters */}
        <Card className="p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">בחר מתאמן</label>
              <Select value={selectedTrainee} onValueChange={setSelectedTrainee}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המתאמנים</SelectItem>
                  {trainees.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-2 block">טווח זמן</label>
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">יום ספציפי</SelectItem>
                  <SelectItem value="week">7 ימים אחרונים</SelectItem>
                  <SelectItem value="month">30 ימים אחרונים</SelectItem>
                  <SelectItem value="3months">3 חודשים אחרונים</SelectItem>
                  <SelectItem value="custom">טווח מותאם אישית</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {timeRange === 'custom' && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">מתאריך</label>
                <Input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  max={customEndDate || format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700 mb-2 block">עד תאריך</label>
                <Input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  min={customStartDate}
                  max={format(new Date(), 'yyyy-MM-dd')}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          <Card className="p-4 text-center">
            <p className="text-sm text-slate-600">ארוחות נרשמו</p>
            <p className="text-2xl font-bold" style={{ color: '#79DBD6' }}>{summaryStats.totalMeals}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-slate-600">אימונים</p>
            <p className="text-2xl font-bold text-orange-600">{summaryStats.totalWorkouts}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-slate-600">ממוצע קלוריות</p>
            <p className="text-2xl font-bold text-emerald-600">{summaryStats.avgCalories}</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-slate-600">ממוצע חלבון</p>
            <p className="text-2xl font-bold text-blue-600">{summaryStats.avgProtein}ג׳</p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-sm text-slate-600">הישגים</p>
            <p className="text-2xl font-bold text-yellow-600">{summaryStats.totalAchievements}</p>
          </Card>
        </div>

        {/* Group Trends (only when viewing all trainees) */}
        {selectedTrainee === 'all' && groupTrends && (
          <Card className="p-6 mb-6">
            <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5" style={{ color: '#79DBD6' }} />
              מגמות קבוצתיות - 30 ימים אחרונים
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-gradient-to-br from-emerald-50 to-emerald-100 rounded-lg">
                <p className="text-sm text-emerald-700 mb-1">ממוצע קלוריות יומי</p>
                <p className="text-2xl font-bold text-emerald-800">{groupTrends.current.avgCalories}</p>
                <div className="flex items-center gap-1 mt-2 text-xs">
                  {groupTrends.calorieChange > 0 ? (
                    <TrendingUp className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  )}
                  <span className={groupTrends.calorieChange > 0 ? 'text-emerald-600' : 'text-red-600'}>
                    {groupTrends.calorieChange > 0 ? '+' : ''}{groupTrends.calorieChange} לעומת חודש קודם
                  </span>
                </div>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg">
                <p className="text-sm text-orange-700 mb-1">שינוי באימונים</p>
                <p className="text-2xl font-bold text-orange-800">{groupTrends.workoutChange}%</p>
                <div className="flex items-center gap-1 mt-2 text-xs">
                  {groupTrends.workoutChange > 0 ? (
                    <TrendingUp className="w-4 h-4 text-orange-600" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-600" />
                  )}
                  <span className={groupTrends.workoutChange > 0 ? 'text-orange-600' : 'text-red-600'}>
                    {groupTrends.workoutChange > 0 ? 'עלייה' : 'ירידה'} בתדירות
                  </span>
                </div>
              </div>
              
              <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg">
                <p className="text-sm text-blue-700 mb-1">מצב כללי</p>
                <p className="text-2xl font-bold text-blue-800">
                  {groupTrends.trend === 'improving' ? 'משתפר 📈' : 
                   groupTrends.trend === 'declining' ? 'יורד 📉' : 'יציב ➡️'}
                </p>
                <p className="text-xs text-blue-600 mt-2">
                  {groupTrends.current.activeDays} ימים פעילים בממוצע
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full bg-white mb-6">
            <TabsTrigger value="nutrition" className="flex-1">תזונה</TabsTrigger>
            <TabsTrigger value="activity" className="flex-1">פעילות</TabsTrigger>
            <TabsTrigger value="compliance" className="flex-1">התמדה</TabsTrigger>
            <TabsTrigger value="patterns" className="flex-1">דפוסים</TabsTrigger>
            <TabsTrigger value="achievements" className="flex-1">הישגים</TabsTrigger>
          </TabsList>

          {/* Nutrition Tab */}
          <TabsContent value="nutrition">
            <div className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">מגמות קלוריות וחלבון</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={nutritionTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="calories" 
                      stroke="#10b981" 
                      strokeWidth={2}
                      name="קלוריות"
                    />
                    <Line 
                      type="monotone" 
                      dataKey="protein" 
                      stroke="#3b82f6" 
                      strokeWidth={2}
                      name="חלבון (ג׳)"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">מעקב שתיית מים</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={nutritionTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="water" fill="#3b82f6" name="מים (מ״ל)" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <div className="space-y-4">
              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">ניתוח פעילות שבועית</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={activityTrends}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="workouts" fill="#f97316" name="מספר אימונים" />
                    <Bar dataKey="duration" fill="#79DBD6" name="דקות אימון" />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card className="p-6">
                <h3 className="text-lg font-bold text-slate-800 mb-4">אימונים אחרונים (פירוט מלא)</h3>
                <div className="space-y-4 max-h-[600px] overflow-y-auto">
                  {allWorkouts
                    .filter(w => {
                      const wDate = new Date(w.date);
                      return wDate >= dateRange.start && wDate <= dateRange.end;
                    })
                    .sort((a, b) => new Date(b.date) - new Date(a.date))
                    .map(workout => (
                      <div key={workout.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-slate-800">{workout.workout_name || 'אימון'}</h4>
                            <p className="text-sm text-slate-500">
                              {format(new Date(workout.date), 'd/M/yyyy', { locale: he })} | 
                              {workout.duration_minutes && ` ${workout.duration_minutes} דק׳`}
                              {workout.rpe && ` | RPE: ${workout.rpe}`}
                            </p>
                          </div>
                          {workout.coach_rating && (
                            <div className="flex gap-0.5">
                              {Array.from({length: 5}).map((_, i) => (
                                <span key={i} className={i < workout.coach_rating ? 'text-amber-500 text-lg' : 'text-slate-300'}>
                                  ★
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {workout.exercises?.length > 0 && (
                          <div className="space-y-3 bg-slate-50 rounded-lg p-3">
                            {workout.exercises.map((ex, idx) => (
                              <div key={idx} className="border-r-2 border-orange-400 pr-3">
                                <p className="font-medium text-slate-700 mb-1">{ex.exercise_name}</p>
                                {ex.sets?.length > 0 && (
                                  <div className="flex flex-wrap gap-2">
                                    {ex.sets.map((set, setIdx) => (
                                      <span key={setIdx} className="text-xs bg-white px-2 py-1 rounded border">
                                        {set.weight}kg × {set.reps}
                                      </span>
                                    ))}
                                  </div>
                                )}
                                {ex.notes && (
                                  <p className="text-xs text-amber-700 mt-2 bg-amber-50 p-2 rounded">
                                    💬 {ex.notes}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {workout.notes && (
                          <div className="mt-3 text-sm text-slate-600 bg-blue-50 p-2 rounded">
                            <strong>הערות המתאמן:</strong> {workout.notes}
                          </div>
                        )}

                        {workout.coach_feedback && (
                          <div className="mt-2 text-sm bg-emerald-50 p-2 rounded border border-emerald-200">
                            <strong className="text-emerald-800">משוב מאמן:</strong> 
                            <span className="text-emerald-700"> {workout.coach_feedback}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  
                  {allWorkouts.filter(w => {
                    const wDate = new Date(w.date);
                    return wDate >= dateRange.start && wDate <= dateRange.end;
                  }).length === 0 && (
                    <p className="text-center text-slate-500 py-8">אין אימונים בטווח זמן זה</p>
                  )}
                </div>
              </Card>
            </div>
          </TabsContent>

          {/* Compliance Tab */}
          <TabsContent value="compliance">
            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">סיכום התמדה שבועית</h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={weeklyCompliance}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="week" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="compliance" fill="#79DBD6" name="ציון התמדה (%)" />
                </BarChart>
              </ResponsiveContainer>
              
              <div className="mt-6 space-y-3">
                <h4 className="font-medium text-slate-700">פירוט שבועי:</h4>
                {weeklyCompliance.map((week, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-600">{week.week}</span>
                    <div className="flex gap-4 text-sm">
                      <span className="text-emerald-600">{week.mealsLogged} ימי תזונה</span>
                      <span className="text-orange-600">{week.workoutDays} ימי אימון</span>
                      <span className="font-bold" style={{ color: '#79DBD6' }}>{week.compliance}% התמדה</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Patterns Tab */}
          <TabsContent value="patterns">
            {selectedTrainee === 'all' ? (
              <div className="space-y-4">
                <Card className="p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800">ניתוח דפוסים והתנהגות</h3>
                    <Select value={patternFilter} onValueChange={setPatternFilter}>
                      <SelectTrigger className="w-48">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">כל המתאמנים</SelectItem>
                        <SelectItem value="nutrition_good">מצליחים בתזונה</SelectItem>
                        <SelectItem value="workout_good">מצליחים באימונים</SelectItem>
                        <SelectItem value="struggling">מתקשים</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-3">
                    {filteredTrainees.map(tp => (
                      <div key={tp.trainee.id} className="border rounded-lg p-4 bg-white hover:shadow-md transition-shadow">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <h4 className="font-bold text-slate-800">{tp.trainee.full_name}</h4>
                            <p className="text-xs text-slate-500">{tp.daysActive} ימים פעילים ב-30 יום אחרונים</p>
                          </div>
                          <div className="flex items-center gap-2">
                            {tp.pattern === 'excellent' && (
                              <span className="px-3 py-1 bg-gradient-to-r from-green-500 to-emerald-600 text-white text-xs rounded-full font-medium">
                                מצוין 🔥
                              </span>
                            )}
                            {tp.pattern === 'nutrition_focused' && (
                              <span className="px-3 py-1 bg-gradient-to-r from-emerald-400 to-teal-500 text-white text-xs rounded-full">
                                חזק בתזונה 🥗
                              </span>
                            )}
                            {tp.pattern === 'workout_focused' && (
                              <span className="px-3 py-1 bg-gradient-to-r from-orange-400 to-red-500 text-white text-xs rounded-full">
                                חזק באימון 💪
                              </span>
                            )}
                            {tp.pattern === 'struggling' && (
                              <span className="px-3 py-1 bg-gradient-to-r from-red-400 to-pink-500 text-white text-xs rounded-full">
                                צריך תמיכה ⚠️
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="p-3 bg-emerald-50 rounded-lg">
                            <p className="text-xs text-emerald-700 mb-1">תזונה</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-bold text-emerald-800">{tp.nutritionRate}%</span>
                              {tp.nutritionRate > 70 && <CheckCircle className="w-4 h-4 text-emerald-600" />}
                              {tp.nutritionRate < 50 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                            </div>
                            <p className="text-xs text-emerald-600 mt-1">{tp.avgCalories} קל' ממוצע</p>
                          </div>

                          <div className="p-3 bg-orange-50 rounded-lg">
                            <p className="text-xs text-orange-700 mb-1">אימונים</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-bold text-orange-800">{tp.workoutRate}%</span>
                              {tp.workoutRate > 70 && <CheckCircle className="w-4 h-4 text-orange-600" />}
                              {tp.workoutRate < 50 && <AlertTriangle className="w-4 h-4 text-red-500" />}
                            </div>
                            <p className="text-xs text-orange-600 mt-1">מיעד: 3/שבוע</p>
                          </div>

                          <div className="p-3 bg-blue-50 rounded-lg">
                            <p className="text-xs text-blue-700 mb-1">מים</p>
                            <div className="flex items-baseline gap-1">
                              <span className="text-xl font-bold text-blue-800">{tp.waterRate}%</span>
                              {tp.waterRate > 70 && <CheckCircle className="w-4 h-4 text-blue-600" />}
                            </div>
                            <p className="text-xs text-blue-600 mt-1">השלמת יומי</p>
                          </div>
                        </div>

                        {/* Insights */}
                        <div className="mt-3 p-3 bg-slate-50 rounded-lg">
                          <p className="text-xs font-medium text-slate-700 mb-1">תובנות:</p>
                          <ul className="text-xs text-slate-600 space-y-1">
                            {tp.nutritionRate > 70 && tp.workoutRate < 50 && (
                              <li className="flex items-start gap-2">
                                <span className="text-emerald-600">✓</span>
                                <span>מצליח בתזונה אבל יכול לשפר באימונים - כדאי לעודד</span>
                              </li>
                            )}
                            {tp.workoutRate > 70 && tp.nutritionRate < 50 && (
                              <li className="flex items-start gap-2">
                                <span className="text-orange-600">✓</span>
                                <span>מתאמן בהתמדה אבל חסר בתיעוד תזונה - שיחה חשובה</span>
                              </li>
                            )}
                            {tp.nutritionRate < 50 && tp.workoutRate < 50 && (
                              <li className="flex items-start gap-2">
                                <span className="text-red-600">⚠</span>
                                <span>פעילות נמוכה - צריך שיחת מוטיבציה וברור מטרות</span>
                              </li>
                            )}
                            {tp.calorieAdherence > 0 && tp.calorieAdherence < 85 && (
                              <li className="flex items-start gap-2">
                                <span className="text-amber-600">!</span>
                                <span>צורך רק {tp.calorieAdherence}% מהיעד - יכול להגדיל</span>
                              </li>
                            )}
                            {tp.calorieAdherence > 115 && (
                              <li className="flex items-start gap-2">
                                <span className="text-amber-600">!</span>
                                <span>צורך {tp.calorieAdherence}% מהיעד - עודף קלורי</span>
                              </li>
                            )}
                          </ul>
                        </div>
                      </div>
                    ))}
                    
                    {filteredTrainees.length === 0 && (
                      <p className="text-center text-slate-500 py-8">אין מתאמנים בקטגוריה זו</p>
                    )}
                  </div>
                </Card>
              </div>
            ) : (
              <Card className="p-6">
                <p className="text-center text-slate-500">בחר "כל המתאמנים" כדי לראות ניתוח דפוסים</p>
              </Card>
            )}
          </TabsContent>

          {/* Achievements Tab */}
          <TabsContent value="achievements">
            <Card className="p-6">
              <h3 className="text-lg font-bold text-slate-800 mb-4">הישגים לאורך זמן</h3>
              {achievementsByMonth.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={achievementsByMonth}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="achievements" fill="#eab308" name="הישגים" />
                    </BarChart>
                  </ResponsiveContainer>
                  
                  <div className="mt-6">
                    <h4 className="font-medium text-slate-700 mb-3">הישגים אחרונים:</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {allAchievements.slice(0, 6).map(ach => (
                        <div key={ach.id} className="flex items-center gap-3 p-3 bg-gradient-to-r from-yellow-50 to-amber-50 rounded-lg border border-yellow-200">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            ach.tier === 'gold' ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' :
                            ach.tier === 'silver' ? 'bg-gradient-to-br from-slate-300 to-slate-500' :
                            ach.tier === 'platinum' ? 'bg-gradient-to-br from-purple-400 to-purple-600' :
                            'bg-gradient-to-br from-orange-300 to-orange-500'
                          }`}>
                            <span className="text-lg">{ach.icon}</span>
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-800">{ach.title}</p>
                            <p className="text-xs text-slate-500">{ach.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <p className="text-center text-slate-500 py-8">אין הישגים עדיין</p>
              )}
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}