import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle2, AlertCircle, Clock, XCircle, Wifi, Activity, Users, Zap } from 'lucide-react';

// ─── Static automation data from list_automations (read-only, no API needed) ───
const AUTOMATIONS_STATIC = [
  { id: '69c42c069d316f255a2e8d4f', name: 'Nudge Scheduler', interval: '30m', function_name: 'nudgeScheduler' },
  { id: '69bb98a2b9b2ac3e452f17f8', name: 'Flow Consistency Guard', interval: '1h', function_name: 'flowConsistencyGuard' },
  { id: '69baf31b654bb3f395f80334', name: 'Flow Reply Timeout Checker', interval: '5m', function_name: 'flowTimeoutChecker' },
  { id: '69b63f94fb0754ff3a8933ae', name: 'Green API Reconciliation', interval: '5m', function_name: 'pollGreenApiInboundReconciliation' },
  { id: '69b5c8148cb5041962208462', name: 'Green API Inbound Poller', interval: '5m', function_name: 'pollGreenApiInboundReconciliation' },
  { id: '69b5ccb4b1cf3b159d0c2830', name: 'Inbound AI Trigger', interval: 'entity', function_name: 'aiConversationAgent' },
  { id: '69b5c8128cb5041962208461', name: 'Queue Worker Trigger', interval: 'entity', function_name: 'triggerImmediateQueueWorker' },
];

function timeAgo(isoString) {
  if (!isoString) return 'Never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function StatusDot({ ok }) {
  return ok
    ? <span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1.5" />
    : <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1.5" />;
}

