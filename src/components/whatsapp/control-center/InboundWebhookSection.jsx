import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react';

function relativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `לפני ${diff}s`;
  if (diff < 3600) return `לפני ${Math.floor(diff / 60)}m`;
  return `לפני ${Math.floor(diff / 3600)}h`;
}

function Step({ num, label, status, detail }) {
  const cfg = {
    pass: { icon: <CheckCircle className="w-4 h-4 text-green-500" />, bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
    fail: { icon: <XCircle className="w-4 h-4 text-red-500" />, bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
    pending: { icon: <AlertCircle className="w-4 h-4 text-slate-300" />, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-400' },
    skip: { icon: <AlertCircle className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  }[status] || { icon: <AlertCircle className="w-4 h-4 text-slate-300" />, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-400' };

  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${cfg.bg}`}>
      <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border flex-shrink-0 font-mono mt-0.5 ${status === 'pass' ? 'bg-green-500 text-white border-green-500' : status === 'fail' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
        {num}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <span className={`text-sm font-semibold ${cfg.text}`}>{label}</span>
        </div>
        {detail && <div className={`text-xs mt-1 font-mono break-all ${cfg.text} opacity-80`}>{detail}</div>}
      </div>
    </div>
  );
}

export default function InboundWebhookSection() {
  const [showRaw, setShowRaw] = useState(false);
  const [liveMode, setLiveMode] = useState(true);

  const { data: coachRecords = [], refetch: refetchCoach } = useQuery({
    queryKey: ['webhookHealthCoach'],
    queryFn: () => base44.entities.SystemHealth.filter({ coach_email: 'system' }).catch(() => []),
    refetchInterval: liveMode ? 4000 : 20000,
  });

  const { data: systemRecords = [], refetch: refetchSystem } = useQuery({
    queryKey: ['webhookHealthSystem'],
    queryFn: () => base44.entities.SystemHealth.list('-updated_date', 5).catch(() => []),
    refetchInterval: liveMode ? 4000 : 20000,
  });

  const { data: recentDiagLogs = [] } = useQuery({
    queryKey: ['inboundDiagLogsCC'],
    queryFn: async () => {
      const all = await base44.entities.WhatsAppDiagnosticsLog.list('-created_date', 50);
      return all.filter(l => {
        const ev = l.payload?.flowEvent || '';
        return ['INBOUND_RAW', 'LEAD_NOT_FOUND', 'LEAD_MATCHED', 'INBOUND_MESSAGE_SAVED',
          'INBOUND_DUPLICATE_SKIPPED', 'INBOUND_ADVANCE_SUCCESS', 'INBOUND_ADVANCE_FAILED'].includes(ev);
      });
    },
    refetchInterval: liveMode ? 4000 : 20000,
  });

  // Pick most recent health record
  const allHealth = [...coachRecords, ...systemRecords];
  const h = allHealth.sort((a, b) => {
    const ta = a.lastInboundWebhookReceivedAt ? new Date(a.lastInboundWebhookReceivedAt).getTime() : 0;
    const tb = b.lastInboundWebhookReceivedAt ? new Date(b.lastInboundWebhookReceivedAt).getTime() : 0;
    return tb - ta;
  })[0] || null;

  const pipeStatus = h?.inboundPipelineStatus || 'NOT_RECEIVED';
  const receivedAt = h?.lastInboundWebhookReceivedAt;
  const rawPayload = h?.lastInboundRawPayload;
  const parseSuccess = h?.lastInboundParseSuccess;
  const leadMatched = h?.lastInboundLeadMatched;
  const failureReason = h?.lastInboundFailureReason;
  const messageText = h?.lastInboundWebhookMessageText;
  const leadId = h?.lastInboundWebhookLeadId;

  const stepReceived = pipeStatus !== 'NOT_RECEIVED' ? 'pass' : 'pending';
  const stepParsed = parseSuccess === true ? 'pass' : parseSuccess === false ? 'fail' : 'pending';
  const stepMatched = leadMatched === true ? 'pass' : leadMatched === false ? 'fail' : 'pending';
  const stepStored = leadMatched === true ? 'pass' : 'pending';
  const stepFlow = pipeStatus === 'MATCHED_SUCCESSFULLY' ? 'pass' : 'pending';

  const recentInbound = recentDiagLogs.slice(0, 6);

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 p-5 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          {liveMode
            ? <Wifi className="w-5 h-5 text-green-500 animate-pulse" />
            : <WifiOff className="w-5 h-5 text-slate-400" />
          }
          <h2 className="font-bold text-slate-800 text-lg">📥 Inbound Webhook Debug</h2>
          <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${liveMode ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {liveMode ? '🔴 LIVE' : '⏸ Paused'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLiveMode(v => !v)}
            className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${liveMode ? 'bg-green-100 text-green-700 border-green-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}
          >
            {liveMode ? 'עצור LIVE' : 'הפעל LIVE'}
          </button>
          <button
            onClick={() => { refetchCoach(); refetchSystem(); }}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-600" />
          </button>
        </div>
      </div>

      {/* Last received */}
      <div className="text-xs text-slate-500 flex items-center gap-1.5 mb-4 bg-slate-50 p-2 rounded-lg">
        <Clock className="w-3 h-3" />
        {receivedAt
          ? <span>Last webhook: <strong className="text-slate-700">{relativeTime(receivedAt)}</strong> — {new Date(receivedAt).toLocaleString('he-IL')}</span>
          : <span className="italic">No webhook received yet</span>
        }
      </div>

      {/* Pipeline steps */}
      <div className="space-y-2 mb-4">
        <Step num="1" label="Request received by Base44" status={stepReceived}
          detail={receivedAt ? `at ${new Date(receivedAt).toLocaleTimeString('he-IL')}` : 'Waiting...'} />
        <Step num="2" label="Raw body parsed" status={stepParsed}
          detail={parseSuccess === false ? (failureReason || 'Parse failed') : parseSuccess === true ? 'JSON parsed ✅' : 'Waiting...'} />
        <Step num="3" label="Lead matched" status={stepMatched}
          detail={leadMatched === false ? (failureReason || 'No lead found for this phone') : leadMatched === true ? `Lead ID: ${leadId || '?'}` : 'Waiting...'} />
        <Step num="4" label="Message stored in thread" status={stepStored}
          detail={stepStored === 'pass' && messageText ? `"${messageText}"` : stepStored === 'pass' ? 'Message stored ✅' : 'Waiting...'} />
        <Step num="5" label="Sales flow triggered" status={stepFlow}
          detail={stepFlow === 'pass' ? 'salesFlowRunner invoked ✅' : 'Waiting...'} />
      </div>

      {/* Failure reason */}
      {failureReason && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-lg font-mono break-all mb-3">
          ❌ {failureReason}
        </div>
      )}

      {/* Recent diag log events */}
      {recentInbound.length > 0 && (
        <div className="border rounded-xl overflow-hidden mb-3">
          <div className="bg-slate-800 text-slate-300 text-xs font-mono px-3 py-1.5 font-semibold">
            Recent inbound events
          </div>
          <div className="bg-slate-900 divide-y divide-slate-700">
            {recentInbound.map((log, i) => {
              const ev = log.payload?.flowEvent || '';
              const isGood = ['LEAD_MATCHED', 'INBOUND_MESSAGE_SAVED', 'INBOUND_ADVANCE_SUCCESS'].includes(ev);
              const isBad = ['LEAD_NOT_FOUND', 'INBOUND_ADVANCE_FAILED'].includes(ev);
              return (
                <div key={log.id || i} className="px-3 py-2 text-xs font-mono">
                  <span className="text-slate-500 ml-2">{relativeTime(log.created_date)}</span>
                  <span className={isGood ? 'text-green-400' : isBad ? 'text-red-400' : 'text-amber-400'}>{ev}</span>
                  {log.payload?.fromPhone && <span className="text-slate-400 mr-2"> from: {log.payload.fromPhone}</span>}
                  {log.payload?.leadId && <span className="text-slate-400 mr-1"> lead: {log.payload.leadId}</span>}
                  {log.payload?.detail && <span className="text-red-400 mr-1"> → {String(log.payload.detail).slice(0, 80)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw payload */}
      <div className="border-t pt-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
        >
          {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {rawPayload ? 'Last raw inbound payload' : 'No raw payload yet'}
        </button>
        {showRaw && rawPayload && (
          <pre className="mt-2 text-xs bg-slate-900 text-green-400 p-3 rounded-xl overflow-auto max-h-64 whitespace-pre-wrap break-all">
            {(() => { try { return JSON.stringify(JSON.parse(rawPayload), null, 2); } catch { return rawPayload; } })()}
          </pre>
        )}
      </div>
    </div>
  );
}