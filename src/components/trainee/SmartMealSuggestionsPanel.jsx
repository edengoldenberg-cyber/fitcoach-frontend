import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Copy, AlertTriangle, Droplets } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import NutritionRecommendationCards from './NutritionRecommendationCards';
import NutritionActionMealBuilder from './NutritionActionMealBuilder';

export default function SmartMealSuggestionsPanel({ traineeEmail, dateStr, onAddMeal, defaultMealType = 'snack' }) {
  const [expanded, setExpanded] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hiddenIds, setHiddenIds] = useState([]);
  const [builderState, setBuilderState] = useState(null);
  const [showWaterPlan, setShowWaterPlan] = useState(false);
  const queryClient = useQueryClient();
  const todayKey = new Date().toISOString().slice(0, 10);

  const { data: suggestions, isLoading, isError, refetch } = useQuery({
    queryKey: ['smartMealSuggestions', traineeEmail, todayKey],
    queryFn: async () => {
      const res = await base44.functions.invoke('generateSmartMealSuggestions', { trainee_email: traineeEmail });
      return res.data;
    },
    enabled: !!traineeEmail,
    staleTime: 0,
    refetchOnMount: true,
    retry: 1,
  });

  useEffect(() => {
    if (!traineeEmail) return undefined;
    let debounceTimer;
    const refresh = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['smartMealSuggestions', traineeEmail] });
      }, 600);
    };
    const unsubscribeMeals   = base44.entities.MealEntry.subscribe(refresh);
    const unsubscribeTargets = base44.entities.NutritionTargets.subscribe(refresh);
    return () => {
      clearTimeout(debounceTimer);
      unsubscribeMeals();
      unsubscribeTargets();
    };
  }, [traineeEmail, queryClient]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const copyDebug = async () => {
    await navigator.clipboard.writeText(JSON.stringify(suggestions?.debug || suggestions, null, 2));
  };

  const handleAction = (action, card) => {
    if (action === 'ignore') {
      setHiddenIds((ids) => [...ids, card.id]);
      return;
    }
    if (action === 'water_plan') {
      setShowWaterPlan(true);
      return;
    }
    setBuilderState({ intent: action, mealType: defaultMealType });
  };

  if (isLoading) {
    return (
      <Card className="mb-4 border-2 border-yellow-200 bg-yellow-50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-yellow-600" />
            <CardTitle className="text-yellow-900">המלצות חכמות</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !suggestions) {
    return (
      <Card className="mb-4 border-2 border-yellow-200 bg-yellow-50">
        <CardContent className="py-4 text-center">
          <p className="mb-3 text-sm text-yellow-700">לא ניתן לטעון המלצות כרגע</p>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="border-yellow-300 text-yellow-700 hover:bg-yellow-100">
            <RefreshCw className={`w-3 h-3 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            נסה שוב
          </Button>
        </CardContent>
      </Card>
    );
  }

  const lastUpdated = suggestions.generatedAt || suggestions.debug?.last_updated_at;
  const isStale = lastUpdated ? Date.now() - new Date(lastUpdated).getTime() > 24 * 60 * 60 * 1000 : true;

  return (
    <>
      <Card data-nutrition-smart-recommendations className="mb-4 border-2 border-yellow-200 bg-yellow-50">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-yellow-600" />
                <CardTitle className="text-yellow-900">המלצות חכמות לפעולה</CardTitle>
              </div>
              <CardDescription className="text-yellow-800">מבוסס על 7 הימים האחרונים ומה שנשאר לך היום</CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-yellow-700 hover:text-yellow-900">
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
          </div>
        </CardHeader>

        {expanded && (
          <CardContent className="space-y-4">
            {isStale && (
              <div className="flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                <AlertTriangle className="h-4 w-4" />
                ההמלצות לא מעודכנות — לחץ עדכן
              </div>
            )}

            <NutritionRecommendationCards cards={suggestions.recommendation_cards || []} hiddenIds={hiddenIds} onAction={handleAction} />

            {showWaterPlan && (
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-900">
                <div className="mb-1 flex items-center gap-2 font-bold"><Droplets className="h-4 w-4" /> תוכנית מים להיום</div>
                {suggestions.hydration_plan}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="flex-1 border-yellow-300 text-yellow-700 hover:bg-yellow-100">
                <RefreshCw className={`w-3 h-3 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                {refreshing ? 'מעדכן...' : 'עדכן המלצות'}
              </Button>
              <Button variant="outline" size="sm" onClick={copyDebug} className="border-yellow-300 text-yellow-700 hover:bg-yellow-100">
                <Copy className="w-3 h-3 mr-2" />
                Debug JSON
              </Button>
            </div>

            <div className="rounded-lg bg-yellow-100/60 p-2 text-[11px] text-yellow-800">
              last_updated_at: {lastUpdated ? new Date(lastUpdated).toLocaleString('he-IL') : '—'} · data_window_used: {suggestions.data_window_used || '—'} · meals_analyzed: {suggestions.meals_analyzed ?? 0} · days_analyzed: {suggestions.days_analyzed ?? 0}
            </div>
          </CardContent>
        )}
      </Card>

      <NutritionActionMealBuilder
        open={!!builderState}
        onClose={() => setBuilderState(null)}
        traineeEmail={traineeEmail}
        dateStr={dateStr}
        mealType={builderState?.mealType || defaultMealType}
        intent={builderState?.intent || 'build_meal'}
        onAddMeal={onAddMeal}
      />
    </>
  );
}