import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sparkles, Loader2, Send, FileText, Zap, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';

export default function CoachAIAssistant({ open, onClose, trainee }) {
  const [activeTab, setActiveTab] = useState('workout');
  const [customPrompt, setCustomPrompt] = useState('');
  const [generatedContent, setGeneratedContent] = useState(null);
  const [feedbackResult, setFeedbackResult] = useState(null);
  const [automatedMessages, setAutomatedMessages] = useState([]);

  // Fetch trainee data for context
  const { data: recentMeals = [] } = useQuery({
    queryKey: ['recentMeals', trainee?.user_email],
    queryFn: () => base44.entities.MealEntry.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email && open,
  });

  const { data: recentWorkouts = [] } = useQuery({
    queryKey: ['recentWorkouts', trainee?.user_email],
    queryFn: () => base44.entities.WorkoutSession.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email && open,
  });

  const { data: measurements = [] } = useQuery({
    queryKey: ['measurements', trainee?.user_email],
    queryFn: () => base44.entities.BodyMeasurement.filter({ trainee_email: trainee?.user_email }),
    enabled: !!trainee?.user_email && open,
  });

  // Generate Workout Plan
  const generateWorkoutMutation = useMutation({
    mutationFn: async () => {
      const context = `
מתאמן: ${trainee.full_name}
גובה: ${trainee.height_cm || 'לא צוין'} ס"מ
מגדר: ${trainee.gender === 'male' ? 'גבר' : 'אישה'}
יעדי תזונה: ${trainee.target_calories} קלוריות, ${trainee.target_protein}ג' חלבון
אימונים אחרונים (${recentWorkouts.slice(-5).length}): ${recentWorkouts.slice(-5).map(w => `${w.workout_name || 'אימון'} - ${w.duration_minutes || 0} דקות`).join(', ')}
מדידות משקל אחרונות: ${measurements.slice(-3).map(m => `${m.weight_kg}ק"ג ב-${m.date}`).join(', ')}
`;

      const prompt = `אתה מאמן כושר מקצועי. צור תוכנית אימון שבועית מותאמת אישית למתאמן הבא:

${context}

התוכנית חייבת לכלול:
1. 3-4 אימונים בשבוע
2. חלוקה לפי קבוצות שריר
3. מספר סטים וחזרות לכל תרגיל
4. זמן מנוחה מומלץ
5. טיפים לביצוע נכון

פורמט הפלט:
{
  "program_title": "שם התוכנית",
  "duration_weeks": 4,
  "workouts": [
    {
      "day": "יום ראשון",
      "focus": "חזה וטריצפס",
      "exercises": [
        {
          "name": "שכיבות סמיכה",
          "sets": 4,
          "reps": "8-12",
          "rest_seconds": 90,
          "notes": "שמור על טכניקה נכונה"
        }
      ]
    }
  ],
  "tips": ["טיפ 1", "טיפ 2"]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            program_title: { type: 'string' },
            duration_weeks: { type: 'number' },
            workouts: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'string' },
                  focus: { type: 'string' },
                  exercises: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        name: { type: 'string' },
                        sets: { type: 'number' },
                        reps: { type: 'string' },
                        rest_seconds: { type: 'number' },
                        notes: { type: 'string' }
                      }
                    }
                  }
                }
              }
            },
            tips: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setGeneratedContent(data);
      toast.success('תוכנית אימון נוצרה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה ביצירת תוכנית אימון');
    }
  });

  // Generate Nutrition Plan
  const generateNutritionMutation = useMutation({
    mutationFn: async () => {
      const lastWeekMeals = recentMeals.slice(-21);
      const avgCalories = lastWeekMeals.reduce((sum, m) => sum + (m.calories || 0), 0) / Math.max(lastWeekMeals.length, 1);
      const avgProtein = lastWeekMeals.reduce((sum, m) => sum + (m.protein || 0), 0) / Math.max(lastWeekMeals.length, 1);

      const context = `
מתאמן: ${trainee.full_name}
יעדים תזונתיים: ${trainee.target_calories} קלוריות, ${trainee.target_protein}ג' חלבון, ${trainee.target_carbs}ג' פחמימות, ${trainee.target_fat}ג' שומן
צריכה ממוצעת בשבוע האחרון: ${Math.round(avgCalories)} קלוריות, ${Math.round(avgProtein)}ג' חלבון
משקל נוכחי: ${measurements[0]?.weight_kg || 'לא ידוע'}ק"ג
`;

      const prompt = `אתה תזונאי ספורט מקצועי. צור תוכנית תזונה שבועית מותאמת אישית למתאמן:

${context}

התוכנית חייבת לכלול:
1. פירוט ארוחות ליום טיפוסי (ארוחות בוקר, צהריים, ערב וחטיפים)
2. כמויות מדויקות של מזון
3. חישוב קלוריות ומאקרו לכל ארוחה
4. המלצות כלליות
5. תחליפים אפשריים

פורמט הפלט בעברית:
{
  "plan_title": "שם התוכנית",
  "daily_meals": [
    {
      "meal_type": "ארוחת בוקר",
      "items": [
        {
          "food": "ביצים",
          "amount": "3 יחידות",
          "calories": 210,
          "protein": 18,
          "carbs": 2,
          "fat": 15
        }
      ],
      "total_calories": 500,
      "notes": "הערות"
    }
  ],
  "weekly_tips": ["טיפ 1", "טיפ 2"],
  "substitutions": ["תחליף 1", "תחליף 2"]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            plan_title: { type: 'string' },
            daily_meals: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  meal_type: { type: 'string' },
                  items: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        food: { type: 'string' },
                        amount: { type: 'string' },
                        calories: { type: 'number' },
                        protein: { type: 'number' },
                        carbs: { type: 'number' },
                        fat: { type: 'number' }
                      }
                    }
                  },
                  total_calories: { type: 'number' },
                  notes: { type: 'string' }
                }
              }
            },
            weekly_tips: { type: 'array', items: { type: 'string' } },
            substitutions: { type: 'array', items: { type: 'string' } }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setGeneratedContent(data);
      toast.success('תוכנית תזונה נוצרה בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה ביצירת תוכנית תזונה');
    }
  });

  // Generate Feedback
  const generateFeedbackMutation = useMutation({
    mutationFn: async () => {
      const lastWeekMeals = recentMeals.slice(-21);
      const lastWeekWorkouts = recentWorkouts.slice(-7);
      
      const avgCalories = lastWeekMeals.reduce((sum, m) => sum + (m.calories || 0), 0) / Math.max(lastWeekMeals.length, 1);
      const workoutDays = new Set(lastWeekWorkouts.map(w => w.date)).size;

      const context = `
מתאמן: ${trainee.full_name}
יעדים: ${trainee.target_calories} קלוריות, ${trainee.target_protein}ג' חלבון
ביצועים בשבוע האחרון:
- ארוחות נרשמו: ${lastWeekMeals.length}
- ממוצע קלוריות: ${Math.round(avgCalories)}
- ימי אימון: ${workoutDays}
- אימונים: ${lastWeekWorkouts.length}
משקל נוכחי: ${measurements[0]?.weight_kg || 'לא ידוע'}ק"ג
מגמת משקל (3 אחרונים): ${measurements.slice(-3).map(m => m.weight_kg).join('ק"ג → ')}ק"ג
`;

      const prompt = `אתה מאמן אישי מקצועי. נתח את הביצועים של המתאמן ותן משוב מפורט:

${context}

הכן משוב שכולל:
1. ניתוח כללי של ההתקדמות
2. נקודות חזקות (2-3)
3. תחומים לשיפור (2-3)
4. המלצות קונקרטיות לשבוע הבא
5. מסר מעודד ומוטיבציה

פורמט הפלט:
{
  "overall_assessment": "ניתוח כללי",
  "strengths": ["חוזק 1", "חוזק 2"],
  "areas_to_improve": ["שיפור 1", "שיפור 2"],
  "recommendations": ["המלצה 1", "המלצה 2"],
  "motivation_message": "מסר מעודד",
  "score": 85
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            overall_assessment: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            areas_to_improve: { type: 'array', items: { type: 'string' } },
            recommendations: { type: 'array', items: { type: 'string' } },
            motivation_message: { type: 'string' },
            score: { type: 'number' }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setFeedbackResult(data);
      toast.success('משוב נוצר בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה ביצירת משוב');
    }
  });

  // Send Automated Message
  const sendMessageMutation = useMutation({
    mutationFn: async (messageText) => {
      await base44.entities.Message.create({
        coach_email: trainee.coach_email,
        trainee_email: trainee.user_email,
        sender_role: 'coach',
        text: messageText,
      });
    },
    onSuccess: () => {
      toast.success('הודעה נשלחה למתאמן');
    },
  });

  // Generate Automated Messages
  const generateAutomatedMessagesMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const todayMeals = recentMeals.filter(m => m.date === today);
      const todayWorkouts = recentWorkouts.filter(w => w.date === today);
      
      const todayCalories = todayMeals.reduce((sum, m) => sum + (m.calories || 0), 0);
      const todayProtein = todayMeals.reduce((sum, m) => sum + (m.protein || 0), 0);
      const todayCarbs = todayMeals.reduce((sum, m) => sum + (m.carbs || 0), 0);
      const todayFat = todayMeals.reduce((sum, m) => sum + (m.fat || 0), 0);

      const context = `
מתאמן: ${trainee.full_name}
יעדים יומיים: ${trainee.target_calories} קלוריות, ${trainee.target_protein}ג' חלבון, ${trainee.target_carbs}ג' פחמימות, ${trainee.target_fat}ג' שומן
ביצועים היום (${today}):
- קלוריות: ${todayCalories}/${trainee.target_calories} (${Math.round((todayCalories/trainee.target_calories)*100)}%)
- חלבון: ${Math.round(todayProtein)}/${trainee.target_protein}ג' (${Math.round((todayProtein/trainee.target_protein)*100)}%)
- פחמימות: ${Math.round(todayCarbs)}/${trainee.target_carbs}ג'
- שומן: ${Math.round(todayFat)}/${trainee.target_fat}ג'
- אימונים: ${todayWorkouts.length}
- ארוחות נרשמו: ${todayMeals.length}
`;

      const prompt = `אתה מאמן אישי מקצועי. צור 3-5 הודעות אוטומטיות מותאמות אישית למתאמן על בסיס הנתונים:

${context}

כל הודעה חייבת להיות:
1. ממוקדת בנושא אחד ספציפי (חלבון, קלוריות, אימון, וכו')
2. קצרה ואישית (2-3 שורות)
3. מעודדת וחיובית
4. עם emoji רלוונטי
5. עם המלצה קונקרטית

סוגי הודעות אפשריות:
- דפוסי צריכה (למשל: חסר חלבון, עודף קלוריות)
- סטטוס פעילות (כל הכבוד על אימון, חסר אימון)
- השגת יעדים (כל הכבוד על השגת יעד)
- תזכורות (לא רשמת ארוחות, שכחת לשתות מים)

פורמט:
{
  "messages": [
    {
      "type": "nutrition_pattern",
      "title": "כותרת קצרה",
      "message": "תוכן ההודעה",
      "priority": "high|medium|low"
    }
  ]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            messages: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: { type: 'string' },
                  title: { type: 'string' },
                  message: { type: 'string' },
                  priority: { type: 'string' }
                }
              }
            }
          }
        }
      });

      return response;
    },
    onSuccess: (data) => {
      setAutomatedMessages(data.messages || []);
      toast.success('הודעות נוצרו בהצלחה');
    },
    onError: () => {
      toast.error('שגיאה ביצירת הודעות');
    }
  });

  const handleSendFeedback = () => {
    if (feedbackResult) {
      const message = `📊 משוב שבועי - ${trainee.full_name}

${feedbackResult.overall_assessment}

💪 נקודות חזקות:
${feedbackResult.strengths.map((s, i) => `${i + 1}. ${s}`).join('\n')}

📈 תחומים לשיפור:
${feedbackResult.areas_to_improve.map((a, i) => `${i + 1}. ${a}`).join('\n')}

🎯 המלצות לשבוע הבא:
${feedbackResult.recommendations.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${feedbackResult.motivation_message}

ציון התמדה: ${feedbackResult.score}/100`;

      sendMessageMutation.mutate(message);
    }
  };

  const handleSendPlan = () => {
    if (generatedContent) {
      let message = '';
      
      if (activeTab === 'workout' && generatedContent.program_title) {
        message = `🏋️ ${generatedContent.program_title}

משך התוכנית: ${generatedContent.duration_weeks} שבועות

${generatedContent.workouts.map(w => `
📅 ${w.day} - ${w.focus}
${w.exercises.map(e => `  • ${e.name}: ${e.sets}x${e.reps} (מנוחה: ${e.rest_seconds}ש')
    ${e.notes}`).join('\n')}
`).join('\n')}

💡 טיפים:
${generatedContent.tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}`;
      } else if (activeTab === 'nutrition' && generatedContent.plan_title) {
        message = `🍽️ ${generatedContent.plan_title}

${generatedContent.daily_meals.map(m => `
${m.meal_type} (${m.total_calories} קלוריות):
${m.items.map(i => `  • ${i.food} - ${i.amount} (${i.calories} קל', ${i.protein}ג' חלבון)`).join('\n')}
📝 ${m.notes}
`).join('\n')}

💡 טיפים שבועיים:
${generatedContent.weekly_tips.map((t, i) => `${i + 1}. ${t}`).join('\n')}

🔄 תחליפים אפשריים:
${generatedContent.substitutions.map((s, i) => `${i + 1}. ${s}`).join('\n')}`;
      }

      sendMessageMutation.mutate(message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="w-6 h-6" style={{ color: '#79DBD6' }} />
            AI Coach Assistant - {trainee?.full_name}
          </DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="w-full">
            <TabsTrigger value="workout">תוכנית אימון</TabsTrigger>
            <TabsTrigger value="nutrition">תוכנית תזונה</TabsTrigger>
            <TabsTrigger value="feedback">משוב חכם</TabsTrigger>
            <TabsTrigger value="automated">הודעות אוטומטיות</TabsTrigger>
          </TabsList>

          {/* Workout Plan */}
          <TabsContent value="workout" className="space-y-4">
            <Card className="p-4">
              <Button
                onClick={() => generateWorkoutMutation.mutate()}
                disabled={generateWorkoutMutation.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {generateWorkoutMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מייצר תוכנית...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 ml-2" />
                    צור תוכנית אימון מותאמת
                  </>
                )}
              </Button>
            </Card>

            {generatedContent && generatedContent.program_title && (
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">{generatedContent.program_title}</h3>
                <p className="text-sm text-slate-600 mb-4">משך: {generatedContent.duration_weeks} שבועות</p>
                
                <div className="space-y-4">
                  {generatedContent.workouts.map((workout, i) => (
                    <div key={i} className="border-r-4 pr-4" style={{ borderColor: '#79DBD6' }}>
                      <h4 className="font-bold text-lg">{workout.day}</h4>
                      <p className="text-sm text-slate-600 mb-2">{workout.focus}</p>
                      <div className="space-y-2">
                        {workout.exercises.map((ex, j) => (
                          <div key={j} className="bg-slate-50 p-3 rounded">
                            <p className="font-medium">{ex.name}</p>
                            <p className="text-sm text-slate-600">
                              {ex.sets} סטים × {ex.reps} חזרות | מנוחה: {ex.rest_seconds}ש'
                            </p>
                            <p className="text-xs text-slate-500 mt-1">{ex.notes}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-bold mb-2">💡 טיפים:</h4>
                  <ul className="text-sm space-y-1">
                    {generatedContent.tips.map((tip, i) => (
                      <li key={i}>• {tip}</li>
                    ))}
                  </ul>
                </div>

                <Button
                  onClick={handleSendPlan}
                  disabled={sendMessageMutation.isPending}
                  className="w-full mt-4"
                  variant="outline"
                >
                  <Send className="w-4 h-4 ml-2" />
                  שלח תוכנית למתאמן
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* Nutrition Plan */}
          <TabsContent value="nutrition" className="space-y-4">
            <Card className="p-4">
              <Button
                onClick={() => generateNutritionMutation.mutate()}
                disabled={generateNutritionMutation.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {generateNutritionMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מייצר תוכנית...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 ml-2" />
                    צור תוכנית תזונה מותאמת
                  </>
                )}
              </Button>
            </Card>

            {generatedContent && generatedContent.plan_title && (
              <Card className="p-6">
                <h3 className="text-xl font-bold mb-4">{generatedContent.plan_title}</h3>
                
                <div className="space-y-4">
                  {generatedContent.daily_meals.map((meal, i) => (
                    <div key={i} className="border rounded-lg p-4">
                      <h4 className="font-bold text-lg mb-2">{meal.meal_type}</h4>
                      <p className="text-sm font-medium text-emerald-600 mb-3">
                        סה"כ: {meal.total_calories} קלוריות
                      </p>
                      <div className="space-y-2">
                        {meal.items.map((item, j) => (
                          <div key={j} className="bg-slate-50 p-2 rounded text-sm">
                            <p className="font-medium">{item.food} - {item.amount}</p>
                            <p className="text-xs text-slate-600">
                              {item.calories} קל' | {item.protein}ג' חלבון | {item.carbs}ג' פחמימות | {item.fat}ג' שומן
                            </p>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 mt-2">{meal.notes}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-bold mb-2">💡 טיפים שבועיים:</h4>
                    <ul className="text-sm space-y-1">
                      {generatedContent.weekly_tips.map((tip, i) => (
                        <li key={i}>• {tip}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="p-4 bg-yellow-50 rounded-lg">
                    <h4 className="font-bold mb-2">🔄 תחליפים:</h4>
                    <ul className="text-sm space-y-1">
                      {generatedContent.substitutions.map((sub, i) => (
                        <li key={i}>• {sub}</li>
                      ))}
                    </ul>
                  </div>
                </div>

                <Button
                  onClick={handleSendPlan}
                  disabled={sendMessageMutation.isPending}
                  className="w-full mt-4"
                  variant="outline"
                >
                  <Send className="w-4 h-4 ml-2" />
                  שלח תוכנית למתאמן
                </Button>
              </Card>
            )}
          </TabsContent>

          {/* Automated Messages */}
          <TabsContent value="automated" className="space-y-4">
            <Card className="p-4">
              <p className="text-sm text-slate-600 mb-4">
                צור הודעות אוטומטיות מותאמות אישית על בסיס דפוסי צריכה, פעילות והשגת יעדים של המתאמן.
              </p>
              <Button
                onClick={() => generateAutomatedMessagesMutation.mutate()}
                disabled={generateAutomatedMessagesMutation.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {generateAutomatedMessagesMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מנתח ומייצר הודעות...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 ml-2" />
                    צור הודעות אוטומטיות
                  </>
                )}
              </Button>
            </Card>

            {automatedMessages.length > 0 && (
              <div className="space-y-3">
                {automatedMessages.map((msg, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-slate-800">{msg.title}</h4>
                          <span className={`text-xs px-2 py-1 rounded ${
                            msg.priority === 'high' ? 'bg-red-100 text-red-700' :
                            msg.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {msg.priority === 'high' ? 'דחוף' : 
                             msg.priority === 'medium' ? 'בינוני' : 'רגיל'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mb-2">
                          {msg.type === 'nutrition_pattern' ? '🍽️ דפוסי צריכה' :
                           msg.type === 'activity_status' ? '💪 סטטוס פעילות' :
                           msg.type === 'goal_achievement' ? '🎯 השגת יעדים' :
                           '💬 כללי'}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-700 mb-3 whitespace-pre-wrap">{msg.message}</p>
                    <Button
                      size="sm"
                      onClick={() => sendMessageMutation.mutate(msg.message)}
                      disabled={sendMessageMutation.isPending}
                      variant="outline"
                      className="w-full"
                    >
                      <Send className="w-4 h-4 ml-2" />
                      שלח הודעה זו
                    </Button>
                  </Card>
                ))}

                <Card className="p-4 bg-blue-50">
                  <p className="text-sm font-medium text-blue-900 mb-3">
                    💡 האם לשלוח את כל ההודעות ביחד?
                  </p>
                  <Button
                    onClick={() => {
                      const combinedMessage = automatedMessages
                        .map((msg, i) => `${i + 1}. ${msg.title}\n${msg.message}`)
                        .join('\n\n━━━━━━━━━━━━━━━\n\n');
                      sendMessageMutation.mutate(combinedMessage);
                    }}
                    disabled={sendMessageMutation.isPending}
                    className="w-full"
                    style={{ backgroundColor: '#79DBD6' }}
                  >
                    <MessageSquare className="w-4 h-4 ml-2" />
                    שלח את כל ההודעות למתאמן
                  </Button>
                </Card>
              </div>
            )}
          </TabsContent>

          {/* Feedback */}
          <TabsContent value="feedback" className="space-y-4">
            <Card className="p-4">
              <Button
                onClick={() => generateFeedbackMutation.mutate()}
                disabled={generateFeedbackMutation.isPending}
                className="w-full"
                style={{ backgroundColor: '#79DBD6' }}
              >
                {generateFeedbackMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 ml-2 animate-spin" />
                    מנתח נתונים...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 ml-2" />
                    צור משוב חכם
                  </>
                )}
              </Button>
            </Card>

            {feedbackResult && (
              <Card className="p-6">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-xl font-bold">משוב שבועי</h3>
                  <div className="text-3xl font-bold" style={{ color: '#79DBD6' }}>
                    {feedbackResult.score}/100
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h4 className="font-bold mb-2">📊 ניתוח כללי</h4>
                    <p className="text-sm">{feedbackResult.overall_assessment}</p>
                  </div>

                  <div className="p-4 bg-green-50 rounded-lg">
                    <h4 className="font-bold mb-2">💪 נקודות חזקות</h4>
                    <ul className="text-sm space-y-1">
                      {feedbackResult.strengths.map((s, i) => (
                        <li key={i}>✓ {s}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-orange-50 rounded-lg">
                    <h4 className="font-bold mb-2">📈 תחומים לשיפור</h4>
                    <ul className="text-sm space-y-1">
                      {feedbackResult.areas_to_improve.map((a, i) => (
                        <li key={i}>• {a}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-bold mb-2">🎯 המלצות לשבוע הבא</h4>
                    <ul className="text-sm space-y-1">
                      {feedbackResult.recommendations.map((r, i) => (
                        <li key={i}>→ {r}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 rounded-lg">
                    <h4 className="font-bold mb-2">💬 מסר מוטיבציה</h4>
                    <p className="text-sm italic">{feedbackResult.motivation_message}</p>
                  </div>
                </div>

                <Button
                  onClick={handleSendFeedback}
                  disabled={sendMessageMutation.isPending}
                  className="w-full mt-4"
                  variant="outline"
                >
                  <Send className="w-4 h-4 ml-2" />
                  שלח משוב למתאמן
                </Button>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}