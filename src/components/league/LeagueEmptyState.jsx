import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';

function getInviteCode(groupId) {
  return (groupId || '').slice(-8).toUpperCase().replace(/[^A-Z0-9]/g, 'X').padEnd(6, '0').slice(0, 6);
}

export default function LeagueEmptyState({ trainee }) {
  const queryClient = useQueryClient();
  const urlParams = new URLSearchParams(window.location.search);
  const initialCode = urlParams.get('code') || '';
  const inviteGroupId = urlParams.get('joinGroup') || '';
  const [joining, setJoining] = useState(false);
  const [joinCode, setJoinCode] = useState(initialCode.toUpperCase());
  const [showCodeInput, setShowCodeInput] = useState(!!initialCode || !!inviteGroupId);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    if (initialCode || inviteGroupId) {
      setShowCodeInput(true);
    }
  }, [initialCode, inviteGroupId]);

  const handleAutoAssign = async () => {
    if (!trainee?.id) return;
    setJoining(true);
    try {
      await base44.functions.invoke('assignUserToLeagueGroup', { trainee_id: trainee.id });
    } catch (_) {}
    queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee.id] });
    setJoining(false);
  };

  const handleJoinCode = async () => {
    if (!joinCode.trim()) return;
    setJoining(true);
    setJoinError('');
    try {
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      const cleanCode = joinCode.trim().toUpperCase();
      const match = allGroups.find(g =>
        g.id === inviteGroupId ||
        getInviteCode(g.id) === cleanCode ||
        g.id?.slice(-6).toUpperCase() === cleanCode
      );
      if (!match) { setJoinError('קוד לא נמצא'); setJoining(false); return; }
      if ((match.members?.length || 0) >= (match.max_members || 5)) {
        setJoinError('הקבוצה מלאה'); setJoining(false); return;
      }
      if ((match.members || []).includes(trainee.id)) {
        queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee.id] });
        setJoining(false);
        return;
      }
      await base44.entities.ShapeLeagueGroup.update(match.id, {
        members: [...(match.members || []), trainee.id],
      });
      queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee.id] });
    } catch (e) {
      setJoinError('שגיאה: ' + e.message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="text-center space-y-1 pb-2">
        <div className="text-4xl">🏆</div>
        <p className="text-white font-black text-lg">הצטרף לליגה!</p>
        <p className="text-slate-400 text-sm">בחר איך להצטרף לתחרות</p>
      </div>

      <Link to="/ShapeLeagueCreateGroup" className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-900 font-black text-base py-4 rounded-2xl shadow-lg min-h-0 transition-transform active:scale-95">
        🛡️ צור קבוצה — תהיה הקפטן
      </Link>

      <button
        onClick={handleAutoAssign}
        disabled={joining}
        className="w-full flex items-center justify-center gap-3 bg-teal-500/20 hover:bg-teal-500/30 border border-teal-500/50 text-teal-300 font-bold text-base py-4 rounded-2xl transition-all min-h-0 disabled:opacity-50"
      >
        {joining ? <><div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" /> מחפש קבוצה...</> : '⚡ שיבוץ אוטומטי'}
      </button>

      <button
        onClick={() => setShowCodeInput(!showCodeInput)}
        className="w-full flex items-center justify-center gap-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/40 text-purple-300 font-semibold text-base py-3.5 rounded-2xl transition-all min-h-0"
      >
        🎟️ הכנס קוד הצטרפות
      </button>

      {showCodeInput && (
        <div className="space-y-2">
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="קוד הזמנה (6 תווים)"
            maxLength={6}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 text-center text-xl font-mono font-bold tracking-widest focus:outline-none focus:border-purple-400 uppercase"
          />
          {joinError && <p className="text-red-400 text-xs text-center">{joinError}</p>}
          <button
            onClick={handleJoinCode}
            disabled={joining || !joinCode.trim()}
            className="w-full bg-purple-500 hover:bg-purple-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl min-h-0"
          >
            {joining ? '⏳ מצטרף...' : 'הצטרף ⚔️'}
          </button>
        </div>
      )}
    </div>
  );
}