import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2, AlertCircle, TrendingUp, TrendingDown, Lightbulb } from "lucide-react";
import { format } from 'date-fns';

export default function AIMetricsInsight({ traineeEmail, entries, isCoach = false }) {
  const [isGenerating, setIsGenerating] = useState(false);
  const queryClient = useQueryClient();

  // Get the latest insight
  const { data: insights = [] } = useQuery({
    queryKey: ['metricsAIInsights', traineeEmail],
    queryFn: () => base44.entities.MetricsAIInsight.filter({ trainee_email: traineeEmail }),
    enabled: !!traineeEmail,
  });

  const latestInsight = insights.sort((a, b) => 
    new Date(b.date_generated) - new Date(a.date_generated)
  )[0];

  const generateInsight = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      
      // Prepare data for AI
      const sortedEntries = [...entries].sort((a, b) => new Date(b.date) - new Date(a.date));
      const latest = sortedEntries[0];
      const previous = sortedEntries[1];
      
      // Calculate trends
      const trends = {};
      ['weight_kg', 'body_fat_percent', 'water_percent', 'muscle_mass_kg', 'body_age_years'].forEach(metric => {
        const values = sortedEntries.filter(e => e[metric]).slice(0, 7);
        if (values.length >= 2) {
          const newest = values[0][metric];
          const oldest = values[values.length - 1][metric];
          const change = newest - oldest;
          trends[metric] = {
            latest: newest,
            previous: values[1]?.[metric],
            change: change,
            trend: change < 0 ? 'down' : change > 0 ? 'up' : 'stable'
          };
        }
      });

      const prompt = `אתה מומחה כושר ותזונה. נתח את מדדי הגוף הבאים של מתאמן.

נתונים:
- מדידה אחרונה: ${JSON.stringify(latest, null, 2)}
- מדידה קודמת: ${JSON.stringify(previous || 'אין', null, 2)}
- מגמות 7 ימים: ${JSON.stringify(trends, null, 2)}
- סה"כ מדידות: ${entries.length}

דרישות:
1. סיכום: 2-4 משפטים על המגמה האחרונה (חיובי ומעודד)
2. שינויים עיקריים: 3-5 נקודות bullet עם מה השתנה
3. הסברי מדדים: רק למדדים שקיימים, הסבר קצר ופשוט מה כל מדד אומר
4. המלצות: 2-3 המלצות כלליות וזהירות (לא רפואיות)
5. דגלים: זהה אם stable/improving/outlier/rapid_change/low_data

כללי בטיחות:
- אסור: ייעוץ רפואי, אבחנות, הפחדות
- מותר: המלצות כלליות כמו "שימו לב לשתייה", "שמרו על עקביות"
- חובה: סיים עם "זה מידע כללי ולא ייעוץ רפואי"

אם יש רק מדידה אחת - אמור שאין מספיק היסטוריה והסבר מדדים באופן כללי.

החזר JSON בפורמט:
{
  "summary": "string",
  "keyChanges": ["string"],
  "metricExplanations": {
    "weight_kg": "string (אם קיים)",
    "body_fat_percent": "string (אם קיים)",
    "water_percent": "string (אם קיים)",
    "muscle_mass_kg": "string (אם קיים)",
    "body_age_years": "string (אם קיים)"
  },
  "recommendations": ["string"],
  "flags": ["string"]
}`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            keyChanges: { type: "array", items: { type: "string" } },
            metricExplanations: { type: "object" },
            recommendations: { type: "array", items: { type: "string" } },
            flags: { type: "array", items: { type: "string" } }
          }
        }
      });

      // Save to database
      const insightData = {
        trainee_email: traineeEmail,
        date_generated: new Date().toISOString(),
        summary_text: result.summary,
        key_changes: result.keyChanges || [],
        metric_explanations: result.metricExplanations || {},
        recommendations: result.recommendations || [],
        flags: result.flags || [],
        disclaimer_included: true,
        data_snapshot: { latest, previous, trends, totalEntries: entries.length }
      };

      await base44.entities.MetricsAIInsight.create(insightData);
      setIsGenerating(false);
      
      return insightData;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['metricsAIInsights'] });
    },
    onError: () => {
      setIsGenerating(false);
    }
  });

  if (entries.length === 0) {
    return null;
  }

  return (
    <Card className="p-4 bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-600" />
          <h3 className="font-bold text-slate-800">AI ניתוח מדדים</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => generateInsight.mutate()}
          disabled={isGenerating}
          className="text-xs"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-3 h-3 ml-1 animate-spin" />
              מנתח...
            </>
          ) : (
            <>
              <Sparkles className="w-3 h-3 ml-1" />
              רענן ניתוח
            </>
          )}
        </Button>
      </div>

      {isGenerating && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
          <p className="text-sm text-slate-600">מנתח את המדדים שלך...</p>
        </div>
      )}

      {!isGenerating && latestInsight && (
        <div className="space-y-3">
          {/* Summary */}
          <div className="p-3 bg-white rounded-lg">
            <p className="text-sm text-slate-700 leading-relaxed">{latestInsight.summary_text}</p>
            <p className="text-xs text-slate-400 mt-2">
              עודכן: {format(new Date(latestInsight.date_generated), 'd/M/yyyy HH:mm')}
            </p>
          </div>

          {/* Key Changes */}
          {latestInsight.key_changes && latestInsight.key_changes.length > 0 && (
            <div className="p-3 bg-white rounded-lg">
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <TrendingUp className="w-4 h-4 text-purple-600" />
                שינויים עיקריים
              </h4>
              <ul className="space-y-1">
                {latestInsight.key_changes.map((change, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-purple-500 mt-0.5">•</span>
                    <span>{change}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Metric Explanations */}
          {latestInsight.metric_explanations && Object.keys(latestInsight.metric_explanations).length > 0 && (
            <div className="p-3 bg-white rounded-lg">
              <h4 className="text-sm font-medium text-slate-700 mb-2 flex items-center gap-1">
                <Lightbulb className="w-4 h-4 text-amber-500" />
                מה כל מדד אומר
              </h4>
              <div className="space-y-2">
                {Object.entries(latestInsight.metric_explanations).map(([key, explanation]) => (
                  <div key={key} className="text-xs">
                    <span className="font-medium text-slate-700">
                      {key === 'weight_kg' && 'משקל: '}
                      {key === 'body_fat_percent' && 'אחוז שומן: '}
                      {key === 'water_percent' && 'אחוז מים: '}
                      {key === 'muscle_mass_kg' && 'מסת שריר: '}
                      {key === 'body_age_years' && 'גיל גוף: '}
                    </span>
                    <span className="text-slate-600">{explanation}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {latestInsight.recommendations && latestInsight.recommendations.length > 0 && (
            <div className="p-3 bg-white rounded-lg">
              <h4 className="text-sm font-medium text-slate-700 mb-2">המלצות</h4>
              <ul className="space-y-1">
                {latestInsight.recommendations.map((rec, i) => (
                  <li key={i} className="text-xs text-slate-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Flags */}
          {latestInsight.flags && latestInsight.flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {latestInsight.flags.map((flag, i) => (
                <span
                  key={i}
                  className={`text-xs px-2 py-1 rounded-full ${
                    flag === 'improving' ? 'bg-green-100 text-green-700' :
                    flag === 'stable' ? 'bg-blue-100 text-blue-700' :
                    flag === 'outlier' ? 'bg-amber-100 text-amber-700' :
                    flag === 'rapid_change' ? 'bg-orange-100 text-orange-700' :
                    'bg-slate-100 text-slate-600'
                  }`}
                >
                  {flag === 'improving' && 'משתפר'}
                  {flag === 'stable' && 'יציב'}
                  {flag === 'outlier' && 'חריגה'}
                  {flag === 'rapid_change' && 'שינוי מהיר'}
                  {flag === 'low_data' && 'מעט נתונים'}
                </span>
              ))}
            </div>
          )}

          {/* Disclaimer */}
          <div className="p-2 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                זה מידע כללי ולא ייעוץ רפואי. אם משהו לא מרגיש תקין—פנו לאיש מקצוע.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isGenerating && !latestInsight && (
        <div className="text-center py-6">
          <Sparkles className="w-8 h-8 text-purple-400 mx-auto mb-2" />
          <p className="text-sm text-slate-600 mb-3">לחץ "רענן ניתוח" לקבל ניתוח AI של המדדים</p>
        </div>
      )}
    </Card>
  );
}