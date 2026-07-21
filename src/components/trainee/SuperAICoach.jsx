import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { base44 } from '@/api/base44Client';
import { Sparkles, Loader2, Send, X, TrendingUp, Utensils, Dumbbell, Droplets, ChevronRight, User } from "lucide-react";
import { format, subDays } from 'date-fns';
import { detectMutationIntent, getMutationFailureMessage } from '@/utils/mealMutationDetector';

// ─── helpers ──────────────────────────────────────────────────────────────────

const buildNutritionContext = (trainee, meals) => {
  const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
  const prev7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i + 7), 'yyyy-MM-dd'));

  const mealsLast7 = (meals || []).filter(m => m?.date && last7Days.includes(m.date));
  const mealsPrev7 = (meals || []).filter(m => m?.date && prev7Days.includes(m.date));

  const calcAvg = (list, days) => {
    if (!list.length) return { calories: 0, protein: 0, carbs: 0, fat: 0, daysWithData: 0, consistency: 0 };
    const grouped = {};
    list.forEach(m => { if (!grouped[m.date]) grouped[m.date] = []; grouped[m.date].push(m); });
    const daysWithData = Object.keys(grouped).length;
    const sum = (key) => list.reduce((s, m) => s + (m[key] || 0), 0);
    return {
      calories: Math.round(sum('calories') / daysWithData),
      protein: Math.round(sum('protein') / daysWithData),
      carbs: Math.round(sum('carbs') / daysWithData),
      fat: Math.round(sum('fat') / daysWithData),
      daysWithData,
      consistency: Math.round((daysWithData / days) * 100)
    };
  };

  const avg7 = calcAvg(mealsLast7, 7);
  const avgPrev7 = calcAvg(mealsPrev7, 7);
  const targetCals = trainee?.target_calories || 2000;
  const targetProtein = trainee?.target_protein || 150;
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const todayMeals = (meals || []).filter(m => m.date === todayStr);
  const todayCals = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
  const todayProtein = todayMeals.reduce((s, m) => s + (m.protein || 0), 0);

  return `📊 פרופיל: ${trainee?.gender === 'male' ? 'גבר' : 'אישה'}, ${trainee?.weight_kg || '?'}ק"ג, יעד: ${trainee?.goal === 'lose' ? 'ירידה' : trainee?.goal === 'gain' ? 'עלייה' : 'שמירה'}
🎯 יעדים: ${targetCals}קל׳ | ${targetProtein}ג׳ חלבון
📅 היום: ${todayCals}קל׳ (${Math.round((todayCals/targetCals)*100)}%) | ${todayProtein}ג׳ חלבון (${Math.round((todayProtein/targetProtein)*100)}%)
📈 שבוע: ${avg7.calories}קל׳ ממוצע (${avg7.consistency}% עקביות) | ${avg7.protein}ג׳ חלבון
🔄 שבוע קודם: ${avgPrev7.calories || 0}קל׳ | ${avgPrev7.protein || 0}ג׳ חלבון
📝 היום בפועל: ${todayMeals.map(m => `${m.food_name}(${m.calories}קל׳)`).join(', ') || 'לא נרשם עדיין'}`;
};

const buildTrainingContext = (workouts) => {
  const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
  const workouts7 = (workouts || []).filter(w => w?.date && last7Days.includes(w.date));
  const lastWorkout = workouts7[0];
  const daysSince = lastWorkout ? Math.floor((new Date() - new Date(lastWorkout.date)) / 86400000) : null;

  return `🏋️ אימון אחרון: ${lastWorkout ? `${lastWorkout.workout_name || 'אימון'} לפני ${daysSince} ימים` : 'לא נמצא שבוע אחרון'}
📊 שבוע אחרון: ${workouts7.length} אימונים`;
};

const buildFullContext = (trainee, meals, water, workouts) => {
  return buildNutritionContext(trainee, meals) + '\n\n' + buildTrainingContext(workouts);
};

// ─── Daily Insight Card ────────────────────────────────────────────────────────

