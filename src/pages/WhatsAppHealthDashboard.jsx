import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import {
  MessageSquare, AlertTriangle, CheckCircle, XCircle, Clock,
  RefreshCw, Zap, Phone, Shield, Activity, TrendingDown, Users
} from 'lucide-react';

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n) { return n == null ? '—' : String(n); }

function StatusDot({ status }) {
  const map = {
    green:  'bg-emerald-500',
    yellow: 'bg-amber-400',
    red:    'bg-red-500',
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${map[status] || 'bg-slate-300'}`} />
  );
}

function KpiCard({ icon: Icon, label, value, sub, status }) {
  const border = status === 'red' ? 'border-red-200 bg-red-50' :
                 status === 'yellow' ? 'border-amber-200 bg-amber-50' :
                 status === 'green' ? 'border-emerald-200 bg-emerald-50' :
                 'border-slate-200 bg-white';
  const text = status === 'red' ? 'text-red-700' :
               status === 'yellow' ? 'text-amber-700' :
               status === 'green' ? 'text-emerald-700' : 'text-slate-700';
  return (
    <div className={`rounded-xl border p-4 ${border}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-4 h-4 ${text} opacity-70`} />
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>
      <div className={`text-2xl font-bold ${text}`}>{fmt(value)}</div>
      {sub && <div className="text-xs text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function AlertBanner({ alert }) {
  const styles = {
    critical: 'bg-red-50 border-red-200 text-red-800',
    warning:  'bg-amber-50 border-amber-200 text-amber-800',
    info:     'bg-blue-50 border-blue-200 text-blue-800',
  };
  const icons = {
    critical: <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />,
    warning:  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />,
    info:     <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />,
  };
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-4 py-3 text-sm ${styles[alert.level]}`}>
      {icons[alert.level]}
      <span>{alert.message}</span>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{children}</h2>
  );
}

