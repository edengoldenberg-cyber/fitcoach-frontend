import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { RefreshCw, Send, Search, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { toast } from 'sonner';
import SendMessageDialog from './SendMessageDialog';

const ALERT_TEMPLATES = {
  no_nutrition: {
    title: 'תזכורת תזונה',
    message: 'היי {name} 👋\nראיתי שהיום עדיין לא מילאת ארוחות. בוא נסגור את זה עכשיו – אפילו 2 דקות.',
    action: 'open_nutrition',
    actionLabel: 'פתח מילוי אוכל'
  },
  no_water: {
    title: 'תזכורת מים',
    message: 'היי {name} 💧\nתזכורת מים – בוא נכניס לפחות 3 כוסות עד הערב.',
    action: 'open_water',
    actionLabel: 'פתח מים'
  },
  no_workout_week: {
    title: 'תזכורת אימון',
    message: 'היי {name} 🏋️\nלא רשמת אימונים השבוע. בוא נעדכן מה עשית!',
    action: 'open_workout',
    actionLabel: 'פתח אימונים'
  },
  inactive_days: {
    title: 'נעדרת מהמערכת',
    message: 'היי {name}, הכל בסדר? לא ראיתי כניסה ביומיים האחרונים. תן/י לי עדכון קצר.',
    action: 'open_chat_ai',
    actionLabel: 'פתח צ\'אט'
  },
  no_metrics: {
    title: 'תזכורת מדדים',
    message: 'היי {name} 📊\nכבר שבוע שלא עדכנת מדדים. בוא נעשה מדידה קצרה.',
    action: 'open_metrics',
    actionLabel: 'פתח מדדים'
  },
  not_registered: {
    title: 'השלמת הרשמה',
    message: 'היי {name} 👋\nשלחתי לך הזמנה למערכת אבל עדיין לא נכנסת. צריך עזרה?',
    action: 'none',
    actionLabel: ''
  }
};

export default function TraineeAlertsTab({ trainees, coachEmail }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterType, setFilterType] = useState('all');
  const [sendingTo, setSendingTo] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const queryClient = useQueryClient();

  const today = format(new Date(), 'yyyy-MM-dd');
  const weekAgo = format(subDays(new Date(), 7), 'yyyy-MM-dd');

  // Fetch data scoped by date to avoid downloading every record from every trainee.
  // Meals and water: exact date filter (today only — matches the only usage in traineeStatuses).
  // Workouts and metrics: limited list sorted by recency (week range filter not supported server-side).
  const { data: allMeals = [], refetch: refetchMeals } = useQuery({
    queryKey: ['alertsMeals', today],
    queryFn: () => base44.entities.MealEntry.filter({ date: today }),
  });

  const { data: allWater = [], refetch: refetchWater } = useQuery({
    queryKey: ['alertsWater', today],
    queryFn: () => base44.entities.WaterEntry.filter({ date: today }),
  });

  const { data: allWorkouts = [], refetch: refetchWorkouts } = useQuery({
    queryKey: ['alertsWorkouts'],
    queryFn: () => base44.entities.WorkoutSession.list('-date', 500),
    staleTime: 5 * 60 * 1000,
  });

  const { data: allMetrics = [], refetch: refetchMetrics } = useQuery({
    queryKey: ['alertsMetrics'],
    queryFn: () => base44.entities.MetricsEntry.list('-date', 200),
    staleTime: 5 * 60 * 1000,
  });

  const handleRefresh = () => {
    refetchMeals();
    refetchWater();
    refetchWorkouts();
    refetchMetrics();
    queryClient.invalidateQueries({ queryKey: ['allTrainees'] });
    toast.success('הנתונים רועננו');
  };

  const traineeStatuses = useMemo(() => {
    return trainees.filter(t => t.status === 'active').map(trainee => {
      const todayMeals = allMeals.filter(m => m.trainee_email === trainee.user_email && m.date === today);
      const todayWater = allWater.filter(w => w.trainee_email === trainee.user_email && w.date === today);
      const weekWorkouts = allWorkouts.filter(w => w.trainee_email === trainee.user_email && w.date >= weekAgo);
      const recentMetrics = allMetrics.filter(m => m.trainee_email === trainee.user_email && m.date >= weekAgo);
      
      // Check if trainee ever had any activity
      const allTraineeMeals = allMeals.filter(m => m.trainee_email === trainee.user_email);
      const allTraineeWater = allWater.filter(w => w.trainee_email === trainee.user_email);
      const allTraineeWorkouts = allWorkouts.filter(w => w.trainee_email === trainee.user_email);
      const hasAnyActivity = allTraineeMeals.length > 0 || allTraineeWater.length > 0 || allTraineeWorkouts.length > 0;

      const alerts = [];
      let level = 'green'; // green, yellow, red

      // Check if never registered (no activity at all)
      if (!hasAnyActivity && trainee.invited_at) {
        alerts.push({ type: 'not_registered', label: 'לא השלים הרשמה', severity: 'high' });
        level = 'red';
        // Skip other checks for unregistered users
        return {
          trainee,
          alerts,
          level,
          todayMealsCount: 0,
          todayWaterCount: 0,
          weekWorkoutsCount: 0,
        };
      }

      // Check nutrition
      if (todayMeals.length === 0) {
        alerts.push({ type: 'no_nutrition', label: 'לא מילא ארוחות היום', severity: 'high' });
        level = 'red';
      }

      // Check water
      if (todayWater.length === 0) {
        alerts.push({ type: 'no_water', label: 'לא מילא מים היום', severity: 'medium' });
        if (level === 'green') level = 'yellow';
      }

      // Check workouts
      if (weekWorkouts.length === 0) {
        alerts.push({ type: 'no_workout_week', label: 'לא הזין אימון השבוע', severity: 'medium' });
        if (level === 'green') level = 'yellow';
      }

      // Check metrics
      if (recentMetrics.length === 0) {
        alerts.push({ type: 'no_metrics', label: 'לא עדכן מדדים 7 ימים', severity: 'low' });
        if (level === 'green') level = 'yellow';
      }

      // Check inactivity (only if they were active before)
      if (trainee.last_login_at) {
        const lastLogin = new Date(trainee.last_login_at);
        const daysSinceLogin = Math.floor((new Date() - lastLogin) / (1000 * 60 * 60 * 24));
        if (daysSinceLogin >= 2) {
          alerts.push({ type: 'inactive_days', label: `לא נכנס ${daysSinceLogin} ימים`, severity: 'high' });
          level = 'red';
        }
      }

      return {
        trainee,
        alerts,
        level,
        todayMealsCount: todayMeals.length,
        todayWaterCount: todayWater.length,
        weekWorkoutsCount: weekWorkouts.length,
      };
    });
  }, [trainees, allMeals, allWater, allWorkouts, allMetrics, today, weekAgo]);

  const filteredStatuses = traineeStatuses.filter(status => {
    const matchesSearch = status.trainee.full_name?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesLevel = filterLevel === 'all' || status.level === filterLevel;
    const matchesType = filterType === 'all' || status.alerts.some(a => a.type === filterType);
    return matchesSearch && matchesLevel && matchesType;
  });

  const handleSendMessage = (trainee, alertType) => {
    setSendingTo(trainee);
    setSelectedTemplate(ALERT_TEMPLATES[alertType] || ALERT_TEMPLATES.no_nutrition);
  };

  const greenCount = traineeStatuses.filter(s => s.level === 'green').length;
  const yellowCount = traineeStatuses.filter(s => s.level === 'yellow').length;
  const redCount = traineeStatuses.filter(s => s.level === 'red').length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4 text-center bg-green-50 border-green-200">
          <CheckCircle2 className="w-8 h-8 text-green-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-green-700">{greenCount}</p>
          <p className="text-sm text-green-600">עומדים ביעדים</p>
        </Card>
        <Card className="p-4 text-center bg-amber-50 border-amber-200">
          <AlertCircle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-amber-700">{yellowCount}</p>
          <p className="text-sm text-amber-600">חסר משהו</p>
        </Card>
        <Card className="p-4 text-center bg-red-50 border-red-200">
          <AlertCircle className="w-8 h-8 text-red-600 mx-auto mb-2" />
          <p className="text-3xl font-bold text-red-700">{redCount}</p>
          <p className="text-sm text-red-600">דורש תשומת לב</p>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חפש מתאמן..."
              className="pr-10"
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterLevel === 'all' ? 'default' : 'outline'}
              onClick={() => setFilterLevel('all')}
              size="sm"
            >
              הכל
            </Button>
            <Button
              variant={filterLevel === 'green' ? 'default' : 'outline'}
              onClick={() => setFilterLevel('green')}
              size="sm"
              className={filterLevel === 'green' ? 'bg-green-600' : ''}
            >
              ירוק
            </Button>
            <Button
              variant={filterLevel === 'yellow' ? 'default' : 'outline'}
              onClick={() => setFilterLevel('yellow')}
              size="sm"
              className={filterLevel === 'yellow' ? 'bg-amber-600' : ''}
            >
              צהוב
            </Button>
            <Button
              variant={filterLevel === 'red' ? 'default' : 'outline'}
              onClick={() => setFilterLevel('red')}
              size="sm"
              className={filterLevel === 'red' ? 'bg-red-600' : ''}
            >
              אדום
            </Button>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            className="mr-auto"
          >
            <RefreshCw className="w-4 h-4 ml-1" />
            רענן
          </Button>
        </div>
      </Card>

      {/* Trainees List */}
      <div className="space-y-3">
        {filteredStatuses.length === 0 ? (
          <Card className="p-12 text-center">
            <CheckCircle2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500">לא נמצאו התראות</p>
          </Card>
        ) : (
          filteredStatuses.map(({ trainee, alerts, level, todayMealsCount, todayWaterCount, weekWorkoutsCount }) => (
            <Card key={trainee.id} className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-slate-800">{trainee.full_name}</h3>
                    {level === 'green' && (
                      <Badge className="bg-green-100 text-green-800">
                        <CheckCircle2 className="w-3 h-3 ml-1" />
                        מצוין
                      </Badge>
                    )}
                    {level === 'yellow' && (
                      <Badge className="bg-amber-100 text-amber-800">
                        <AlertCircle className="w-3 h-3 ml-1" />
                        יכול יותר
                      </Badge>
                    )}
                    {level === 'red' && (
                      <Badge className="bg-red-100 text-red-800">
                        <AlertCircle className="w-3 h-3 ml-1" />
                        דורש תשומת לב
                      </Badge>
                    )}
                  </div>

                  {/* Status Today */}
                  <div className="flex flex-wrap gap-4 text-sm text-slate-600 mb-2">
                    <div className="flex items-center gap-1">
                      <span className={todayMealsCount > 0 ? 'text-green-600' : 'text-red-600'}>
                        {todayMealsCount > 0 ? '✓' : '✗'}
                      </span>
                      תזונה: {todayMealsCount} ארוחות
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={todayWaterCount > 0 ? 'text-green-600' : 'text-red-600'}>
                        {todayWaterCount > 0 ? '✓' : '✗'}
                      </span>
                      מים: {todayWaterCount > 0 ? 'הוזן' : 'לא הוזן'}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={weekWorkoutsCount > 0 ? 'text-green-600' : 'text-orange-600'}>
                        {weekWorkoutsCount > 0 ? '✓' : '⚠'}
                      </span>
                      אימונים: {weekWorkoutsCount} השבוע
                    </div>
                  </div>

                  {/* Alerts */}
                  {alerts.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {alerts.map((alert, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={
                              alert.severity === 'high' ? 'bg-red-50 text-red-700 border-red-200' :
                              alert.severity === 'medium' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                              'bg-slate-50 text-slate-700 border-slate-200'
                            }
                          >
                            {alert.label}
                          </Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleSendMessage(trainee, alert.type)}
                            className="text-blue-600 hover:text-blue-700 h-6 px-2"
                          >
                            <Send className="w-3 h-3 ml-1" />
                            שלח
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      {/* Send Message Dialog */}
      {sendingTo && selectedTemplate && (
        <SendMessageDialog
          open={!!sendingTo}
          onClose={() => {
            setSendingTo(null);
            setSelectedTemplate(null);
          }}
          trainees={trainees}
          coachEmail={coachEmail}
          preselectedTrainee={sendingTo}
          prefilledTemplate={selectedTemplate}
        />
      )}
    </div>
  );
}