const InsightCard = ({ icon: Icon, title, value, color, onClick }) => (
  <button
    onClick={onClick}
    className="flex items-center gap-3 p-3 rounded-xl border border-slate-700 bg-slate-800/60 hover:bg-slate-700/60 transition-all text-right w-full"
  >
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${color}`}>
      <Icon className="w-4 h-4 text-white" />
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-xs text-slate-400">{title}</p>
      <p className="text-sm font-medium text-white truncate">{value}</p>
    </div>
    <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0 rotate-180" />
  </button>
);

// ─── Message Bubble ────────────────────────────────────────────────────────────

const EliorAvatar = ({ size = 7 }) => (
  <div className={`w-${size} h-${size} rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden border-2 border-teal-400/50`}
    style={{ background: 'linear-gradient(135deg, #79DBD6, #5BC5C0)' }}>
    <span className="text-white font-bold" style={{ fontSize: size === 7 ? '13px' : '10px' }}>א</span>
  </div>
);

const MessageBubble = ({ msg }) => {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-start' : 'justify-end'} mb-3`}>
      {!isUser && <EliorAvatar size={7} />}
      <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ml-2 mr-2 ${
        isUser
          ? 'bg-slate-700 text-white rounded-br-sm'
          : 'text-white rounded-bl-sm'
      }`}
        style={!isUser ? { background: 'linear-gradient(135deg, #1e3a3a, #1a3030)' } : {}}
      >
        {msg.content}
        {msg.loading && (
          <span className="inline-flex gap-1 mr-1">
            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
          </span>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0 text-xs text-white font-bold">
          א
        </div>
      )}
    </div>
  );
};

// ─── Main Component ────────────────────────────────────────────────────────────

const ELIOR_GREETING = (name) => `היי${name ? ` ${name}` : ''}! 👋 אני אליאור, העוזר האישי שלך לכושר ותזונה. אשמח לעזור לך היום — שאל אותי כל שאלה!`;

export default function SuperAICoach({ open, onClose, trainee, meals, water, workouts, measurements }) {
  const firstName = trainee?.full_name?.split(' ')[0] || '';
  const [messages, setMessages] = useState([{ role: 'assistant', content: ELIOR_GREETING(firstName) }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [dailyInsights, setDailyInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [view, setView] = useState('home'); // 'home' | 'chat'
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Auto-analyze when opened
  useEffect(() => {
    if (open && !dailyInsights) {
      generateDailyInsights();
    }
  }, [open]);

  const generateDailyInsights = async () => {
    setInsightsLoading(true);
    const context = buildFullContext(trainee, meals, water, workouts);
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const todayMeals = (meals || []).filter(m => m.date === todayStr);
    const todayCals = todayMeals.reduce((s, m) => s + (m.calories || 0), 0);
    const todayProtein = todayMeals.reduce((s, m) => s + (m.protein || 0), 0);
    const targetCals = trainee?.target_calories || 2000;
    const targetProtein = trainee?.target_protein || 150;
    const last7Days = Array.from({ length: 7 }, (_, i) => format(subDays(new Date(), i), 'yyyy-MM-dd'));
    const workouts7 = (workouts || []).filter(w => w?.date && last7Days.includes(w.date));

    try {
      const res = await base44.functions.invoke('askAICoach', {
        prompt: `אתה AI Coach מנתח נתוני מתאמן ונותן 3 תובנות יומיות קצרות.

${context}

