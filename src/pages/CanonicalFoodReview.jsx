import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { RefreshCw, Check, X, Database, TrendingUp, AlertTriangle, ListChecks } from "lucide-react";

function StatCard({ icon: Icon, label, value, sub, color = "blue" }) {
  const colors = {
    blue:   "bg-blue-50 text-blue-700 border-blue-100",
    green:  "bg-green-50 text-green-700 border-green-100",
    orange: "bg-orange-50 text-orange-700 border-orange-100",
    slate:  "bg-slate-50 text-slate-700 border-slate-100",
  };
  return (
    <Card className={`p-4 border ${colors[color]}`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colors[color]}`}>
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

function CandidateRow({ candidate, onApprove, onReject, approving, rejecting }) {
  const [overrides, setOverrides] = useState({
    kcal:    candidate.avg_kcal_per_100 != null ? String(Math.round(candidate.avg_kcal_per_100)) : "",
    protein: candidate.avg_protein_100  != null ? String(Math.round(candidate.avg_protein_100))  : "",
    carbs:   candidate.avg_carbs_100    != null ? String(Math.round(candidate.avg_carbs_100))    : "",
    fat:     candidate.avg_fat_100      != null ? String(Math.round(candidate.avg_fat_100))      : "",
    name:    candidate.canonical_name   ?? "",
  });
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

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-base">{candidate.canonical_name}</span>
            <Badge variant="secondary" className="text-xs">{candidate.occurrence_count} פעמים</Badge>
          </div>
          {aiNames.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {aiNames.map((n, i) => (
                <Badge key={i} variant="outline" className="text-xs font-normal text-slate-500">{n}</Badge>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" className="text-slate-500 border-slate-300 hover:bg-slate-100" onClick={() => onReject(candidate.id)} disabled={rejecting}>
            <X className="w-4 h-4" />
          </Button>
          <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={handleApprove} disabled={approving}>
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
      <p className="text-xs text-slate-400">
        נראה לראשונה: {candidate.first_seen ? new Date(candidate.first_seen).toLocaleDateString("he-IL") : "—"} ·{" "}
        אחרון: {candidate.last_seen ? new Date(candidate.last_seen).toLocaleDateString("he-IL") : "—"}
      </p>
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
      toast.success("מזון אושר ונוסף לבסיס הנתונים!");
      queryClient.invalidateQueries({ queryKey: ["foodCandidates"] });
      queryClient.invalidateQueries({ queryKey: ["foodLearningStats"] });
    },
    onError: (e) => toast.error(e?.message || "שגיאה באישור"),
  });

  const rejectMut = useMutation({
    mutationFn: (candidate_id) => base44.functions.invoke("rejectFoodCandidate", { candidate_id }),
    onSuccess: () => {
      toast.success("מזון נדחה");
      queryClient.invalidateQueries({ queryKey: ["foodCandidates"] });
      queryClient.invalidateQueries({ queryKey: ["foodLearningStats"] });
    },
    onError: (e) => toast.error(e?.message || "שגיאה בדחיה"),
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={ListChecks} label='סה"כ לוגים' value={stats.total_fallback_logs?.toLocaleString() ?? "—"} sub="כל הזמנים" color="slate" />
          <StatCard icon={AlertTriangle} label="ממתינים לאישור" value={stats.pending_candidates ?? "—"} sub="מועמדים חדשים" color="orange" />
          <StatCard icon={Check} label="אושרו" value={stats.approved_candidates ?? "—"} sub={`${stats.approved_rate_pct ?? 0}% מהמועמדים`} color="green" />
          <StatCard icon={TrendingUp} label="7 ימים אחרונים" value={stats.recent_fallbacks_7d ?? "—"} sub="לוגים חדשים" color="blue" />
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="pending" className="flex-1">ממתינים ({stats.pending_candidates ?? 0})</TabsTrigger>
            <TabsTrigger value="approved" className="flex-1">אושרו ({stats.approved_candidates ?? 0})</TabsTrigger>
            <TabsTrigger value="rejected" className="flex-1">נדחו</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
}