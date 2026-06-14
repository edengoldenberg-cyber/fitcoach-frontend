import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

export default function SeasonControlCard({ season, onCreate, onUpdateStatus }) {
  const [form, setForm] = React.useState({ season_name: '', start_date: '', end_date: '', prize_description: '' });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-slate-900">עונה נוכחית</h3>
        {season ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2"><span className="font-bold text-xl">{season.season_name}</span><Badge>{season.status}</Badge></div>
            <p className="text-sm text-slate-600">{season.start_date || '-'} עד {season.end_date || '-'}</p>
            <p className="text-sm text-slate-600">פרס: {season.prize_description || '-'}</p>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button onClick={() => onUpdateStatus(season, 'active')}>התחל / הפעל</Button>
              <Button variant="outline" onClick={() => onUpdateStatus(season, 'paused')}>השהה</Button>
              <Button variant="outline" onClick={() => onUpdateStatus(season, 'ended')}>סיים</Button>
              <Button variant="destructive" onClick={() => onUpdateStatus(season, 'archived')}>ארכב</Button>
            </div>
          </div>
        ) : <p className="text-sm text-slate-500">אין עונה פעילה כרגע.</p>}
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <h3 className="font-bold text-slate-900">פתיחת עונה חדשה</h3>
        <Input value={form.season_name} onChange={(e) => setForm({ ...form, season_name: e.target.value })} placeholder="שם עונה" />
        <div className="grid grid-cols-2 gap-2">
          <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
        </div>
        <Textarea value={form.prize_description} onChange={(e) => setForm({ ...form, prize_description: e.target.value })} placeholder="תיאור פרס" />
        <Button disabled={!form.season_name.trim()} onClick={() => onCreate(form)}>צור עונה</Button>
      </div>
    </div>
  );
}