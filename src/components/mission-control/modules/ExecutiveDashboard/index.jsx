import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Zap, CheckCircle2, Clock, XCircle, AlertTriangle, Database, RefreshCw,
} from 'lucide-react';
import { SectionHeader, QuickBtn, MiniStat } from '../../shared/ui.jsx';

function KPI({ label, value, sub, color = 'slate', icon }) {
  const colors = {
    green:  { bg: 'bg-green-50',  text: 'text-green-700'  },
    red:    { bg: 'bg-red-50',    text: 'text-red-700'    },
    amber:  { bg: 'bg-amber-50',  text: 'text-amber-700'  },
    teal:   { bg: 'bg-teal-50',   text: 'text-teal-700'   },
    blue:   { bg: 'bg-blue-50',   text: 'text-blue-700'   },
    slate:  { bg: 'bg-slate-50',  text: 'text-slate-800'  },
  };
  const c = colors[color] || colors.slate;
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${c.bg}`}>{icon}</div>
      <div>
        <p className={`text-3xl font-bold ${c.text}`}>{value}</p>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
}

export default function ExecutiveDashboard({ coachEmail }) {
  const { data: automations = [] } = useQuery({
    queryKey: ['whatsappAutomations', coachEmail],
    queryFn:  () => base44.entities.WhatsAppAutomation.filter({ coach_email: coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 60000,
  });

  const { data: queueItems = [] } = useQuery({
    queryKey: ['whatsappQueue', coachEmail],
    queryFn:  () => base44.entities.WhatsAppMessageQueue.filter({ coach_email: coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 20000,
  });

  const { data: arboxStatusRes } = useQuery({
    queryKey: ['arboxStatus'],
    queryFn:  () => base44.functions.invoke('getArboxStatus', {}),
    staleTime: 60000,
  });

  const { data: absenceRes } = useQuery({
    queryKey: ['arboxAbsence', coachEmail],
    queryFn:  () => base44.functions.invoke('getArboxAbsenceReport', { coachEmail }),
    enabled:  !!coachEmail,
    staleTime: 120000,
  });

  const enabledAutomations = automations.filter(a => a.enabled).length;
  const queueSent    = queueItems.filter(q => q.status === 'sent').length;
  const queueFailed  = queueItems.filter(q => q.status === 'failed').length;
  const queuePending = queueItems.filter(q => q.status === 'queued' || q.status === 'sending').length;
  const arboxStatus  = arboxStatusRes?.data;
  const tiers        = absenceRes?.data?.tiers ?? {};
  const highRisk     = ['days30','days45','days60','days90','days90p'].reduce((s, k) => s + (tiers[k]?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <SectionHeader title="מרכז בקרה" sub="סיכום מצב מערכת FitCoach Enterprise" />

      <div className="grid grid-cols-4 gap-4">
        <KPI label="אוטומציות פעילות" value={enabledAutomations} sub={`מתוך ${automations.length}`}  color="teal"  icon={<Zap className="w-6 h-6 text-teal-500" />} />
        <KPI label="הודעות נשלחו"    value={queueSent}            sub="סה״כ מהתחלה"                color="green" icon={<CheckCircle2 className="w-6 h-6 text-green-500" />} />
        <KPI label="ממתינות לשליחה" value={queuePending}          sub="בתור כעת"                  color="blue"  icon={<Clock className="w-6 h-6 text-blue-500" />} />
        <KPI label="הודעות שנכשלו"  value={queueFailed}           sub="טעינות חוזרות"             color="red"   icon={<XCircle className="w-6 h-6 text-red-500" />} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <KPI label="בסיכון גבוה (21+ ימים)" value={highRisk} sub="מחכים להתעוררות" color="amber"
          icon={<AlertTriangle className="w-6 h-6 text-amber-500" />} />
        <KPI label="לקוחות פעילים" value={absenceRes?.data?.total ?? '—'}
          sub="מציג לקוחות פעילים בלבד"
          color={arboxStatus?.connected ? 'green' : 'slate'}
          icon={<Database className="w-6 h-6 text-slate-400" />} />
        <div className={`border rounded-xl p-5 flex items-center gap-4 ${arboxStatus?.connected ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <Database className={`w-7 h-7 ${arboxStatus?.connected ? 'text-green-600' : 'text-amber-500'}`} />
          <div>
            <p className={`text-sm font-bold ${arboxStatus?.connected ? 'text-green-700' : 'text-amber-700'}`}>
              Arbox {arboxStatus?.connected ? 'מחובר ✅' : 'לא מחובר ⚠️'}
            </p>
            <p className="text-xs text-slate-400">{arboxStatus?.status ?? 'לא נבדק'}</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-700 mb-3">פעולות מהירות</p>
        <div className="flex gap-3 flex-wrap">
          <QuickBtn icon={<RefreshCw className="w-4 h-4" />} label="הרץ Worker" onClick={async () => {
            const r = await base44.functions.invoke('whatsAppQueueWorker', {});
            toast.success(`Worker: processed=${r?.data?.processed}, failed=${r?.data?.failed}`);
          }} />
          <QuickBtn icon={<Database className="w-4 h-4" />} label="סנכרן Arbox" onClick={async () => {
            const r = await base44.functions.invoke('syncArboxMembers', { coachEmail });
            r?.ok ? toast.success(`סונכרנו ${r.data?.synced} חברים`) : toast.error(r?.error);
          }} color="blue" />
        </div>
      </div>
    </div>
  );
}