החזר JSON בלבד (ללא markdown):
{
  "insights": [
    {"type": "nutrition", "title": "כותרת קצרה", "text": "תובנה חכמה קצרה"},
    {"type": "training", "title": "כותרת קצרה", "text": "תובנה חכמה קצרה"},
    {"type": "score", "title": "ציון יומי", "text": "ציון + משפט קצר"}
  ],
  "daily_summary": "סיכום יומי בשורה אחת חכמה ומותאמת אישית"
}`,
        json_mode: true,
      });
      const result = res?.data?.response;
      setDailyInsights(result);
    } catch (e) {
      // fallback insights
      const calPct = Math.round((todayCals / targetCals) * 100);
      setDailyInsights({
        insights: [
          { type: 'nutrition', title: 'קלוריות היום', text: `${todayCals}/${targetCals} קל׳ (${calPct}%)` },
          { type: 'nutrition', title: 'חלבון היום', text: `${todayProtein}/${targetProtein}ג׳` },
          { type: 'training', title: 'אימונים השבוע', text: `${workouts7.length} אימונים` },
        ],
        daily_summary: 'המשך כך!'
      });
    } finally {
      setInsightsLoading(false);
    }
  };

  // ── handleMutation ───────────────────────────────────────────────────────────
  // Called when sendMessage detects a plan mutation intent.
  // Routes to routeMealFeedback (the canonical mutation endpoint) and only claims
  // success when the backend confirms changed === true with verified state.
  // Never returns success text based on AI prose alone.
  const handleMutation = async (intent, userText) => {
    // Look up the trainee's active plan — entity API enforces ownership
    let activePlan = null;
    try {
      const plans = await base44.entities.PersonalMealPlan.filter({
        trainee_id: trainee?.id,
        is_active:  true,
      });
      activePlan = plans?.[0] || null;
    } catch (err) {
      console.error('[SuperAICoach] plan lookup failed:', err.message);
    }

    if (!activePlan) {
      setMessages(prev => prev.filter(m => !m.loading).concat({
        role: 'assistant',
        content: 'אין לך תפריט פעיל כרגע. עבור לדף "התפריט שלי" כדי ליצור תפריט חדש.',
      }));
      return;
    }

    let res;
    try {
      res = await base44.functions.invoke('routeMealFeedback', {
        plan_id:              activePlan.id,
        feedback:             userText,
        day_index:            0,
        caller_trainee_email: trainee?.user_email || null,
      });
    } catch (err) {
      console.error('[SuperAICoach] routeMealFeedback failed:', err.message);
      setMessages(prev => prev.filter(m => !m.loading).concat({
        role: 'assistant',
        content: 'שגיאה בביצוע השינוי. לא נשמרו שינויים. נסה שוב.',
      }));
      return;
    }

    // Backend returned a typed error
    if (res?.ok === false) {
      const safeMsg = res.safe_error || res.error || 'שגיאה פנימית — השינוי לא בוצע.';
      setMessages(prev => prev.filter(m => !m.loading).concat({
        role: 'assistant',
        content: `לא ניתן לבצע את השינוי: ${safeMsg}`,
      }));
      return;
    }

    // Async job started — we can't poll here; direct user to /MyMealPlan
    if (res?.action === 'adapt_existing_job') {
      setMessages(prev => prev.filter(m => !m.loading).concat({
        role: 'assistant',
        content: 'עדכון התפריט התחיל! התהליך ייקח מספר שניות. פתח את דף "התפריט שלי" כדי לראות את ההתקדמות ואת התוצאה הסופית.',
      }));
      return;
    }

    // Synchronous update — check the verified backend result
    if (res?.action === 'immediate_update') {
      if (res.changed === true) {
        // SUCCESS: verified by the backend. Only claim success here.
        const verified = res.after;
        const calLine  = verified?.calories != null
          ? `התפריט עודכן — ממוצע יומי מאומת: ${verified.calories} קלוריות.`
          : 'השינוי בוצע ואומת בהצלחה.';

        setMessages(prev => prev.filter(m => !m.loading).concat({
          role: 'assistant',
          content: `✅ ${calLine}\n\nרענן את דף "התפריט שלי" כדי לראות את הפירוט המלא.`,
        }));
      } else {
        // Backend processed the request but the plan did not change
        const failMsg = getMutationFailureMessage(intent, res.ai_response);
        setMessages(prev => prev.filter(m => !m.loading).concat({
          role: 'assistant',
          content: failMsg,
        }));
      }
      return;
    }

    // Unexpected response shape
    setMessages(prev => prev.filter(m => !m.loading).concat({
      role: 'assistant',
      content: 'לא הצלחתי לאמת את השינוי. בדוק בדף "התפריט שלי" אם השינוי בוצע.',
    }));
  };

  // ── sendMessage ───────────────────────────────────────────────────────────────
  const sendMessage = async (text) => {
    const userText = text || input.trim();
    if (!userText || loading) return;
    setInput('');
    setView('chat');

    const newMessages = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);
    setMessages(prev => [...prev, { role: 'assistant', content: '', loading: true }]);
    setLoading(true);

    try {
      // ── Mutation detection — route to backend before calling text AI ──────────
      // detectMutationIntent returns non-null only for clear plan-change requests.
      // The AI text endpoint is never used for mutations — only for informational queries.
      const mutationIntent = detectMutationIntent(userText);
      if (mutationIntent) {
        await handleMutation(mutationIntent, userText);
        return; // handleMutation sets its own messages
      }

      // ── Informational query — text generation only ──────────────────────────
      const context = buildFullContext(trainee, meals, water, workouts);
      const history = newMessages.slice(-6).map(m => `${m.role === 'user' ? 'מתאמן' : 'AI Coach'}: ${m.content}`).join('\n');

      const res = await base44.functions.invoke('askAICoach', {
        prompt: `אתה אליאור - העוזר האישי לכושר ותזונה של המתאמן. אתה מדבר בגוף ראשון, ידידותי ואנושי כמו חבר שמכיר אותך טוב.

