import React from 'react';
import { RefreshCw } from 'lucide-react';
import { fmtDate } from './utils.js';

export function SectionHeader({ title, sub }) {
  return (
    <div className="mb-1">
      <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </div>
  );
}

export function EmptyState({ icon, msg }) {
  return (
    <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-xl bg-white">
      <div className="text-slate-300 mx-auto mb-3 flex justify-center">{icon}</div>
      <p className="text-slate-400 text-sm">{msg}</p>
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="text-center py-12">
      <RefreshCw className="w-6 h-6 animate-spin mx-auto text-slate-300" />
    </div>
  );
}

export function StatusBadge({ status }) {
  const map = {
    sent:    'bg-green-100 text-green-700',
    failed:  'bg-red-100 text-red-700',
    queued:  'bg-blue-100 text-blue-700',
    sending: 'bg-amber-100 text-amber-700',
    active:  'bg-green-100 text-green-700',
    inactive:'bg-slate-100 text-slate-600',
    frozen:  'bg-blue-100 text-blue-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-slate-100 text-slate-600'}`}>
      {status}
    </span>
  );
}

export function QuickBtn({ icon, label, onClick, color = 'slate' }) {
  const [loading, setLoading] = React.useState(false);
  const handle = async () => {
    setLoading(true);
    try { await onClick(); } finally { setLoading(false); }
  };
  return (
    <button onClick={handle} disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
        color === 'blue' ? 'bg-blue-50 border-blue-200 text-blue-700 hover:bg-blue-100' :
        color === 'red'  ? 'bg-red-50 border-red-200 text-red-700 hover:bg-red-100'   :
        'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
      }`}>
      {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}

export function IconBtn({ icon, title, onClick, color = 'slate' }) {
  return (
    <button onClick={onClick} title={title}
      className={`p-1.5 rounded transition-colors ${
        color === 'blue' ? 'hover:bg-blue-100 text-blue-500' :
        color === 'teal' ? 'hover:bg-teal-100 text-teal-600' :
        color === 'red'  ? 'hover:bg-red-100 text-red-500'   :
        'hover:bg-slate-100 text-slate-500'
      }`}>
      {icon}
    </button>
  );
}

export function MiniStat({ label, value, color = 'text-slate-700' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-3 text-center">
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export function BigKPI({ label, value, icon, color = 'text-slate-700' }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3">
      {icon}
      <div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-sm text-slate-500">{label}</p>
      </div>
    </div>
  );
}

export function QueueTable({ items = [], showError = false }) {
  if (items.length === 0) {
    return (
      <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-xl bg-white">
        <p className="text-slate-400 text-sm">אין פריטים בסטטוס זה</p>
      </div>
    );
  }
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-800 text-white">
            {['Queue ID','טלפון','שם','סוג','הודעה','נוצר','נשלח','ניסיונות','סטטוס', showError && 'שגיאה'].filter(Boolean).map(h => (
              <th key={h} className="text-right px-3 py-2.5 font-semibold">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((q, i) => (
            <tr key={q.id} className={`border-b border-slate-100 hover:bg-slate-50 ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
              <td className="px-3 py-2 font-mono text-slate-400">{q.id.slice(-8)}</td>
              <td className="px-3 py-2 font-mono">{q.to_phone_e164}</td>
              <td className="px-3 py-2">{q.to_name || '—'}</td>
              <td className="px-3 py-2 text-slate-500">{q.context_type || '—'}</td>
              <td className="px-3 py-2 max-w-[150px] truncate text-slate-600">{q.rendered_text?.slice(0, 55)}</td>
              <td className="px-3 py-2 text-slate-400">{fmtDate(q.created_at)}</td>
              <td className="px-3 py-2 text-slate-400">{fmtDate(q.sent_at)}</td>
              <td className="px-3 py-2 text-center">{q.attempts ?? 0}</td>
              <td className="px-3 py-2"><StatusBadge status={q.status} /></td>
              {showError && <td className="px-3 py-2 text-red-500 max-w-[120px] truncate">{q.error || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
