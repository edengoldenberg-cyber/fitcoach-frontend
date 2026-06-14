import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  MessageSquare, Zap, UserPlus, CalendarCheck, TrendingUp,
  AlertTriangle, CheckCircle, XCircle, RefreshCw, Activity,
  DollarSign, Percent, ShoppingBag, BarChart2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

// ── Status tile ──────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  green:  { bg: 'bg-emerald-50',  border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500', badge: 'bg-emerald-100 text-emerald-700' },
  yellow: { bg: 'bg-amber-50',    border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-400',   badge: 'bg-amber-100 text-amber-700'   },
  red:    { bg: 'bg-red-50',      border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500',     badge: 'bg-red-100 text-red-700'       },
  grey:   { bg: 'bg-slate-50',    border: 'border-slate-200',   text: 'text-slate-600',   dot: 'bg-slate-300',   badge: 'bg-slate-100 text-slate-500'   },
};

function StatusTile({ question, icon: Icon, status, value, sub, linkTo }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.grey;
  const inner = (
    <div className={`rounded-2xl border-2 p-5 flex flex-col gap-3 h-full ${s.bg} ${s.border} transition-all`}>
      <div className="flex items-start justify-between">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${s.badge}`}>
          <Icon className="w-5 h-5" />
        </div>
        <span className={`w-3 h-3 rounded-full mt-1 ${s.dot}`} />
      </div>
      <div>
        <div className="text-xs text-slate-400 font-medium mb-0.5">{question}</div>
        {value != null && (
          <div className={`text-3xl font-bold ${s.text}`}>{value}</div>
        )}
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  );

  if (linkTo) {
    return (
      <Link to={createPageUrl(linkTo)} className="block h-full no-underline">
        {inner}
      </Link>
    );
  }
  return inner;
}

// ── Business KPI card ─────────────────────────────────────────────────────────

function BusinessKpiCard({ icon: Icon, label, value, sub, color = 'slate', unconfigured = false }) {
  const palette = {
    slate:   { bg: 'bg-white',        border: 'border-slate-200',   text: 'text-slate-800',   icon: 'text-slate-400' },
    emerald: { bg: 'bg-emerald-50',   border: 'border-emerald-200', text: 'text-emerald-700', icon: 'text-emerald-500' },
    amber:   { bg: 'bg-amber-50',     border: 'border-amber-200',   text: 'text-amber-700',   icon: 'text-amber-500' },
    red:     { bg: 'bg-red-50',       border: 'border-red-200',     text: 'text-red-600',     icon: 'text-red-400' },
    blue:    { bg: 'bg-blue-50',      border: 'border-blue-200',    text: 'text-blue-700',    icon: 'text-blue-500' },
    violet:  { bg: 'bg-violet-50',    border: 'border-violet-200',  text: 'text-violet-700',  icon: 'text-violet-500' },
  };
  const c = palette[color] || palette.slate;
  return (
    <div className={`rounded-xl border p-4 ${c.bg} ${c.border}`}>
      <div className="flex items-center gap-1.5 mb-2">
        <Icon className={`w-3.5 h-3.5 ${c.icon}`} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      {unconfigured ? (
        <div className="text-sm text-slate-400 italic">לא הוגדר</div>
      ) : (
        <div className={`text-2xl font-bold ${c.text}`}>{value ?? '—'}</div>
      )}
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function rateColor(rate, thresholds) {
  if (rate == null) return 'slate';
  const [good, ok] = thresholds;
  return rate >= good ? 'emerald' : rate >= ok ? 'amber' : 'red';
}

// ── KPI strip ────────────────────────────────────────────────────────────────

function KpiStrip({ label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
      <div className="text-xs text-slate-400 font-medium">{label}</div>
      <div className="text-xl font-bold text-slate-800">{value ?? '—'}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}

// ── Alert row ────────────────────────────────────────────────────────────────

function AlertRow({ alert }) {
  const icon = alert.level === 'critical'
    ? <XCircle className="w-4 h-4 text-red-500 shrink-0" />
    : <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
  const bg = alert.level === 'critical' ? 'bg-red-50 border-red-100' : 'bg-amber-50 border-amber-100';
  const text = alert.level === 'critical' ? 'text-red-700' : 'text-amber-700';
  return (
    <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${bg} ${text}`}>
      {icon}
      <span>{alert.message}</span>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ExecutiveDashboard() {
  const [lastRefresh, setLastRefresh] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: raw, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['opmon-exec', user?.email],
    queryFn: () => base44.functions.invoke('operationalMonitoringAggregator', { coachEmail: user?.email }),
    enabled: !!user?.email,
    refetchInterval: 5 * 60_000,
    staleTime:       4 * 60_000,
  });

  function handleRefresh() {
    setLastRefresh(new Date().toLocaleTimeString('he-IL'));
    refetch();
  }

  const sig  = raw?.signals     || {};
  const wa   = raw?.whatsapp    || {};
  const crm  = raw?.crm         || {};
  const tr   = raw?.trainees    || {};
  const biz  = raw?.businessKpis || {};
  const alerts = (raw?.alerts || []).slice(0, 8); // cap at 8 in exec view

  const updatedAt = raw?.updatedAt
    ? new Date(raw.updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : null;

  const criticalCount = alerts.filter(a => a.level === 'critical').length;
  const warningCount  = alerts.filter(a => a.level === 'warning').length;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-slate-400 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>טוען...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-red-500 text-sm">שגיאה: {error.message}</div>
      </div>
    );
  }

  // Determine overall system health for the page header strip
  const overallStatus = criticalCount > 0 ? 'red' : warningCount > 0 ? 'yellow' : 'green';
  const overallLabel  = criticalCount > 0 ? `${criticalCount} תקלות קריטיות` :
                        warningCount  > 0 ? `${warningCount} אזהרות פעילות` :
                        'כל המערכות תקינות';
  const overallColor  = overallStatus === 'red' ? 'bg-red-500' :
                        overallStatus === 'yellow' ? 'bg-amber-400' : 'bg-emerald-500';

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Executive Dashboard</h1>
              {updatedAt && (
                <p className="text-xs text-slate-400">
                  {new Date().toLocaleDateString('he-IL', { weekday: 'long', day: '2-digit', month: 'long' })}
                  &nbsp;·&nbsp;עודכן {updatedAt}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isFetching}
            className="flex items-center gap-1.5 text-xs text-slate-500 border border-slate-200 rounded-lg px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            רענן
          </button>
        </div>

        {/* Overall health strip */}
        <div className={`rounded-xl flex items-center gap-3 px-4 py-3 text-white ${overallColor}`}>
          {overallStatus === 'green'
            ? <CheckCircle className="w-5 h-5" />
            : <AlertTriangle className="w-5 h-5" />}
          <span className="font-semibold text-sm">{overallLabel}</span>
        </div>

        {/* ── BUSINESS KPIs ─────────────────────────────────────────────── */}
        <div className="space-y-4">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">ביצועים עסקיים — 30 יום</h2>

          {/* GROUP 1 — Volume */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">נפח</p>
            <div className="grid grid-cols-3 gap-2">
              <BusinessKpiCard
                icon={UserPlus}
                label="לידים"
                value={biz?.leadsThisMonth}
                sub="נוצרו החודש"
                color="slate"
              />
              <BusinessKpiCard
                icon={CalendarCheck}
                label="ניסיונות"
                value={biz?.trialsThisMonth}
                sub="נקבעו החודש"
                color="slate"
              />
              <BusinessKpiCard
                icon={ShoppingBag}
                label="חברויות"
                value={biz?.membershipsThisMonth}
                sub="מתאמנים חדשים"
                color={biz?.membershipsThisMonth > 0 ? 'emerald' : 'amber'}
              />
            </div>
          </div>

          {/* GROUP 2 — Conversion */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">המרה</p>
            <div className="grid grid-cols-3 gap-2">
              <BusinessKpiCard
                icon={Percent}
                label="ליד → ניסיון"
                value={biz?.leadToTrialRate != null ? `${biz.leadToTrialRate}%` : null}
                sub={biz?.leadsThisMonth != null
                  ? `${biz.trialsThisMonth ?? 0} / ${biz.leadsThisMonth}`
                  : 'אין נתונים'}
                color={rateColor(biz?.leadToTrialRate, [30, 15])}
              />
              <BusinessKpiCard
                icon={BarChart2}
                label="ניסיון → חבר"
                value={biz?.trialToMembershipRate != null ? `${biz.trialToMembershipRate}%` : null}
                sub={biz?.trialsThisMonth != null
                  ? `${biz.membershipsThisMonth ?? 0} / ${biz.trialsThisMonth}`
                  : 'אין נתונים'}
                color={rateColor(biz?.trialToMembershipRate, [50, 25])}
              />
              <BusinessKpiCard
                icon={TrendingUp}
                label="ליד → חבר"
                value={biz?.leadToMembershipRate != null ? `${biz.leadToMembershipRate}%` : null}
                sub={biz?.leadsThisMonth != null
                  ? `${biz.membershipsThisMonth ?? 0} / ${biz.leadsThisMonth}`
                  : 'אין נתונים'}
                color={rateColor(biz?.leadToMembershipRate, [15, 8])}
              />
            </div>
          </div>

          {/* GROUP 3 — Financial */}
          <div>
            <p className="text-xs font-medium text-slate-400 mb-2">פיננסי</p>
            <div className="grid grid-cols-2 gap-2">
              <BusinessKpiCard
                icon={DollarSign}
                label="CAC"
                value={biz?.cac != null ? `₪${biz.cac.toLocaleString('he-IL')}` : null}
                sub={biz?.marketingConfigured
                  ? 'סה״כ שיווק ÷ חבר חדש'
                  : 'הגדר TOTAL_MONTHLY_MARKETING_SPEND'}
                unconfigured={!biz?.marketingConfigured}
                color="blue"
              />
              <BusinessKpiCard
                icon={DollarSign}
                label="Total MRR"
                value={biz?.totalMRR != null ? `₪${biz.totalMRR.toLocaleString('he-IL')}` : null}
                sub={biz?.priceConfigured
                  ? `${tr?.activeCount ?? 0} חברים פעילים`
                  : 'הגדר MEMBERSHIP_MONTHLY_PRICE'}
                unconfigured={!biz?.priceConfigured}
                color={biz?.totalMRR > 0 ? 'violet' : 'slate'}
              />
            </div>
          </div>

          {(!biz?.priceConfigured || !biz?.marketingConfigured) && (
            <p className="text-xs text-slate-400 text-center">
              להפעלת CAC ו-MRR הגדר ב-SystemConfig:
              <span className="font-mono mx-1 bg-slate-100 px-1 rounded">TOTAL_MONTHLY_MARKETING_SPEND</span>
              ו-
              <span className="font-mono mx-1 bg-slate-100 px-1 rounded">MEMBERSHIP_MONTHLY_PRICE</span>
            </p>
          )}
        </div>

        {/* 6 QUESTION TILES */}
        <div className="grid grid-cols-2 gap-3">

          <StatusTile
            question="WhatsApp עובד?"
            icon={MessageSquare}
            status={sig.whatsappStatus}
            value={wa.queueSent24h != null ? wa.queueSent24h : null}
            sub={wa.enabled
              ? `${wa.queueSent24h ?? 0} נשלחו · ${wa.queueFailed24h ?? 0} נכשלו (24ש)`
              : 'KILL SWITCH פעיל'}
            linkTo="WhatsAppHealthDashboard"
          />

          <StatusTile
            question="אוטומציות עובדות?"
            icon={Zap}
            status={sig.automationStatus}
            value={wa.sentToday != null ? wa.sentToday : null}
            sub={`נשלחו היום · ${wa.skippedToday ?? 0} דולגו`}
          />

          <StatusTile
            question="ניסיונות נקבעים?"
            icon={CalendarCheck}
            status={sig.trialsStatus}
            value={biz.trialsThisMonth}
            sub={`${biz.trialsThisMonth ?? 0} החודש`}
          />

          <StatusTile
            question="חברויות נמכרות?"
            icon={TrendingUp}
            status={sig.membershipsStatus}
            value={tr.activeCount}
            sub={biz.leadToMembershipRate != null
              ? `${biz.membershipsThisMonth ?? 0} חדשים · ${biz.leadToMembershipRate}% ליד→חבר`
              : `${tr.newThisMonth ?? 0} חדשים החודש`}
            linkTo="ManageTrainees"
          />

          <StatusTile
            question="יש תקלות מערכת?"
            icon={AlertTriangle}
            status={sig.systemStatus}
            value={criticalCount + warningCount || null}
            sub={criticalCount + warningCount === 0
              ? 'הכל תקין'
              : `${criticalCount} קריטי · ${warningCount} אזהרה`}
          />
        </div>

        {/* Alerts (if any) */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest">התראות פעילות</h2>
            {alerts.map((a, i) => <AlertRow key={i} alert={a} />)}
          </div>
        )}

        {/* Key numbers secondary grid */}
        <div>
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">מספרים מרכזיים</h2>
          <div className="grid grid-cols-2 gap-3">
            <KpiStrip
              label="לידים פעילים"
              value={crm.activeLeads}
              sub="לא BOOKED/CLOSED/NO_RESPONSE"
            />
            <KpiStrip
              label="מתאמנים פעילים"
              value={tr.activeCount}
              sub="status=active"
            />
            <KpiStrip
              label="LEAD_NOT_FOUND (24ש)"
              value={wa.leadNotFound24h}
              sub={`${wa.leadNotFoundRate ?? 0}% מהנכנסים`}
            />
            <KpiStrip
              label="הפרות תקרה היום"
              value={wa.capViolationsToday}
              sub=">2 הודעות למתאמן"
            />
            <KpiStrip
              label="Opt-out היום"
              value={crm.optOutsToday}
              sub="לידים שביקשו הסרה"
            />
            <KpiStrip
              label="הודעות תקועות"
              value={wa.queueStaleCount}
              sub="queued >15 דקות"
            />
          </div>
        </div>

        {/* Quick links */}
        <div className="flex flex-wrap gap-2 pt-2">
          {[
            { label: 'WhatsApp Health', page: 'WhatsAppHealthDashboard' },
            { label: 'ניהול מתאמנים', page: 'ManageTrainees' },
            { label: 'WhatsApp Manager', page: 'WhatsAppManager' },
          ].map(({ label, page }) => (
            <Link
              key={page}
              to={createPageUrl(page)}
              className="rounded-full border border-slate-200 bg-white text-slate-600 text-xs px-4 py-1.5 hover:bg-slate-50 no-underline"
            >
              {label}
            </Link>
          ))}
        </div>

      </div>
    </div>
  );
}
