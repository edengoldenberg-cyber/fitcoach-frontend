import React from 'react';
import { Crown, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BADGES = ['🐺', '🔥', '⚡', '👑', '🐉', '💀', '🛡️', '💪', '⭐', '🐯'];

export default function GroupEditorCard({ group, members, onSave, onArchive, onRemoveMember, onMakeCaptain, onRemoveCaptain }) {
  const [draft, setDraft] = React.useState({
    display_name: group.display_name || group.name || '',
    slogan: group.slogan || '',
    badge_icon: group.badge_icon || '🔥'
  });

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{draft.badge_icon}</span>
            <h3 className="font-bold text-slate-900">{group.display_name || group.name}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-1"><Users className="inline w-3 h-3" /> {members.length}/{group.max_members || 5} חברים</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => onArchive(group)} className="text-red-600 hover:text-red-700">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Input value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} placeholder="שם קבוצה" />
        <Input value={draft.slogan} onChange={(e) => setDraft({ ...draft, slogan: e.target.value })} placeholder="סלוגן" />
      </div>
      <div className="flex flex-wrap gap-2">
        {BADGES.map((badge) => (
          <button key={badge} onClick={() => setDraft({ ...draft, badge_icon: badge })} className={`w-10 h-10 rounded-xl border ${draft.badge_icon === badge ? 'border-teal-500 bg-teal-50' : 'border-slate-200 bg-white'}`}>{badge}</button>
        ))}
      </div>
      <Button onClick={() => onSave(group, draft)} className="w-full">שמירת קבוצה</Button>

      <div className="border-t pt-3 space-y-2">
        {members.map((member) => {
          const isCaptain = group.captain_trainee_id === member.id;
          return (
            <div key={member.id} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 p-2">
              <span className="text-sm font-medium">{isCaptain && '👑 '}{member.full_name}</span>
              <div className="flex gap-1">
                {isCaptain ? (
                  <Button size="sm" variant="outline" onClick={() => onRemoveCaptain(group)}>הסר כתר</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => onMakeCaptain(group, member)}><Crown className="w-3 h-3 ml-1" /> קפטן</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onRemoveMember(group, member)} className="text-red-600">הסר</Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}