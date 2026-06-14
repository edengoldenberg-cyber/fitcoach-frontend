import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle, XCircle, AlertCircle, Clock, RefreshCw, ChevronDown, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';

function relativeTime(isoString) {
  if (!isoString) return '—';
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function Step({ num, label, status, detail }) {
  // status: 'pass' | 'fail' | 'pending' | 'skip'
  const cfg = {
    pass: { icon: <CheckCircle className="w-4 h-4 text-green-500" />, bg: 'bg-green-50 border-green-200', text: 'text-green-700' },
    fail: { icon: <XCircle className="w-4 h-4 text-red-500" />, bg: 'bg-red-50 border-red-200', text: 'text-red-700' },
    pending: { icon: <AlertCircle className="w-4 h-4 text-slate-300" />, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-400' },
    skip: { icon: <AlertCircle className="w-4 h-4 text-amber-500" />, bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
  }[status] || { icon: <AlertCircle className="w-4 h-4 text-slate-300" />, bg: 'bg-slate-50 border-slate-200', text: 'text-slate-400' };

  return (
    <div className={`flex items-start gap-3 p-2.5 rounded-lg border ${cfg.bg}`}>
      <div className="flex items-center gap-2 min-w-[20px]">
        <span className={`text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center border font-mono ${status === 'pass' ? 'bg-green-500 text-white border-green-500' : status === 'fail' ? 'bg-red-500 text-white border-red-500' : 'bg-slate-200 text-slate-500 border-slate-300'}`}>
          {num}
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {cfg.icon}
          <span className={`text-sm font-semibold ${cfg.text}`}>{label}</span>
        </div>
        {detail && (
          <div className={`text-xs mt-1 font-mono break-all ${cfg.text} opacity-80`}>{detail}</div>
        )}
      </div>
    </div>
  );
}

export default function WebhookHealthPanel({ coachEmail }) {
  const [showRaw, setShowRaw] = useState(false);
  const [liveMode, setLiveMode] = useState(true);

  const { data: coachRecords = [], refetch: refetchCoach, dataUpdatedAt: coachUpdated, error: coachError } = useQuery({
    queryKey: ['systemHealth', coachEmail],
    queryFn: async () => {
      try {
        return await base44.entities.SystemHealth.filter({ coach_email: coachEmail });
      } catch (err) {
        console.error('[WebhookHealthPanel] Coach health query failed:', err.message);
        return [];
      }
    },
    enabled: !!coachEmail,
    refetchInterval: liveMode ? 3000 : 15000,
    retry: false
  });

  const { data: systemRecords = [], refetch: refetchSystem, error: systemError } = useQuery({
    queryKey: ['systemHealthSystem'],
    queryFn: async () => {
      try {
        return await base44.entities.SystemHealth.filter({ coach_email: 'system' });
      } catch (err) {
        console.error('[WebhookHealthPanel] System health query failed:', err.message);
        return [];
      }
    },
    refetchInterval: liveMode ? 3000 : 15000,
    retry: false
  });

  const { data: recentDiagLogs = [], error: diagError } = useQuery({
    queryKey: ['inboundDiagLogs'],
    queryFn: async () => {
      try {
        const all = await base44.entities.WhatsAppDiagnosticsLog.list('-created_date', 50);
        return all.filter(l => {
          const ev = l.payload?.flowEvent || '';
          return ['INBOUND_RAW', 'LEAD_NOT_FOUND', 'LEAD_MATCHED', 'INBOUND_MESSAGE_SAVED',
            'INBOUND_DUPLICATE_SKIPPED', 'INBOUND_ADVANCE_SUCCESS', 'INBOUND_ADVANCE_FAILED'].includes(ev);
        });
      } catch (err) {
        console.error('[WebhookHealthPanel] Diag logs query failed:', err.message);
        return [];
      }
    },
    refetchInterval: liveMode ? 3000 : 15000,
    retry: false
  });

  const coachHealth = coachRecords[0];
  const systemHealth = systemRecords[0];

  const sysTime = systemHealth?.lastInboundWebhookReceivedAt ? new Date(systemHealth.lastInboundWebhookReceivedAt).getTime() : 0;
  const coachTime = coachHealth?.lastInboundWebhookReceivedAt ? new Date(coachHealth.lastInboundWebhookReceivedAt).getTime() : 0;
  const h = sysTime > coachTime ? systemHealth : (coachHealth || systemHealth);

  const pipeStatus = h?.inboundPipelineStatus || 'NOT_RECEIVED';
  const receivedAt = h?.lastInboundWebhookReceivedAt;
  const rawPayload = h?.lastInboundRawPayload;
  const parseSuccess = h?.lastInboundParseSuccess;
  const leadMatched = h?.lastInboundLeadMatched;
  const failureReason = h?.lastInboundFailureReason;
  const messageText = coachHealth?.lastInboundWebhookMessageText || h?.lastInboundWebhookMessageText;
  const leadId = coachHealth?.lastInboundWebhookLeadId || h?.lastInboundWebhookLeadId;

  // Derive step statuses
  const stepReceived = pipeStatus !== 'NOT_RECEIVED' ? 'pass' : 'pending';
  const stepParsed = parseSuccess === true ? 'pass' : parseSuccess === false ? 'fail' : pipeStatus === 'NOT_RECEIVED' ? 'pending' : 'pending';
  const stepMatched = leadMatched === true ? 'pass' : leadMatched === false ? 'fail' : stepParsed !== 'pass' ? 'pending' : 'pending';
  const stepStored = leadMatched === true ? 'pass' : stepMatched !== 'pass' ? 'pending' : 'pending';
  const stepFlow = pipeStatus === 'MATCHED_SUCCESSFULLY' ? 'pass' : stepStored !== 'pass' ? 'pending' : 'pending';

  const handleRefresh = () => { refetchCoach(); refetchSystem(); };

  // Most recent 5 inbound diag logs
  const recentInbound = recentDiagLogs.slice(0, 5);

  // Show error notice if queries fail
  const hasErrors = coachError || systemError || diagError;

  return (
    <div className="space-y-4">
      {hasErrors && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 p-2 rounded">
          ⚠️ Some health data failed to load. Showing partial status.
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
          {liveMode ? <Wifi className="w-4 h-4 text-green-500 animate-pulse" /> : <WifiOff className="w-4 h-4 text-slate-400" />}
          Inbound Webhook Debug
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLiveMode(v => !v)}
            className={`text-xs px-2 py-1 rounded-full border font-medium transition-colors ${liveMode ? 'bg-green-100 text-green-700 border-green-300' : 'bg-slate-100 text-slate-500 border-slate-300'}`}
          >
            {liveMode ? '🔴 LIVE' : '⏸ Paused'}
          </button>
          <Button size="sm" variant="ghost" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Last received timestamp */}
      <div className="text-xs text-slate-500 flex items-center gap-1.5">
        <Clock className="w-3 h-3" />
        {receivedAt
          ? <span>Last webhook: <strong className="text-slate-700">{relativeTime(receivedAt)}</strong> ({new Date(receivedAt).toLocaleString('he-IL')})</span>
          : <span className="italic text-slate-400">No webhook received yet</span>
        }
      </div>

      {/* Pipeline steps */}
      <div className="space-y-2">
        <Step num="1" label="Request received by Base44"
          status={stepReceived}
          detail={receivedAt ? `at ${new Date(receivedAt).toLocaleTimeString('he-IL')}` : 'Waiting...'}
        />
        <Step num="2" label="Raw body parsed"
          status={stepParsed}
          detail={
            parseSuccess === false
              ? (failureReason || 'Parse failed — see raw payload below')
              : parseSuccess === true
              ? 'JSON parsed successfully'
              : 'Waiting...'
          }
        />
        <Step num="3" label="Lead matched"
          status={stepMatched}
          detail={
            leadMatched === false
              ? (failureReason || 'No lead found for this phone')
              : leadMatched === true
              ? `Lead ID: ${leadId || '?'}`
              : 'Waiting...'
          }
        />
        <Step num="4" label="Message stored in thread"
          status={stepStored}
          detail={
            stepStored === 'pass' && messageText
              ? `"${messageText}"`
              : stepStored === 'pass'
              ? 'Message stored'
              : 'Waiting...'
          }
        />
        <Step num="5" label="Sales flow triggered"
          status={stepFlow}
          detail={stepFlow === 'pass' ? 'salesFlowRunner invoked' : 'Waiting...'}
        />
      </div>

      {/* Failure reason callout */}
      {failureReason && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-lg font-mono break-all">
          ❌ {failureReason}
        </div>
      )}

      {/* Recent diag log events */}
      {recentInbound.length > 0 && (
        <div className="border rounded-lg overflow-hidden">
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
                  <span className="text-slate-500 mr-2">{relativeTime(log.created_date)}</span>
                  <span className={isGood ? 'text-green-400' : isBad ? 'text-red-400' : 'text-amber-400'}>
                    {ev}
                  </span>
                  {log.payload?.fromPhone && <span className="text-slate-400 ml-2">from: {log.payload.fromPhone}</span>}
                  {log.payload?.leadId && <span className="text-slate-400 ml-2">lead: {log.payload.leadId}</span>}
                  {log.payload?.detail && <span className="text-red-400 ml-2">→ {String(log.payload.detail).slice(0, 80)}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Raw payload toggle */}
      <div className="border-t pt-3">
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 font-medium"
        >
          {showRaw ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {rawPayload ? 'Last raw inbound payload' : 'No raw payload yet'}
        </button>
        {showRaw && rawPayload && (
          <pre className="mt-2 text-xs bg-slate-900 text-green-400 p-3 rounded overflow-auto max-h-64 whitespace-pre-wrap break-all">
            {(() => { try { return JSON.stringify(JSON.parse(rawPayload), null, 2); } catch { return rawPayload; } })()}
          </pre>
        )}
      </div>
    </div>
  );
}