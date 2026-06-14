import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { X, Search, UserPlus, Check, Users } from 'lucide-react';

export default function AddGroupMembersModal({ group, onClose }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);

  const members = group?.members || [];
  const maxMembers = group?.max_members || 5;
  const slotsLeft = Math.max(maxMembers - members.length, 0);

  const { data: trainees = [], isLoading } = useQuery({
    queryKey: ['leagueAddableTrainees'],
    queryFn: () => base44.entities.Trainee.list(),
    enabled: !!group?.id,
  });

  const availableTrainees = useMemo(() => {
    const term = search.trim().toLowerCase();
    return trainees
      .filter(t => !members.includes(t.id))
      .filter(t => t.status !== 'deleted' && t.status !== 'inactive')
      .filter(t => !term || t.full_name?.toLowerCase().includes(term) || t.user_email?.toLowerCase().includes(term))
      .slice(0, 50);
  }, [trainees, members, search]);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= slotsLeft) return prev;
      return [...prev, id];
    });
  };

  const addMembersMutation = useMutation({
    mutationFn: async () => {
      const nextMembers = [...members, ...selectedIds].slice(0, maxMembers);
      return base44.entities.ShapeLeagueGroup.update(group.id, { members: nextMembers });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leagueGroup', group.id] });
      queryClient.invalidateQueries({ queryKey: ['groupMemberTrainees', group.id] });
      queryClient.invalidateQueries({ queryKey: ['myLeagueGroup'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-slate-800 border border-slate-600 rounded-t-3xl sm:rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-white font-bold text-lg">צרף משתמשים מהאפליקציה</h3>
              <p className="text-slate-400 text-xs">נותרו {slotsLeft} מקומות בקבוצה</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white min-h-0 min-w-0 w-8 h-8">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mb-3">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חפש לפי שם או אימייל..."
            className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl pr-10 pl-4 py-3 text-sm focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
          />
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 pr-1">
          {slotsLeft === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">הקבוצה מלאה</div>
          ) : isLoading ? (
            <div className="text-center text-slate-400 py-8 text-sm">טוען משתמשים...</div>
          ) : availableTrainees.length === 0 ? (
            <div className="text-center text-slate-400 py-8 text-sm">לא נמצאו משתמשים לצירוף</div>
          ) : (
            availableTrainees.map(t => {
              const selected = selectedIds.includes(t.id);
              return (
                <button
                  key={t.id}
                  onClick={() => toggleSelect(t.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl border text-right transition-all min-h-0 ${selected ? 'bg-teal-500/15 border-teal-400' : 'bg-slate-700/50 border-slate-600 hover:border-slate-400'}`}
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${selected ? 'bg-teal-400 text-slate-900' : 'bg-slate-600 text-white'}`}>
                    {selected ? <Check className="w-4 h-4" /> : (t.full_name?.[0] || '?')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{t.full_name || 'ללא שם'}</p>
                    <p className="text-slate-400 text-xs truncate">{t.user_email}</p>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <button
          onClick={() => addMembersMutation.mutate()}
          disabled={selectedIds.length === 0 || addMembersMutation.isPending}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-bold py-3.5 rounded-2xl transition-colors min-h-0"
        >
          <UserPlus className="w-5 h-5" />
          {addMembersMutation.isPending ? 'מצרף...' : `צרף ${selectedIds.length} לקבוצה`}
        </button>
      </div>
    </div>
  );
}