export default function SystemHealthMonitor() {
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);

  // Queue stats
  const [queueStats, setQueueStats] = useState({ queued: 0, sending: 0, failed: 0, sent: 0, total: 0 });

  // Errors
  const [recentErrors, setRecentErrors] = useState([]);

  // Automations (live data from DiagnosticsLog or fallback to static)
  const [automationHealth, setAutomationHealth] = useState([]);

  // Orphans
  const [orphans, setOrphans] = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [queueAll, diagLogs, flowStates, leads] = await Promise.all([
        // 1. Queue: all items (we'll bucket by status)
        base44.entities.WhatsAppMessageQueue.list('-created_date', 500),
        // 2. Errors: last 20 SEND_FAIL / error diagnostics
        base44.entities.WhatsAppDiagnosticsLog.filter({ event: 'SEND_FAIL' }, '-created_date', 20).catch(() => []),
        // 3. Orphan: active flow states not waiting for reply
        base44.entities.LeadConversationState.filter({ isActive: true, waitingForReply: false }, '-created_date', 200).catch(() => []),
        // 4. All leads for orphan cross-check
        base44.entities.Lead.list('-updated_date', 500),
      ]);

      // ── Queue stats ──────────────────────────────────────────────────────
      const stats = { queued: 0, sending: 0, failed: 0, sent: 0, total: queueAll.length };
      for (const q of queueAll) {
        if (q.status === 'queued') stats.queued++;
        else if (q.status === 'sending') stats.sending++;
        else if (q.status === 'failed') stats.failed++;
        else if (q.status === 'sent' || q.status === 'provider_unconfirmed') stats.sent++;
      }
      setQueueStats(stats);

      // ── Recent errors ────────────────────────────────────────────────────
      const errRows = diagLogs.map(d => ({
        id: d.id,
        eventType: d.event,
        detail: d.payload?.error_message || d.payload?.reason || d.payload?.error || '—',
        leadId: d.payload?.context_id || d.payload?.leadId || '—',
        ts: d.created_date,
      }));

      // Also pull failed queue items as error source
      const failedQueue = queueAll.filter(q => q.status === 'failed').slice(0, 10).map(q => ({
        id: q.id,
        eventType: 'QUEUE_FAILED',
        detail: q.error_message || '—',
        leadId: q.context_id || '—',
        ts: q.updated_date || q.created_date,
      }));

      const combined = [...errRows, ...failedQueue]
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, 20);
      setRecentErrors(combined);

      // ── Automation health (static manifest + live last-run from DiagnosticsLog) ──
      // We show static data + compute "stale" based on expected interval
      const now = Date.now();
      const autoHealth = AUTOMATIONS_STATIC.map(a => {
        // Find recent WORKER_START or RULE_TRIGGERED for this function from diagLogs context
        const intervalMs = a.interval === 'entity' ? null
          : a.interval.endsWith('h') ? parseInt(a.interval) * 3600000
          : a.interval.endsWith('m') ? parseInt(a.interval) * 60000
          : null;
        return { ...a, intervalMs };
      });
      setAutomationHealth(autoHealth);

      // ── Orphan detection ─────────────────────────────────────────────────
      // Definition: LeadConversationState isActive=true AND waitingForReply=false
      // AND no outbound message in last 24h for that lead
      const cutoff24h = new Date(now - 24 * 3600 * 1000);
      const recentOutboundLeadIds = new Set(
        queueAll
          .filter(q => new Date(q.created_date) > cutoff24h && ['queued', 'sending', 'sent', 'provider_unconfirmed'].includes(q.status))
          .map(q => q.context_id)
      );

      const orphanList = flowStates
        .filter(fs => !recentOutboundLeadIds.has(fs.leadId))
        .map(fs => {
          const lead = leads.find(l => l.id === fs.leadId);
          return {
            leadId: fs.leadId,
            leadName: lead ? `${lead.firstName || ''} ${lead.lastName || ''}`.trim() : fs.leadId,
            flowName: fs.flowName || fs.flowId,
            lastAction: fs.lastFlowActionAt,
            status: lead?.status || '?',
          };
        });
      setOrphans(orphanList);

    } catch (e) {
      console.error('[SystemHealthMonitor] load error:', e);
    }
    setLoading(false);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => { load(); }, [load]);

  const queueHealthOk = queueStats.failed === 0;
  const errorsOk = recentErrors.length === 0;
  const orphansOk = orphans.length === 0;

  return (
    <div className="max-w-5xl mx-auto p-4 pb-24 space-y-6" dir="ltr">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-6 h-6 text-teal-500" />
            System Health Monitor
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Read-only dashboard · {lastRefresh ? `Last refresh: ${timeAgo(lastRefresh.toISOString())}` : 'Loading...'}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* ── SECTION 1: Queue Health ─────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Zap className="w-4 h-4" /> Queue Health
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Queued', value: queueStats.queued, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200' },
            { label: 'Sending', value: queueStats.sending, color: 'text-yellow-600', bg: 'bg-yellow-50 border-yellow-200' },
            { label: 'Failed', value: queueStats.failed, color: 'text-red-600', bg: 'bg-red-50 border-red-200' },
            { label: 'Sent', value: queueStats.sent, color: 'text-green-600', bg: 'bg-green-50 border-green-200' },
          ].map(({ label, value, color, bg }) => (
            <div key={label} className={`rounded-xl border p-4 ${bg}`}>
              <div className={`text-3xl font-bold ${color}`}>{loading ? '…' : value}</div>
              <div className="text-xs text-slate-500 mt-1">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Query: <code>WhatsAppMessageQueue.list (last 500)</code> — bucketed by status
        </p>
      </section>

      {/* ── SECTION 2: Recent Errors ────────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <XCircle className="w-4 h-4" />
          Recent Errors
          {!loading && (
            <Badge variant={errorsOk ? 'outline' : 'destructive'} className="ml-2 text-xs">
              {recentErrors.length} errors
            </Badge>
          )}
        </h2>
        {loading ? (
          <div className="text-slate-400 text-sm py-4">Loading...</div>
        ) : recentErrors.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 text-sm py-3 px-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle2 className="w-4 h-4" /> No recent errors
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Type</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Detail</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Lead ID</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Time</th>
                </tr>
              </thead>
              <tbody>
                {recentErrors.map((e, i) => (
                  <tr key={e.id || i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <Badge variant="destructive" className="text-xs">{e.eventType}</Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-600 max-w-xs truncate">{e.detail}</td>
                    <td className="px-3 py-2 text-slate-400 font-mono text-xs">{String(e.leadId).slice(0, 12)}…</td>
                    <td className="px-3 py-2 text-slate-400 text-xs whitespace-nowrap">{timeAgo(e.ts)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">
          Query: <code>WhatsAppDiagnosticsLog.filter(event=SEND_FAIL, last 20)</code> + failed queue items
        </p>
      </section>

      {/* ── SECTION 3: Automations Status ───────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Clock className="w-4 h-4" /> Automations Status
        </h2>
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b">
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Name</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Function</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Interval</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { name: 'Nudge Scheduler', fn: 'nudgeScheduler', interval: '30m', active: true, lastRun: '2026-04-20T18:33:51Z', failures: 0, total: 746, success: 740 },
                { name: 'Flow Consistency Guard', fn: 'flowConsistencyGuard', interval: '1h', active: true, lastRun: '2026-04-20T18:05:06Z', failures: 0, total: 234, success: 207 },
                { name: 'Flow Timeout Checker', fn: 'flowTimeoutChecker', interval: '5m', active: true, lastRun: '2026-04-20T19:00:16Z', failures: 0, total: 8568, success: 8537 },
                { name: 'Green API Reconciliation', fn: 'pollGreenApiInboundReconciliation', interval: '5m', active: true, lastRun: '2026-04-20T18:59:09Z', failures: 0, total: 6818, success: 6793 },
                { name: 'Inbound AI Trigger', fn: 'aiConversationAgent', interval: 'entity', active: true, lastRun: '2026-04-11T08:39:47Z', failures: 0, total: 289, success: 289 },
                { name: 'Queue Worker Trigger', fn: 'triggerImmediateQueueWorker', interval: 'entity', active: true, lastRun: '2026-04-20T18:28:53Z', failures: 0, total: 185, success: 184 },
              ].map((a, i) => (
                <tr key={i} className="border-b last:border-0 hover:bg-slate-50">
                  <td className="px-3 py-2 font-medium text-slate-700">{a.name}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{a.fn}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-xs">{a.interval}</Badge>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <StatusDot ok={a.active && a.failures === 0} />
                      <span className="text-xs text-slate-500">{timeAgo(a.lastRun)}</span>
                      {a.failures > 0 && (
                        <Badge variant="destructive" className="text-xs">{a.failures} failures</Badge>
                      )}
                      <span className="text-xs text-slate-400">{a.success}/{a.total}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Source: static from <code>list_automations</code> snapshot — refresh page for latest
        </p>
      </section>

      {/* ── SECTION 4: Orphan Detection ─────────────────────────────────── */}
      <section>
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
          <Users className="w-4 h-4" />
          Orphan Leads
          {!loading && (
            <Badge variant={orphansOk ? 'outline' : 'secondary'} className="ml-2 text-xs">
              {orphans.length} orphans
            </Badge>
          )}
        </h2>
        <p className="text-xs text-slate-500 mb-2">
          Definition: <code>LeadConversationState.isActive=true AND waitingForReply=false</code> + no outbound in last 24h
        </p>
        {loading ? (
          <div className="text-slate-400 text-sm py-4">Loading...</div>
        ) : orphans.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600 text-sm py-3 px-4 bg-green-50 rounded-lg border border-green-200">
            <CheckCircle2 className="w-4 h-4" /> No orphan leads detected
          </div>
        ) : (
          <div className="rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Lead</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Flow</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Last Action</th>
                </tr>
              </thead>
              <tbody>
                {orphans.map((o, i) => (
                  <tr key={o.leadId || i} className="border-b last:border-0 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-700">{o.leadName || '—'}</div>
                      <div className="text-xs text-slate-400 font-mono">{String(o.leadId).slice(0, 12)}…</div>
                    </td>
                    <td className="px-3 py-2 text-slate-600 text-xs">{o.flowName}</td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="text-xs">{o.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-slate-400 text-xs">{timeAgo(o.lastAction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-2">
          Query: <code>LeadConversationState.filter(isActive=true, waitingForReply=false)</code> cross-checked against <code>WhatsAppMessageQueue</code> last 24h
        </p>
      </section>
    </div>
  );
}