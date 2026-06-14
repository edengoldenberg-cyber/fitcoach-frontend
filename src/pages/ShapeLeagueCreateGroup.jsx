import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ArrowRight, Users, Check } from 'lucide-react';

const BADGE_OPTIONS = ['🐺', '🔥', '⚡', '👑', '🐉', '💀', '🛡️', '💪', '⭐', '🐯'];

function Spinner() {
  return (
    <div className="flex justify-center py-6">
      <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function ShapeLeagueCreateGroup() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [step, setStep] = useState(1); // 1=name, 2=badge, 3=done
  const [groupName, setGroupName] = useState('');
  const [badge, setBadge] = useState('🔥');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createdGroup, setCreatedGroup] = useState(null);

  const { data: user } = useQuery({ queryKey: ['currentUser'], queryFn: () => base44.auth.me() });

  const { data: trainee } = useQuery({
    queryKey: ['trainee', user?.email],
    queryFn: async () => {
      const trainees = await base44.entities.Trainee.filter({ user_email: user?.email });
      return trainees[0] || null;
    },
    enabled: !!user?.email,
  });

  // Check if user already has a group
  const { data: existingGroup, isLoading: checkingGroup } = useQuery({
    queryKey: ['myLeagueGroup', trainee?.id],
    queryFn: async () => {
      const allGroups = await base44.entities.ShapeLeagueGroup.list();
      return allGroups.find(g => Array.isArray(g.members) && g.members.includes(trainee.id)) || null;
    },
    enabled: !!trainee?.id,
  });

  const handleCreate = async () => {
    if (!groupName.trim()) { setError('נא להזין שם קבוצה'); return; }
    if (!trainee?.id) { setError('לא נמצא פרופיל מתאמן'); return; }
    setCreating(true);
    setError('');
    try {
      const group = await base44.entities.ShapeLeagueGroup.create({
        name: groupName.trim(),
        display_name: groupName.trim(),
        badge_icon: badge,
        captain_trainee_id: trainee.id,
        created_by_trainee_id: trainee.id,
        is_auto_group: false,
        members: [trainee.id],
        max_members: 5,
      });
      setCreatedGroup(group);
      queryClient.invalidateQueries({ queryKey: ['myLeagueGroup', trainee.id] });
      setStep(3);
    } catch (e) {
      setError('שגיאה ביצירת קבוצה: ' + e.message);
    } finally {
      setCreating(false);
    }
  };

  if (checkingGroup) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  // Already in a group
  if (existingGroup) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center gap-4 px-6" dir="rtl">
        <div className="text-5xl">{existingGroup.badge_icon || '🔥'}</div>
        <h2 className="text-white font-bold text-xl text-center">אתה כבר חבר בקבוצה!</h2>
        <p className="text-slate-400 text-sm text-center">{existingGroup.display_name || existingGroup.name}</p>
        <div className="flex gap-3 mt-2">
          <Link
            to={`/ShapeLeagueGroupProfile?groupId=${existingGroup.id}`}
            className="bg-teal-500 text-white px-5 py-2.5 rounded-xl font-semibold text-sm min-h-0 min-w-0"
          >
            צפה בקבוצה שלי
          </Link>
          <Link to="/ShapeLeagueHome" className="bg-slate-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm min-h-0 min-w-0">
            חזרה
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 pb-24" dir="rtl">

      {/* Header */}
      <div className="sticky top-0 z-10 bg-slate-900/90 backdrop-blur border-b border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link to="/ShapeLeagueHome" className="text-slate-400 hover:text-white min-h-0 min-w-0">
          <ArrowRight className="w-5 h-5" />
        </Link>
        <Users className="w-5 h-5 text-teal-400" />
        <span className="text-white font-bold text-lg flex-1">צור קבוצה חדשה</span>
      </div>

      <div className="px-4 pt-8 max-w-lg mx-auto">

        {/* Step indicators */}
        {step < 3 && (
          <div className="flex items-center gap-2 mb-8 justify-center">
            {[1, 2].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${step >= s ? 'bg-teal-500 text-white' : 'bg-slate-700 text-slate-500'}`}>
                  {step > s ? <Check className="w-4 h-4" /> : s}
                </div>
                {s < 2 && <div className={`w-12 h-0.5 ${step > s ? 'bg-teal-500' : 'bg-slate-700'}`} />}
              </div>
            ))}
          </div>
        )}

        {/* Step 1: Group Name */}
        {step === 1 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5">
            <div className="text-center">
              <div className="text-4xl mb-3">✏️</div>
              <h2 className="text-white font-bold text-xl">שם הקבוצה</h2>
              <p className="text-slate-400 text-sm mt-1">בחר שם מגניב לקבוצה שלך</p>
            </div>
            <input
              value={groupName}
              onChange={e => setGroupName(e.target.value)}
              placeholder="לדוגמה: Shape Warriors"
              maxLength={30}
              className="w-full bg-slate-700 border border-slate-600 text-white rounded-xl px-4 py-3 text-center text-lg font-bold focus:outline-none focus:border-teal-400 placeholder:text-slate-500"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && groupName.trim() && setStep(2)}
            />
            <div className="text-slate-500 text-xs text-center">{groupName.length}/30 תווים</div>
            {error && <div className="text-red-400 text-sm text-center">{error}</div>}
            <button
              onClick={() => { if (!groupName.trim()) { setError('נא להזין שם'); return; } setError(''); setStep(2); }}
              className="w-full bg-teal-500 hover:bg-teal-400 text-white font-bold py-3 rounded-xl transition-colors min-h-0"
            >
              הבא →
            </button>
          </div>
        )}

        {/* Step 2: Badge + Confirm */}
        {step === 2 && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-5">
            <div className="text-center">
              <div className="text-5xl mb-2">{badge}</div>
              <h2 className="text-white font-bold text-xl">בחר תג קבוצה</h2>
              <p className="text-slate-400 text-sm mt-1">הסמל שייצג את הקבוצה שלך</p>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {BADGE_OPTIONS.map(b => (
                <button
                  key={b}
                  onClick={() => setBadge(b)}
                  className={`text-3xl py-3 rounded-xl border-2 transition-all min-h-0 min-w-0 ${b === badge ? 'border-teal-400 bg-teal-400/10 scale-110' : 'border-slate-600 bg-slate-700 hover:border-slate-400'}`}
                >
                  {b}
                </button>
              ))}
            </div>

            {/* Summary */}
            <div className="bg-slate-700/50 rounded-xl p-4 text-center space-y-1">
              <div className="text-2xl">{badge}</div>
              <div className="text-white font-bold">{groupName}</div>
              <div className="text-slate-400 text-xs">קיבולת: עד 5 חברים · אתה הקפטן</div>
            </div>

            {error && <div className="text-red-400 text-sm text-center">{error}</div>}

            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 bg-slate-700 text-white font-semibold py-3 rounded-xl min-h-0 min-w-0">
                חזרה
              </button>
              <button
                onClick={handleCreate}
                disabled={creating}
                className="flex-2 flex-grow-[2] bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white font-bold py-3 rounded-xl transition-colors min-h-0 min-w-0"
              >
                {creating ? '⏳ יוצר...' : '✅ צור קבוצה!'}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 3 && createdGroup && (
          <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center space-y-5">
            <div className="text-6xl">{createdGroup.badge_icon}</div>
            <div>
              <h2 className="text-white font-black text-2xl">{createdGroup.display_name}</h2>
              <p className="text-teal-400 font-semibold mt-1">הקבוצה נוצרה בהצלחה! 🎉</p>
            </div>

            <div className="bg-teal-400/10 border border-teal-400/30 rounded-xl p-4 text-sm">
              <p className="text-teal-300 font-semibold mb-1">הזמן חברים</p>
              <p className="text-slate-400">שתף את הקוד:</p>
              <p className="text-teal-400 font-mono font-bold text-lg mt-1">{createdGroup.id?.slice(-6).toUpperCase()}</p>
              <p className="text-slate-500 text-xs mt-1">חברים יכולים להצטרף בעתיד דרך חיפוש קבוצה</p>
            </div>

            <div className="flex gap-3 justify-center">
              <Link
                to={`/ShapeLeagueGroupProfile?groupId=${createdGroup.id}`}
                className="bg-teal-500 text-white px-6 py-3 rounded-xl font-bold text-sm min-h-0 min-w-0"
              >
                פרופיל הקבוצה
              </Link>
              <Link to="/ShapeLeagueHome" className="bg-slate-700 text-white px-6 py-3 rounded-xl font-semibold text-sm min-h-0 min-w-0">
                לליגה
              </Link>
            </div>
          </div>
        )}

        {/* Info */}
        {step < 3 && (
          <div className="mt-4 bg-slate-800/50 border border-slate-700 rounded-xl p-4 space-y-2">
            <p className="text-slate-400 text-xs font-semibold">ℹ️ מידע על קבוצות</p>
            <ul className="text-slate-500 text-xs space-y-1">
              <li>• מקסימום 5 חברים לקבוצה</li>
              <li>• יוצר הקבוצה הוא אוטומטית הקפטן</li>
              <li>• הקפטן יכול לשנות שם ותג</li>
              <li>• ניקוד קבוצתי = ממוצע נקודות השבועיות</li>
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}