function FailedTable({ items, title }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-2">{title}</h3>
      <div className="rounded-xl border border-red-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-red-50 text-red-600 text-xs">
            <tr>
              <th className="text-right px-3 py-2">טלפון</th>
              <th className="text-right px-3 py-2">שם</th>
              <th className="text-right px-3 py-2">תבנית</th>
              <th className="text-right px-3 py-2">גיל</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-red-50">
            {items.map((item, i) => (
              <tr key={i} className="bg-white">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{item.phone}</td>
                <td className="px-3 py-2 text-slate-700">{item.name || '—'}</td>
                <td className="px-3 py-2 text-slate-500">{item.template}</td>
                <td className="px-3 py-2 text-red-500">{item.age}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StaleTable({ items }) {
  if (!items?.length) return null;
  return (
    <div>
      <h3 className="text-sm font-semibold text-amber-700 mb-2">
        הודעות תקועות בתור ({items.length})
      </h3>
      <div className="rounded-xl border border-amber-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-amber-50 text-amber-700 text-xs">
            <tr>
              <th className="text-right px-3 py-2">טלפון</th>
              <th className="text-right px-3 py-2">תבנית</th>
              <th className="text-right px-3 py-2">גיל (דקות)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-50">
            {items.map((item, i) => (
              <tr key={i} className="bg-white">
                <td className="px-3 py-2 text-slate-600 font-mono text-xs">{item.phone}</td>
                <td className="px-3 py-2 text-slate-500">{item.template}</td>
                <td className="px-3 py-2 text-amber-600 font-semibold">{item.ageMin}′</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function WhatsAppHealthDashboard() {
  const [lastManualRefresh, setLastManualRefresh] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: raw, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['opmon-whatsapp', user?.email],
    queryFn: () => base44.functions.invoke('operationalMonitoringAggregator', { coachEmail: user?.email }),
    enabled: !!user?.email,
    refetchInterval: 5 * 60_000,
    staleTime:       4 * 60_000,
  });

  function handleRefresh() {
    setLastManualRefresh(new Date().toLocaleTimeString('he-IL'));
    refetch();
  }

  const wa = raw?.whatsapp;
  const alerts = raw?.alerts || [];
  const criticals = alerts.filter(a => a.level === 'critical');
  const warnings  = alerts.filter(a => a.level === 'warning');

  const updatedAt = raw?.updatedAt
    ? new Date(raw.updatedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
    : null;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-slate-400 flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>טוען מדדי WhatsApp...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-red-500 text-sm">שגיאה בטעינת נתונים: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24" dir="rtl">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                 style={{ backgroundColor: '#25D366' }}>
              <MessageSquare className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">WhatsApp Health</h1>
              {updatedAt && (
                <p className="text-xs text-slate-400">עודכן: {updatedAt}</p>
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

        {/* Kill Switch Banner */}
        <div className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
          wa?.enabled ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-300'
        }`}>
          {wa?.enabled
            ? <CheckCircle className="w-5 h-5 text-emerald-500" />
            : <XCircle className="w-5 h-5 text-red-500" />}
          <div className="flex-1">
            <div className={`font-semibold text-sm ${wa?.enabled ? 'text-emerald-700' : 'text-red-700'}`}>
              {wa?.enabled ? 'WhatsApp פעיל' : 'KILL SWITCH פעיל — שליחה חסומה'}
            </div>
            <div className="text-xs text-slate-500">
              ספק: {wa?.providerConnected ? 'מחובר ✓' : 'לא מחובר ✗'}
            </div>
          </div>
          <StatusDot status={wa?.enabled && wa?.providerConnected ? 'green' : 'red'} />
        </div>

        {/* Alerts */}
        {alerts.length > 0 && (
          <div className="space-y-2">
            <SectionTitle>התראות ({criticals.length} קריטי, {warnings.length} אזהרה)</SectionTitle>
            {alerts.map((a, i) => <AlertBanner key={i} alert={a} />)}
          </div>
        )}

        {alerts.length === 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span className="text-sm text-emerald-700 font-medium">אין התראות פעילות — המערכת תקינה</span>
          </div>
        )}

        {/* Pipeline KPIs */}
        <div>
          <SectionTitle>Pipeline נכנס (24 שעות)</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={Phone}
              label="הודעות נכנסות"
              value={wa?.totalInbound24h}
              sub="כל ה-webhooks שהתקבלו"
              status={wa?.totalInbound24h > 0 ? 'green' : 'yellow'}
            />
            <KpiCard
              icon={AlertTriangle}
              label="LEAD_NOT_FOUND"
              value={wa?.leadNotFound24h}
              sub={`${wa?.leadNotFoundRate ?? 0}% מכלל הנכנסים`}
              status={wa?.leadNotFoundRate > 8 ? 'red' : wa?.leadNotFoundRate > 3 ? 'yellow' : 'green'}
            />
            <KpiCard
              icon={Zap}
              label="FLOW_NO_ENGINE_CLAIMED"
              value={wa?.flowNoClaim24h}
              sub="הפניות שלא נתבעו"
              status={wa?.flowNoClaim24h > 3 ? 'red' : wa?.flowNoClaim24h > 0 ? 'yellow' : 'green'}
            />
            <KpiCard
              icon={Users}
              label="Phone Collisions"
              value={wa?.multiCollision24h}
              sub="ליד/מתאמן אותו מספר"
              status={wa?.multiCollision24h > 10 ? 'red' : wa?.multiCollision24h > 3 ? 'yellow' : 'green'}
            />
          </div>
        </div>

        {/* Queue KPIs */}
        <div>
          <SectionTitle>תור הודעות (24 שעות)</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={CheckCircle}
              label="נשלחו"
              value={wa?.queueSent24h}
              sub="sent / provider_unconfirmed"
              status="green"
            />
            <KpiCard
              icon={XCircle}
              label="נכשלו"
              value={wa?.queueFailed24h}
              sub={`${wa?.queueFailRate ?? 0}% כשל`}
              status={wa?.queueFailRate > 5 ? 'red' : wa?.queueFailRate > 1 ? 'yellow' : 'green'}
            />
            <KpiCard
              icon={Clock}
              label="תקועות >15 דקות"
              value={wa?.queueStaleCount}
              sub="status=queued ישן"
              status={wa?.queueStaleCount > 5 ? 'red' : wa?.queueStaleCount > 0 ? 'yellow' : 'green'}
            />
            <KpiCard
              icon={Activity}
              label="סה״כ בתור (24ש)"
              value={wa?.queueTotal24h}
              sub="כל הרשומות"
              status={null}
            />
          </div>
        </div>

        {/* Daily Cap */}
        <div>
          <SectionTitle>תקרת הודעות יומית</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <KpiCard
              icon={TrendingDown}
              label="נשלחו היום"
              value={wa?.sentToday}
              sub="message_sent events"
              status={wa?.sentToday > 0 ? 'green' : 'yellow'}
            />
            <KpiCard
              icon={Shield}
              label="הפרות תקרה היום"
              value={wa?.capViolationsToday}
              sub=">2 הודעות למתאמן"
              status={wa?.capViolationsToday > 0 ? 'yellow' : 'green'}
            />
          </div>
        </div>

        {/* Routing Distribution */}
        {wa?.routing && (wa.routing.ai + wa.routing.flow + wa.routing.legacy) > 0 && (
          <div>
            <SectionTitle>התפלגות ניתוב (24ש)</SectionTitle>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-center">
                <div className="text-2xl font-bold text-blue-700">{wa.routing.ai}</div>
                <div className="text-xs text-blue-500 mt-1">AI Brain</div>
              </div>
              <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 text-center">
                <div className="text-2xl font-bold text-teal-700">{wa.routing.flow}</div>
                <div className="text-xs text-teal-500 mt-1">Sales Flow</div>
              </div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-center">
                <div className="text-2xl font-bold text-slate-600">{wa.routing.legacy}</div>
                <div className="text-xs text-slate-400 mt-1">Legacy</div>
              </div>
            </div>
          </div>
        )}

        {/* Failure Tables */}
        {(wa?.failedItems?.length > 0 || wa?.staleItems?.length > 0) && (
          <div className="space-y-4">
            <SectionTitle>פירוט כשלים</SectionTitle>
            <FailedTable items={wa?.failedItems} title={`הודעות שנכשלו (${wa?.queueFailed24h})`} />
            <StaleTable items={wa?.staleItems} />
          </div>
        )}

        {/* Active schedulers */}
        {wa?.schedulersSeen?.length > 0 && (
          <div>
            <SectionTitle>scheduler-ים פעילים היום</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {wa.schedulersSeen.map(s => (
                <span key={s}
                  className="rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs px-3 py-1">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