נתוני המתאמן:
${context}

היסטוריית שיחה:
${history}

כללים:
- תשובה קצרה, חמה וממוקדת (3-5 שורות)
- דבר כמו חבר אמיתי, לא כמו רובוט
- השתמש במספרים מהנתונים
- סיים תמיד עם המלצה אחת ברורה
- אל תמליץ ייעוץ רפואי
- כתוב בעברית טבעית, חמה ונעימה
- אם המשתמש מבקש לשנות את התפריט, הסבר שיש לו כפתור "שינויים בתפריט" בדף התפריט שלו

שאלה: ${userText}`,
      });
      const result = typeof res?.data?.response === 'string'
        ? res.data.response
        : (res?.data?.response ? JSON.stringify(res.data.response) : '❌ שגיאה בקבלת תשובה. נסה שוב.');

      setMessages(prev => prev.filter(m => !m.loading).concat({ role: 'assistant', content: result }));

      // Save consultation fire-and-forget — a save failure must never show an error bubble
      const emailToSave = trainee?.user_email || trainee?.coach_email;
      if (emailToSave) {
        base44.entities.AIConsultation.create({
          trainee_email: emailToSave,
          date: new Date().toISOString(),
          topic: 'general',
          user_question: userText,
          ai_recommendation: result.substring(0, 200),
          full_response: result,
        }).catch(e => console.warn('[AICoach] consultation save failed:', e.message));
      }
    } catch (err) {
      setMessages(prev => prev.filter(m => !m.loading).concat({
        role: 'assistant',
        content: '❌ שגיאה בקבלת תשובה. נסה שוב.',
      }));
    } finally {
      setLoading(false);
    }
  };

  const insightIcons = { nutrition: Utensils, training: Dumbbell, water: Droplets, score: TrendingUp };
  const insightColors = { nutrition: 'bg-teal-600', training: 'bg-indigo-600', water: 'bg-blue-600', score: 'bg-emerald-600' };

  const quickQuestions = [
    'מה לאכול עכשיו?',
    'האם לאמן היום?',
    'איך אני הולך השבוע?',
  ];

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        className="p-0 overflow-hidden border-0"
        style={{
          background: 'linear-gradient(160deg, #1a2a2a 0%, #0f1f1f 50%, #111a1a 100%)',
          maxWidth: '420px',
          width: '95vw',
          maxHeight: '90vh',
          borderRadius: '24px',
        }}
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-base border-2 border-teal-400"
                style={{ background: 'linear-gradient(135deg, #79DBD6, #5BC5C0)' }}>
                א
              </div>
              <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 rounded-full border-2 border-slate-900" />
            </div>
            <div>
              <h2 className="text-white font-bold text-base leading-none">אליאור</h2>
              <p className="text-green-400 text-xs mt-0.5">● מחובר עכשיו</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {view === 'chat' && (
              <button onClick={() => setView('home')} className="text-slate-400 hover:text-white text-xs px-2 py-1 rounded-lg bg-slate-800">
                ראשי
              </button>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-slate-700/50 mx-5" />

        {view === 'home' ? (
          <div className="px-5 py-4 space-y-4 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>

            {/* Daily Summary Banner */}
            <div className="rounded-2xl p-4" style={{ background: 'linear-gradient(135deg, #0d3535, #0a2828)' }}>
              <p className="text-xs text-teal-400 mb-1">ניתוח יומי מאליאור</p>
              {insightsLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-teal-400 animate-spin" />
                  <p className="text-slate-400 text-sm">מנתח את הנתונים שלך...</p>
                </div>
              ) : (
                <p className="text-white text-sm font-medium leading-relaxed">
                  {dailyInsights?.daily_summary || 'מנתח...'}
                </p>
              )}
            </div>

            {/* Insight Cards */}
            {!insightsLoading && dailyInsights?.insights && (
              <div className="space-y-2">
                <p className="text-xs text-slate-500 font-medium">תובנות היום</p>
                {dailyInsights.insights.map((ins, i) => {
                  const Icon = insightIcons[ins.type] || TrendingUp;
                  return (
                    <InsightCard
                      key={i}
                      icon={Icon}
                      title={ins.title}
                      value={ins.text}
                      color={insightColors[ins.type] || 'bg-teal-600'}
                      onClick={() => sendMessage(`ספר לי עוד על: ${ins.title} - ${ins.text}`)}
                    />
                  );
                })}
              </div>
            )}

            {/* Quick Questions */}
            <div>
              <p className="text-xs text-slate-500 font-medium mb-2">שאלות מהירות</p>
              <div className="flex flex-wrap gap-2">
                {quickQuestions.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    disabled={loading}
                    className="px-3 py-1.5 rounded-full text-xs border border-slate-600 text-slate-300 hover:border-teal-500 hover:text-teal-400 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            {/* Input */}
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="שאל שאלה חופשית..."
                rows={2}
                className="flex-1 bg-slate-800/80 border-slate-600 text-white placeholder-slate-500 rounded-xl resize-none text-sm focus:border-teal-500"
              />
              <Button
                onClick={() => sendMessage()}
                disabled={loading || !input.trim()}
                className="h-10 w-10 p-0 rounded-xl flex-shrink-0"
                style={{ background: input.trim() ? 'linear-gradient(135deg, #79DBD6, #5BC5C0)' : '#334155' }}
              >
                <Send className="w-4 h-4 text-white" />
              </Button>
            </div>
          </div>
        ) : (
          /* Chat View */
          <div className="flex flex-col" style={{ height: 'calc(90vh - 100px)' }}>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-1">
              {messages.map((msg, i) => (
                <MessageBubble key={i} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Quick replies in chat */}
            {!loading && messages.length > 0 && messages.length < 4 && (
              <div className="px-4 pb-2 flex gap-2 overflow-x-auto">
                {quickQuestions.map(q => (
                  <button
                    key={q}
                    onClick={() => sendMessage(q)}
                    className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs border border-slate-600 text-slate-400 hover:border-teal-500 hover:text-teal-400 transition-all"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}

            {/* Chat Input */}
            <div className="px-4 pb-4 pt-2 border-t border-slate-700/50">
              <div className="flex gap-2 items-end">
                <Textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="כתוב הודעה..."
                  rows={2}
                  className="flex-1 bg-slate-800/80 border-slate-600 text-white placeholder-slate-500 rounded-xl resize-none text-sm focus:border-teal-500"
                />
                <Button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="h-10 w-10 p-0 rounded-xl flex-shrink-0"
                  style={{ background: input.trim() ? 'linear-gradient(135deg, #79DBD6, #5BC5C0)' : '#334155' }}
                >
                  {loading ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}