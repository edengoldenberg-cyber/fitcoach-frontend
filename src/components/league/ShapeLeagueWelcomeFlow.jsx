import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trophy } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const SCREENS = [
  {
    id: 'welcome',
    features: [
      { icon: '👥', text: 'קבוצות של עד 5 חברים' },
      { icon: '⚔️', text: 'כל פעולה נותנת ניקוד' },
      { icon: '🏆', text: 'פרסים חודשיים למובילים' },
      { icon: '🚀', text: 'עולים ליגות לפי פעילות' },
    ],
  },
];

export default function ShapeLeagueWelcomeFlow({ trainee, onComplete, onAutoAssign }) {
  const navigate = useNavigate();
  const [screen, setScreen] = useState(0); // 0=welcome, 1=howtoplay, 2=confirm, 'code'=join by code
  const [selectedAction, setSelectedAction] = useState(null);
  const [joinCode, setJoinCode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [confirmData, setConfirmData] = useState(null);

  const handleOptionSelect = async (action) => {
    setSelectedAction(action);
    if (action === 'create') {
      setConfirmData({ icon: '👑', text: 'אתה תהיה הקפטן של הקבוצה שלך', sub: 'בשלב הבא תבחר שם ותג' });
      setScreen(2);
    } else if (action === 'auto') {
      setJoining(true);
      try {
        await base44.functions.invoke('assignUserToLeagueGroup', { trainee_id: trainee?.id });
        if (onAutoAssign) onAutoAssign();
      } catch (_) {}
      setConfirmData({ icon: '🔥', text: 'שובצת לקבוצה!', sub: 'הקבוצה מחכה לך' });
      setScreen(2);
      setJoining(false);
    } else if (action === 'code') {
      setScreen('code');
    }
  };

  const handleJoinByCode = async () => {
    if (!joinCode.trim()) { setJoinError('הכנס קוד'); return; }
    setJoining(true);
    setJoinError('');
    try {
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      const match = allGroups.find(g => g.id?.slice(-6).toUpperCase() === joinCode.trim().toUpperCase());
      if (!match) { setJoinError('קוד לא נמצא. נסה שוב.'); setJoining(false); return; }
      if ((match.members?.length || 0) >= (match.max_members || 5)) {
        setJoinError('הקבוצה מלאה. בחר קוד אחר.'); setJoining(false); return;
      }
      await base44.entities.ShapeLeagueGroup.update(match.id, {
        members: [...(match.members || []), trainee?.id],
      });
      setConfirmData({ icon: '⚔️', text: `הצטרפת ל-${match.display_name || match.name}!`, sub: 'הקבוצה מחכה לך' });
      setScreen(2);
    } catch (e) {
      setJoinError('שגיאה: ' + e.message);
    } finally {
      setJoining(false);
    }
  };

  const handleFinish = () => {
    localStorage.setItem('league_onboarding_done', '1');
    if (selectedAction === 'create') {
      navigate('/ShapeLeagueCreateGroup');
    } else {
      if (onComplete) onComplete();
    }
  };

  // CODE JOIN screen
  if (screen === 'code') {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/95 flex items-center justify-center p-6" dir="rtl">
        <div className="w-full max-w-sm bg-slate-800 border border-slate-700 rounded-3xl p-8 text-center space-y-5">
          <div className="text-5xl">🎟️</div>
          <h2 className="text-white font-black text-2xl">הצטרף עם קוד</h2>
          <p className="text-slate-400 text-sm">הזן את קוד ההזמנה שקיבלת</p>
          <input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="לדוגמה: A3F9K2"
            maxLength={6}
            className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 text-center text-2xl font-mono font-bold tracking-widest focus:outline-none focus:border-teal-400 uppercase"
          />
          {joinError && <p className="text-red-400 text-sm">{joinError}</p>}
          <button onClick={handleJoinByCode} disabled={joining} className="w-full bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors min-h-0">
            {joining ? '⏳ מצטרף...' : 'הצטרף לקבוצה ⚔️'}
          </button>
          <button onClick={() => setScreen(1)} className="text-slate-500 text-sm hover:text-slate-300 min-h-0 min-w-0">חזרה</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex items-end justify-center" dir="rtl">
      <div className="w-full max-w-lg bg-gradient-to-b from-slate-800 to-slate-900 border-t border-slate-700 rounded-t-3xl p-8 pb-12 text-center">

        {/* Screen 0 — Welcome */}
        {screen === 0 && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-2">
              <Trophy className="w-10 h-10 text-yellow-400" />
              <h1 className="text-4xl font-black text-white">Shape League</h1>
              <Trophy className="w-10 h-10 text-yellow-400" />
            </div>
            <div className="inline-block bg-yellow-400/20 text-yellow-300 text-sm font-bold px-4 py-1 rounded-full border border-yellow-400/40">עונה 1</div>
            <p className="text-slate-300 text-base">מערכת הליגה של Shape — תתחרה, תנצח, תשגשג</p>
            <div className="grid grid-cols-2 gap-3 text-right">
              {SCREENS[0].features.map((f, i) => (
                <div key={i} className="bg-slate-700/60 rounded-2xl p-4 flex items-center gap-3">
                  <span className="text-2xl">{f.icon}</span>
                  <span className="text-white text-sm font-medium">{f.text}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setScreen(1)} className="w-full bg-gradient-to-r from-yellow-500 to-orange-500 text-slate-900 font-black text-lg py-4 rounded-2xl shadow-xl transition-transform active:scale-95 min-h-0">
              התחל לשחק →
            </button>
          </div>
        )}

        {/* Screen 1 — How to Play */}
        {screen === 1 && (
          <div className="space-y-6">
            <h2 className="text-3xl font-black text-white">איך רוצה לשחק?</h2>
            <p className="text-slate-400">בחר את הדרך שלך</p>
            <div className="space-y-3">
              {[
                { icon: '🛡️', label: 'צור קבוצה', sub: 'תהיה הקפטן', action: 'create' },
                { icon: '⚡', label: 'שיבוץ אוטומטי', sub: 'נשבץ אותך לקבוצה קיימת', action: 'auto' },
                { icon: '🎟️', label: 'הצטרף עם קוד', sub: 'יש לך קוד הזמנה?', action: 'code' },
              ].map(opt => (
                <button
                  key={opt.action}
                  onClick={() => !joining && handleOptionSelect(opt.action)}
                  disabled={joining}
                  className="w-full bg-slate-700/80 hover:bg-slate-700 border border-slate-600 hover:border-teal-500/60 text-right flex items-center gap-4 px-5 py-4 rounded-2xl transition-all active:scale-95 min-h-0 min-w-0 disabled:opacity-50"
                >
                  <span className="text-4xl">{opt.icon}</span>
                  <div className="flex-1">
                    <div className="text-white font-bold text-base">{opt.label}</div>
                    <div className="text-slate-400 text-sm">{opt.sub}</div>
                  </div>
                  {joining && opt.action === 'auto' && (
                    <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setScreen(0)} className="text-slate-500 text-sm hover:text-slate-300 min-h-0 min-w-0">חזרה</button>
          </div>
        )}

        {/* Screen 2 — Confirm */}
        {screen === 2 && confirmData && (
          <div className="space-y-6">
            <div className="text-6xl animate-bounce">{confirmData.icon}</div>
            <h2 className="text-3xl font-black text-white">{confirmData.text}</h2>
            <p className="text-slate-400">{confirmData.sub}</p>
            <div className="w-16 h-1 bg-teal-400 rounded-full mx-auto" />
            <button onClick={handleFinish} className="w-full bg-gradient-to-r from-teal-500 to-teal-400 text-white font-black text-lg py-4 rounded-2xl shadow-xl transition-transform active:scale-95 min-h-0">
              כניסה לליגה 🔥
            </button>
          </div>
        )}

        {/* Dots */}
        {typeof screen === 'number' && (
          <div className="flex justify-center gap-2 mt-6">
            {[0, 1, 2].map(i => (
              <div key={i} className={`h-2 rounded-full transition-all ${screen === i ? 'bg-teal-400 w-6' : 'bg-slate-600 w-2'}`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}