import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Check, X, Database, AlertTriangle, ListChecks, Zap, Eye, Star, ArrowUpDown } from "lucide-react";

function StatCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700 border-blue-100",
    green:  "bg-green-50 text-green-700 border-green-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    amber:  "bg-amber-50 text-amber-700 border-amber-100",
    slate:  "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <Card className={`p-4 border ${colors[color] || colors.blue}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color] || colors.blue}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value ?? "—"}</p>
          <p className="text-xs font-medium">{label}</p>
          {sub && <p className="text-xs opacity-70 mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

function ConfidenceBadge({ confidence }) {
  if (!confidence) return null;
  const map = {
    high:   "bg-green-100 text-green-700",
    medium: "bg-amber-100 text-amber-700",
    low:    "bg-red-100 text-red-700",
  };
  const labels = { high: "ביטחון גבוה", medium: "ביטחון בינוני", low: "ביטחון נמוך" };
  return (
    <Badge className={`text-xs ${map[confidence] || "bg-slate-100 text-slate-600"}`}>
      {labels[confidence] || confidence}
    </Badge>
  );
}

function CandidateRow({ candidate, onApprove, onReject, onRollback, approving, rejecting }) {
  const [overrides, setOverrides] = useState({
    kcal:    candidate.avg_kcal_per_100 != null ? String(Math.round(candidate.avg_kcal_per_100)) : "",
    protein: candidate.avg_protein_100  != null ? String(Math.round(candidate.avg_protein_100))  : "",
    carbs:   candidate.avg_carbs_100    != null ? String(Math.round(candidate.avg_carbs_100))    : "",
    fat:     candidate.avg_fat_100      != null ? String(Math.round(candidate.avg_fat_100))      : "",
    name:    candidate.canonical_name   ?? "",
  });
  const [showHistory, setShowHistory] = useState(false);
  const set = (k, v) => setOverrides(o => ({ ...o, [k]: v }));

  const handleApprove = () => onApprove({
    candidate_id:    candidate.id,
    name_override:   overrides.name !== candidate.canonical_name ? overrides.name : undefined,
    kcal_per_100:    overrides.kcal    !== "" ? Number(overrides.kcal)    : undefined,
    protein_per_100: overrides.protein !== "" ? Number(overrides.protein) : undefined,
    carbs_per_100:   overrides.carbs   !== "" ? Number(overrides.carbs)   : undefined,
    fat_per_100:     overrides.fat     !== "" ? Number(overrides.fat)     : undefined,
  });

  const aiNames = Array.isArray(candidate.ai_names) ? candidate.ai_names : [];
  const sourceModels = Array.isArray(candidate.source_models) ? candidate.source_models : [];

  // Approval Intelligence gate: require name + at least kcal before allowing approval
  const macrosReady = Number(overrides.kcal) > 0;
  const canApprove  = overrides.name.trim().length > 0 && macrosReady;

  // Fetch history if the candidate is approved (has approved_food_id)
  const { data: historyResult } = useQuery({
    queryKey: ["foodItemHistory", candidate.approved_food_id],
    queryFn: () => base44.functions.invoke("getFoodItemHistory", { food_item_id: candidate.approved_food_id }),
    enabled: showHistory && !!candidate.approved_food_id,
    select: r => r?.data,
  });
  const historyData    = historyResult?.versions;
  const currentVersion = historyResult?.current_version;

  const hasMinMax = candidate.min_kcal_per_100 != null && candidate.max_kcal_per_100 != null
    && Math.round(candidate.min_kcal_per_100) !== Math.round(candidate.max_kcal_per_100);

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-base">{candidate.canonical_name}</span>
            <Badge variant="secondary" className="text-xs">{candidate.occurrence_count} פעמים</Badge>
            {candidate.unique_users > 0 && (
              <Badge variant="outline" className="text-xs text-slate-500">{candidate.unique_users} משתמשים</Badge>
            )}
            {candidate.unique_meals > 0 && (
              <Badge variant="outline" className="text-xs text-teal-600 border-teal-200">{candidate.unique_meals} סוגי ארוחה</Badge>
            )}
            {candidate.image_count > 0 && (
              <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">{candidate.image_count} מתמונות</Badge>
            )}
            {sourceModels.map((m, i) => (
              <Badge key={i} variant="outline" className="text-xs text-blue-500 border-blue-200">{m}</Badge>
            ))}
            <ConfidenceBadge confidence={candidate.avg_confidence} />
          </div>
          {aiNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {aiNames.map((n, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal text-slate-500">{n}</Badge>
              ))}
            </div>
          )}
          {/* Min/Max macro spread — Approval Intelligence */}
          {hasMinMax && (
            <div className="mt-1.5 text-xs text-slate-400 flex flex-wrap gap-3">
              <span>kcal: <strong className="text-slate-600">{Math.round(candidate.min_kcal_per_100)}–{Math.round(candidate.max_kcal_per_100)}</strong></span>
              {candidate.min_protein_100 != null && <span>חלבון: <strong className="text-slate-600">{Math.round(candidate.min_protein_100)}–{Math.round(candidate.max_protein_100)}</strong></span>}
              {candidate.min_carbs_100   != null && <span>פחמ': <strong className="text-slate-600">{Math.round(candidate.min_carbs_100)}–{Math.round(candidate.max_carbs_100)}</strong></span>}
              {candidate.min_fat_100     != null && <span>שומן: <strong className="text-slate-600">{Math.round(candidate.min_fat_100)}–{Math.round(candidate.max_fat_100)}</strong></span>}
              <span className="text-amber-500">(טווח AI — אמת לפני אישור)</span>
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {candidate.approved_food_id && (
            <Button
              size="sm"
              variant="ghost"
              className="text-slate-400 hover:text-slate-700"
              onClick={() => setShowHistory(h => !h)}
            >
              <Eye className="w-4 h-4" />
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-slate-500 border-slate-300 hover:bg-slate-100" onClick={() => onReject(candidate.id)} disabled={rejecting}>
            <X className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            className={canApprove ? "bg-green-600 hover:bg-green-700 text-white" : "bg-slate-200 text-slate-400 cursor-not-allowed"}
            onClick={canApprove ? handleApprove : undefined}
            disabled={approving || !canApprove}
            title={!canApprove ? "יש להזין שם + קלוריות לפני האישור" : ""}
          >
            <Check className="w-4 h-4 ml-1" />
            אשר
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <div className="md:col-span-1">
          <label className="text-xs text-slate-500 mb-1 block">שם קנוני</label>
          <Input value={overrides.name} onChange={e => set("name", e.target.value)} className="h-8 text-sm" dir="rtl" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">קלוריות/100ג</label>
          <Input type="number" value={overrides.kcal} onChange={e => set("kcal", e.target.value)} className="h-8 text-sm" placeholder="—" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">חלבון/100ג</label>
          <Input type="number" value={overrides.protein} onChange={e => set("protein", e.target.value)} className="h-8 text-sm" placeholder="—" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">פחמימות/100ג</label>
          <Input type="number" value={overrides.carbs} onChange={e => set("carbs", e.target.value)} className="h-8 text-sm" placeholder="—" />
        </div>
        <div>
          <label className="text-xs text-slate-500 mb-1 block">שומן/100ג</label>
          <Input type="number" value={overrides.fat} onChange={e => set("fat", e.target.value)} className="h-8 text-sm" placeholder="—" />
        </div>
      </div>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs text-slate-400">
          נראה לראשונה: {candidate.first_seen ? new Date(candidate.first_seen).toLocaleDateString("he-IL") : "—"} ·{" "}
          אחרון: {candidate.last_seen ? new Date(candidate.last_seen).toLocaleDateString("he-IL") : "—"}
        </p>
        {!canApprove && (
          <p className="text-xs text-amber-600 font-medium">
            יש להזין שם + קלוריות לפני האישור
          </p>
        )}
      </div>

      {showHistory && candidate.approved_food_id && (
        <div className="border-t border-slate-100 pt-3 mt-1">
          {!historyData ? (
            <p className="text-xs text-slate-400">טוען היסטוריה...</p>
          ) : historyData.length === 0 ? (
            <p className="text-xs text-slate-400">(מזון חדש — אין גרסאות קודמות)</p>
          ) : (
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-600 mb-2">
                היסטוריית גרסאות (גרסה נוכחית: v{currentVersion ?? "—"})
              </p>
              {historyData.map((v) => {
                const isCurrent = v.version === currentVersion;
                return (
                  <div key={v.id} className={`flex items-center gap-3 text-xs rounded px-2 py-1.5 ${isCurrent ? "bg-blue-50 text-blue-700 border border-blue-100" : "bg-slate-50 text-slate-500"}`}>
                    <span className="font-bold w-8">{isCurrent ? `v${v.version} ✓` : `v${v.version}`}</span>
                    <span>{Math.round(v.kcal_per_100)} קק"ל</span>
                    <span>ח' {Math.round(v.protein_per_100)}ג'</span>
                    <span>פח' {Math.round(v.carbs_per_100)}ג'</span>
                    <span>ש' {Math.round(v.fat_per_100)}ג'</span>
                    {v.change_reason && <span className="opacity-60">· {v.change_reason}</span>}
                    <span className="opacity-60">{v.created_at ? new Date(v.created_at).toLocaleDateString("he-IL") : ""}</span>
                    {!isCurrent && (
                      <button
                        className="mr-auto text-xs text-blue-600 hover:text-blue-800 font-medium underline underline-offset-2"
                        onClick={() => onRollback(candidate.approved_food_id, v.version)}
                      >
                        שחזר גרסה זו
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CandidateReadOnlyRow({ candidate }) {
  const aiNames = Array.isArray(candidate.ai_names) ? candidate.ai_names : [];
  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-center gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-slate-800">{candidate.canonical_name}</span>
          <Badge variant="secondary" className="text-xs">{candidate.occurrence_count} פעמים</Badge>
          {candidate.status === "approved" && <Badge className="text-xs bg-green-100 text-green-700">אושר</Badge>}
          {candidate.status === "rejected" && <Badge variant="destructive" className="text-xs">נדחה</Badge>}
          {candidate.unique_users > 0 && (
            <Badge variant="outline" className="text-xs text-slate-500">{candidate.unique_users} משתמשים</Badge>
          )}
          {candidate.image_count > 0 && (
            <Badge variant="outline" className="text-xs text-purple-600 border-purple-200">{candidate.image_count} תמונות</Badge>
          )}
          <ConfidenceBadge confidence={candidate.avg_confidence} />
        </div>
        {aiNames.length > 0 && (
          <p className="text-xs text-slate-400 mt-1">{aiNames.slice(0, 5).join(", ")}</p>
        )}
      </div>
      <div className="text-xs text-slate-400 shrink-0">
        {candidate.avg_kcal_per_100 != null ? `${Math.round(candidate.avg_kcal_per_100)} קק"ל/100ג` : "—"}
      </div>
    </div>
  );
}

const ACTION_LABELS = {
  food_approved:    "אישור מזון",
  food_rejected:    "דחיית מזון",
  food_edited:      "עריכת מזון",
  food_restored:    "שחזור גרסה",
  synonym_added:    "נרדף נוסף",
  canonical_changed:"שינוי קנוני",
};

export default function CanonicalFoodReview() {
  const [tab, setTab] = useState("pending");
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ["currentUser"],
    queryFn: () => base44.auth.me(),
  });

  const isCoach = user?.role === "admin" || user?.role === "coach";

  const { data: statsData, refetch: refetchStats } = useQuery({
    queryKey: ["foodLearningStats"],
    queryFn: () => base44.functions.invoke("getFoodLearningStats", {}),
    enabled: isCoach,
    select: r => r?.data,
  });

  const { data: pendingData, refetch: refetchPending, isLoading: loadingPending } = useQuery({
    queryKey: ["foodCandidates", "pending"],
    queryFn: () => base44.functions.invoke("getFoodCandidates", { status: "pending", limit: 100 }),
    enabled: isCoach,
    select: r => r?.data,
  });

  const { data: approvedData, refetch: refetchApproved, isLoading: loadingApproved } = useQuery({
    queryKey: ["foodCandidates", "approved"],
    queryFn: () => base44.functions.invoke("getFoodCandidates", { status: "approved", limit: 100 }),
    enabled: isCoach && tab === "approved",
    select: r => r?.data,
  });

  const { data: rejectedData, refetch: refetchRejected, isLoading: loadingRejected } = useQuery({
    queryKey: ["foodCandidates", "rejected"],
    queryFn: () => base44.functions.invoke("getFoodCandidates", { status: "rejected", limit: 100 }),
    enabled: isCoach && tab === "rejected",
    select: r => r?.data,
  });

  const approveMut = useMutation({
    mutationFn: (body) => base44.functions.invoke("approveFoodCandidate", { ...body, coach_email: user?.email }),
    onSuccess: () => {
      toast.success("מזון אושר — נרדפים, מיפויים וקנדידטים עודכנו אוטומטית");
      queryClient.invalidateQueries({ queryKey: ["foodCandidates"] });
      queryClient.invalidateQueries({ queryKey: ["foodLearningStats"] });
    },
    onError: (e) => toast.error(e?.message || "שגיאה באישור"),
  });

  const rejectMut = useMutation({
    mutationFn: (candidate_id) => base44.functions.invoke("rejectFoodCandidate", { candidate_id, coach_email: user?.email }),
    onSuccess: () => {
      toast.success("מזון נדחה");
      queryClient.invalidateQueries({ queryKey: ["foodCandidates"] });
      queryClient.invalidateQueries({ queryKey: ["foodLearningStats"] });
    },
    onError: (e) => toast.error(e?.message || "שגיאה בדחיה"),
  });

  const rollbackMut = useMutation({
    mutationFn: ({ food_item_id, version_number }) =>
      base44.functions.invoke("rollbackFoodItemToVersion", { food_item_id, version_number, coach_email: user?.email }),
    onSuccess: (res) => {
      if (res?.ok === false) {
        toast.error(res?.message || "שגיאה בשחזור");
        return;
      }
      toast.success(`גרסה שוחזרה בהצלחה — v${res?.data?.rolled_back_to}`);
      queryClient.invalidateQueries({ queryKey: ["foodItemHistory"] });
      queryClient.invalidateQueries({ queryKey: ["foodAuditLog"] });
    },
    onError: (e) => toast.error(e?.message || "שגיאה בשחזור"),
  });

  const { data: auditData, isLoading: loadingAudit } = useQuery({
    queryKey: ["foodAuditLog", tab],
    queryFn: () => base44.functions.invoke("getFoodAuditLog", { limit: 100 }),
    enabled: isCoach && tab === "audit",
    select: r => r?.data,
  });

  const refetchAll = () => {
    refetchStats();
    refetchPending();
    if (tab === "approved") refetchApproved();
    if (tab === "rejected") refetchRejected();
  };

  if (!isCoach) {
    return (
      <div className="min-h-screen p-6 bg-slate-50" dir="rtl">
        <Card className="p-6 text-center text-slate-500">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-orange-400" />
          <p>גישה לדף זה מוגבלת למאמנים בלבד.</p>
        </Card>
      </div>
    );
  }

  const stats = statsData || {};
  const pendingCandidates = pendingData?.candidates || [];
  const approvedCandidates = approvedData?.candidates || [];
  const rejectedCandidates = rejectedData?.candidates || [];

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 pb-24" dir="rtl">
      <div className="max-w-5xl mx-auto space-y-6">

        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-6 h-6 text-blue-600" />
              ניהול מזון קנוני — למידה עצמית
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              מזונות שה-AI זיהה ולא נמצאו בבסיס הנתונים — ניתן לאשר ולהוסיף בלחיצה אחת
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={refetchAll}>
            <RefreshCw className="w-4 h-4 ml-1" />
            רענן
          </Button>
        </div>

        {/* KPI Cards — 5 cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            icon={Star}
            label="כיסוי קנוני"
            value={`${stats.canonical_coverage_pct ?? 0}%`}
            sub="מזונות מאושרים / סה״כ"
            color="green"
          />
          <StatCard
            icon={AlertTriangle}
            label="AI Fallback"
            value={`${stats.ai_fallback_pct ?? 0}%`}
            sub="ממתינים לאישור"
            color="orange"
          />
          <StatCard
            icon={Check}
            label="אושרו השבוע"
            value={stats.approved_this_week ?? "—"}
            sub="ב-7 ימים אחרונים"
            color="green"
          />
          <StatCard
            icon={ListChecks}
            label="ממתינים"
            value={stats.pending_candidates ?? "—"}
            sub="ממתינים לאישור"
            color="amber"
          />
          <StatCard
            icon={Zap}
            label="מהירות למידה"
            value={stats.learning_velocity ?? "—"}
            sub="אישורים / שבוע"
            color="blue"
          />
        </div>

        {/* Secondary stats + Top Missing Foods */}
        <div className="flex flex-col gap-3">
          {(stats.total_synonyms > 0 || stats.total_fallback_logs > 0) && (
            <div className="flex flex-wrap gap-4 text-xs text-slate-500 px-1">
              {stats.total_fallback_logs != null && (
                <span>סה"כ לוגים: <strong className="text-slate-700">{stats.total_fallback_logs.toLocaleString()}</strong></span>
              )}
              {stats.total_synonyms != null && (
                <span>נרדפים: <strong className="text-slate-700">{stats.total_synonyms}</strong></span>
              )}
              {stats.image_fallbacks_7d != null && (
                <span>תמונות (7י'): <strong className="text-slate-700">{stats.image_fallbacks_7d}</strong></span>
              )}
              {stats.text_fallbacks_7d != null && (
                <span>טקסט (7י'): <strong className="text-slate-700">{stats.text_fallbacks_7d}</strong></span>
              )}
            </div>
          )}

          {stats.top_missing_foods?.length > 0 && (
            <Card className="p-4 border border-amber-100 bg-amber-50">
              <div className="flex items-center gap-2 mb-3">
                <ArrowUpDown className="w-4 h-4 text-amber-600" />
                <span className="text-sm font-semibold text-amber-800">Top Missing Foods</span>
                <span className="text-xs text-amber-600">(ממתינים לאישור, לפי תדירות)</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.top_missing_foods.slice(0, 8).map((f, i) => (
                  <div key={f.canonical_name} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-full px-3 py-1 text-xs">
                    <span className="text-amber-500 font-bold">#{i + 1}</span>
                    <span className="font-medium text-slate-700">{f.canonical_name}</span>
                    <span className="text-slate-400">{f.occurrence_count}×</span>
                    {f.unique_users > 1 && <span className="text-slate-400">{f.unique_users} משתמשים</span>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="pending" className="flex-1">ממתינים ({stats.pending_candidates ?? 0})</TabsTrigger>
            <TabsTrigger value="approved" className="flex-1">אושרו ({stats.approved_candidates ?? 0})</TabsTrigger>
            <TabsTrigger value="rejected" className="flex-1">נדחו</TabsTrigger>
            <TabsTrigger value="audit"    className="flex-1">Audit Log</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            {loadingPending ? (
              <div className="text-center text-slate-400 py-10">טוען...</div>
            ) : pendingCandidates.length === 0 ? (
              <Card className="p-8 text-center text-slate-400">
                <Check className="w-10 h-10 mx-auto mb-3 text-green-400" />
                <p className="font-medium">אין מועמדים ממתינים</p>
                <p className="text-sm mt-1">כל המזונות שה-AI זיהה כבר נמצאים בבסיס הנתונים.</p>
              </Card>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">{pendingCandidates.length} מועמדים, ממוינים לפי תדירות.</p>
                {pendingCandidates.map(c => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    onApprove={(body) => approveMut.mutate(body)}
                    onReject={(id) => rejectMut.mutate(id)}
                    onRollback={(food_item_id, version_number) => rollbackMut.mutate({ food_item_id, version_number })}
                    approving={approveMut.isPending}
                    rejecting={rejectMut.isPending}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="approved" className="mt-4">
            {loadingApproved ? (
              <div className="text-center text-slate-400 py-10">טוען...</div>
            ) : approvedCandidates.length === 0 ? (
              <Card className="p-8 text-center text-slate-400"><p>אין מזונות שאושרו עדיין.</p></Card>
            ) : (
              <div className="space-y-2">{approvedCandidates.map(c => <CandidateReadOnlyRow key={c.id} candidate={c} />)}</div>
            )}
          </TabsContent>

          <TabsContent value="rejected" className="mt-4">
            {loadingRejected ? (
              <div className="text-center text-slate-400 py-10">טוען...</div>
            ) : rejectedCandidates.length === 0 ? (
              <Card className="p-8 text-center text-slate-400"><p>אין מזונות שנדחו.</p></Card>
            ) : (
              <div className="space-y-2">{rejectedCandidates.map(c => <CandidateReadOnlyRow key={c.id} candidate={c} />)}</div>
            )}
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            {loadingAudit ? (
              <div className="text-center text-slate-400 py-10">טוען...</div>
            ) : !auditData?.logs?.length ? (
              <Card className="p-8 text-center text-slate-400"><p>אין אירועי Audit עדיין.</p></Card>
            ) : (
              <div className="space-y-1">
                <p className="text-sm text-slate-500 mb-2">{auditData.total} אירועים בסך הכל</p>
                {auditData.logs.map(log => (
                  <div key={log.id} className="flex items-center gap-3 text-xs border border-slate-100 rounded-lg px-3 py-2 bg-white">
                    <span className="text-slate-400 shrink-0 w-20">{new Date(log.created_at).toLocaleDateString("he-IL")} {new Date(log.created_at).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}</span>
                    <Badge className={`text-xs shrink-0 ${log.action === "food_approved" ? "bg-green-100 text-green-700" : log.action === "food_rejected" ? "bg-red-100 text-red-700" : log.action === "food_restored" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>
                      {ACTION_LABELS[log.action] || log.action}
                    </Badge>
                    <span className="font-medium text-slate-700 truncate">{log.entity_name || log.entity_id}</span>
                    <span className="text-slate-400 shrink-0">{log.coach_email}</span>
                    {log.before && log.after && log.action === "food_edited" && (
                      <span className="text-slate-400 shrink-0">
                        {log.before.kcal_per_100 != null ? `${Math.round(log.before.kcal_per_100)}→${Math.round(log.after.kcal_per_100)} קק"ל` : ""}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
