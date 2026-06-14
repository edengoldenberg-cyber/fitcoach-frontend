import React, { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Calendar, Zap, Activity, AlertCircle } from 'lucide-react';

export default function TraineeAdvancedLearningDashboard({ trainee, meals = [], workouts = [] }) {
  const COLORS = ['#79DBD6', '#5BC5C0', '#ef4444', '#f59e0b', '#10b981'];

  // חישוב כל הסטטיסטיקות
  const stats = useMemo(() => {
    if (!meals.length) return null;

    // מיון לפי תאריך
    const sortedMeals = [...meals].sort((a, b) => new Date(b.created_date) - new Date(a.created_date));
    const last30Days = sortedMeals.filter(m => {
      const daysAgo = (Date.now() - new Date(m.created_date).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 30;
    });

    // מגמת קלוריות לאחרונה
    const dailyCalories = {};
    last30Days.forEach(meal => {
      const date = new Date(meal.created_date).toLocaleDateString('he-IL');
      dailyCalories[date] = (dailyCalories[date] || 0) + (meal.calories || 0);
    });

    const caloriesTrend = Object.entries(dailyCalories)
      .slice(-14)
      .map(([date, calories]) => ({ date, calories: Math.round(calories) }));

    // מאכלים אהובים
    const foodCounts = {};
    last30Days.forEach(meal => {
      if (meal.food_items && Array.isArray(meal.food_items)) {
        meal.food_items.forEach(item => {
          const foodName = item.name_he || item.name || 'לא ידוע';
          foodCounts[foodName] = (foodCounts[foodName] || 0) + 1;
        });
      }
    });

    const topFoods = Object.entries(foodCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([food, count]) => ({ name: food, value: count }));

    // ממוצעי מאקרוס
    const totalProtein = last30Days.reduce((sum, m) => sum + (m.protein || 0), 0);
    const totalCarbs = last30Days.reduce((sum, m) => sum + (m.carbs || 0), 0);
    const totalFat = last30Days.reduce((sum, m) => sum + (m.fat || 0), 0);
    const totalCalories = last30Days.reduce((sum, m) => sum + (m.calories || 0), 0);

    const daysLogged = last30Days.length > 0 ? new Set(last30Days.map(m => new Date(m.created_date).toDateString())).size : 0;

    const avgDaily = daysLogged > 0 ? {
      calories: Math.round(totalCalories / daysLogged),
      protein: Math.round(totalProtein / daysLogged),
      carbs: Math.round(totalCarbs / daysLogged),
      fat: Math.round(totalFat / daysLogged),
    } : null;

    // התפלגות מאקרוס (אחוזים)
    const macroPercentages = avgDaily ? {
      protein: Math.round((avgDaily.protein * 4 / avgDaily.calories) * 100),
      carbs: Math.round((avgDaily.carbs * 4 / avgDaily.calories) * 100),
      fat: Math.round((avgDaily.fat * 9 / avgDaily.calories) * 100),
    } : null;

    // דפוסי הרגלים
    const mealsByTime = {};
    last30Days.forEach(meal => {
      const time = new Date(meal.created_date).getHours();
      const timeSlot = time < 12 ? 'בוקר' : time < 17 ? 'צהריים' : 'ערב';
      mealsByTime[timeSlot] = (mealsByTime[timeSlot] || 0) + 1;
    });

    // קונסיסטנציה
    const consistency = daysLogged > 0 ? Math.round((daysLogged / 30) * 100) : 0;

    // ימים ללא רישום
    const missingDays = 30 - daysLogged;

    return {
      caloriesTrend,
      topFoods,
      avgDaily,
      macroPercentages,
      mealsByTime,
      consistency,
      daysLogged,
      missingDays,
      totalWorkouts: workouts.length,
    };
  }, [meals, workouts]);

  if (!stats || !stats.avgDaily) {
    return (
      <div className="bg-slate-50 rounded-lg p-6 text-center text-slate-500">
        <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
        <p>אין מספיק נתונים לניתוח מפורט</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* סטטיסטיקות כוללות */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="text-xs text-slate-600 mb-1">קלוריות ממוצע</div>
          <div className="text-2xl font-bold text-blue-700">{stats.avgDaily.calories}</div>
          <div className="text-xs text-slate-500 mt-1">kcal ליום</div>
        </div>
        <div className="bg-green-50 rounded-lg p-4">
          <div className="text-xs text-slate-600 mb-1">קונסיסטנציה</div>
          <div className="text-2xl font-bold text-green-700">{stats.consistency}%</div>
          <div className="text-xs text-slate-500 mt-1">{stats.daysLogged} ימים</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-4">
          <div className="text-xs text-slate-600 mb-1">אימונים</div>
          <div className="text-2xl font-bold text-purple-700">{stats.totalWorkouts}</div>
          <div className="text-xs text-slate-500 mt-1">סה״כ בחודש</div>
        </div>
        <div className="bg-amber-50 rounded-lg p-4">
          <div className="text-xs text-slate-600 mb-1">ימים ללא רישום</div>
          <div className="text-2xl font-bold text-amber-700">{stats.missingDays}</div>
          <div className="text-xs text-slate-500 mt-1">מ-30 ימים</div>
        </div>
      </div>

      {/* מגמות קלוריות */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            מגמת קלוריות (14 ימים אחרונים)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={stats.caloriesTrend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" angle={-45} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="calories" stroke="#79DBD6" strokeWidth={2} dot={{ fill: '#79DBD6' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* התפלגות מאקרוס */}
      <Card>
        <CardHeader>
          <CardTitle>התפלגות מאקרוס (ממוצע יומי)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={[
                      { name: 'חלבון', value: stats.macroPercentages.protein },
                      { name: 'פחמימות', value: stats.macroPercentages.carbs },
                      { name: 'שומן', value: stats.macroPercentages.fat },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {[0, 1, 2].map((index) => (
                      <Cell key={index} fill={COLORS[index]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="col-span-1 md:col-span-2 space-y-3">
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">חלבון</span>
                  <span className="text-sm font-bold text-blue-600">{stats.avgDaily.protein}g ({stats.macroPercentages.protein}%)</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${stats.macroPercentages.protein}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">פחמימות</span>
                  <span className="text-sm font-bold text-green-600">{stats.avgDaily.carbs}g ({stats.macroPercentages.carbs}%)</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-green-500 h-2 rounded-full" style={{ width: `${stats.macroPercentages.carbs}%` }}></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-medium">שומן</span>
                  <span className="text-sm font-bold text-amber-600">{stats.avgDaily.fat}g ({stats.macroPercentages.fat}%)</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div className="bg-amber-500 h-2 rounded-full" style={{ width: `${stats.macroPercentages.fat}%` }}></div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* מאכלים אהובים */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5" />
            המאכלים הנפוצים ביותר
          </CardTitle>
          <CardDescription>המאכלים שהרישום שלהם הרבה ביותר בחודש</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={stats.topFoods}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#79DBD6" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* דפוסי הרגלים */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            דפוסי אכילה
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {Object.entries(stats.mealsByTime).map(([time, count]) => (
              <div key={time} className="bg-slate-50 rounded-lg p-4 text-center">
                <div className="text-sm text-slate-600 mb-1">{time}</div>
                <div className="text-3xl font-bold text-teal-600">{count}</div>
                <div className="text-xs text-slate-500 mt-1">ארוחות</div>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-900">
            <Activity className="w-4 h-4 inline mr-2" />
            המתאמן הכי פעיל ב<strong>{Object.entries(stats.mealsByTime).sort((a, b) => b[1] - a[1])[0]?.[0]}</strong>
          </div>
        </CardContent>
      </Card>

      {/* תיאור הלמידה */}
      <Card className="bg-gradient-to-r from-teal-50 to-blue-50">
        <CardHeader>
          <CardTitle>סיכום הלמידה של המערכת</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <strong>פרופיל תזונה:</strong> המתאמן בדרך כלל מתחת לממוצע של {stats.avgDaily.calories} קלוריות ביום עם התמקדות ב-{stats.macroPercentages.protein}% חלבון.
          </p>
          <p>
            <strong>דפוס עקביות:</strong> המתאמן רשם מזון {stats.consistency}% מהימים, מה שמעיד על {stats.consistency > 75 ? 'עקביות גבוהה' : stats.consistency > 50 ? 'עקביות בינונית' : 'צורך בשיפור עקביות'}.
          </p>
          <p>
            <strong>העדפות מזון:</strong> המתאמן מחזיר לעיתים קרובות ל-{stats.topFoods[0]?.name} ו-{stats.topFoods[1]?.name}, מה שמציע עדיפויות תזונתיות ברורות.
          </p>
          <p>
            <strong>סיף שיפור:</strong> התמקדות על {stats.missingDays > 10 ? 'הגברת תדירות הרישום' : 'שיפור איכות הרישומים'} יכולה לשפר את המלצות ה-AI.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}