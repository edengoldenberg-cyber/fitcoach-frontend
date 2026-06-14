import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Settings, Plus, X, Save } from 'lucide-react';

const DEFAULT_ACTIVITIES = [
  { emoji: '🏋️', name_he: 'כוח', base_points: 30 },
  { emoji: '🧘', name_he: 'פילאטיס', base_points: 25 },
  { emoji: '🏃', name_he: 'ריצה', base_points: 25 },
  { emoji: '🚶', name_he: 'הליכה', base_points: 15 },
  { emoji: '🎾', name_he: 'טניס', base_points: 20 },
  { emoji: '🚴', name_he: 'אופניים', base_points: 25 },
  { emoji: '🏊', name_he: 'שחייה', base_points: 25 },
  { emoji: '🥊', name_he: 'פונקציונלי', base_points: 30 },
  { emoji: '🕺', name_he: 'ריקוד', base_points: 20 },
  { emoji: '⚽', name_he: 'ספורט קבוצתי', base_points: 25 },
  { emoji: '🥾', name_he: 'טיול', base_points: 20 },
  { emoji: '🧎', name_he: 'מתיחות/mobility', base_points: 10 },
];

export default function ShapeLeagueCoachPanel() {
  const queryClient = useQueryClient();
  const [showPanel, setShowPanel] = useState(false);
  const [activeTab, setActiveTab] = useState('activities');
  const [missionTitle, setMissionTitle] = useState('');
  const [missionDescription, setMissionDescription] = useState('');
  const [missionEmoji, setMissionEmoji] = useState('🔥');
  const [missionTarget, setMissionTarget] = useState(30);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const createMissionMutation = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      await base44.entities.ShapeLeagueMission.create({
        date: today,
        mission_type: 'activity',
        title_he: missionTitle,
        description_he: missionDescription,
        emoji: missionEmoji,
        target_value: missionTarget,
        unit: 'minutes',
        bonus_points: 15,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dailyMission'] });
      setMissionTitle('');
      setMissionDescription('');
      setMissionTarget(30);
    },
  });

  // Only show for admin users
  if (user?.role !== 'admin') {
    return null;
  }

  if (!showPanel) {
    return (
      <button
        onClick={() => setShowPanel(true)}
        className="fixed bottom-24 right-4 w-12 h-12 rounded-full bg-purple-600 hover:bg-purple-700 text-white flex items-center justify-center shadow-lg z-40 transition-all"
        title="Shape League Coach Panel"
      >
        <Settings className="w-6 h-6" />
      </button>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end" dir="rtl">
      <div className="w-full max-h-[90vh] bg-slate-900 border-t border-slate-700 rounded-t-2xl overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-slate-900 border-b border-slate-700 p-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Shape League Coach
          </h2>
          <button
            onClick={() => setShowPanel(false)}
            className="text-slate-400 hover:text-slate-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-700 px-4">
          <button
            onClick={() => setActiveTab('activities')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'activities'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            פעילויות
          </button>
          <button
            onClick={() => setActiveTab('missions')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'missions'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            משימות
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'events'
                ? 'border-teal-500 text-teal-400'
                : 'border-transparent text-slate-400 hover:text-slate-300'
            }`}
          >
            אירועים
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {activeTab === 'activities' && (
            <div>
              <h3 className="text-white font-bold mb-3">פעילויות זמינות</h3>
              <div className="grid grid-cols-2 gap-2">
                {DEFAULT_ACTIVITIES.map(act => (
                  <div
                    key={act.name_he}
                    className="bg-slate-800 border border-slate-700 rounded-lg p-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-2xl">{act.emoji}</span>
                      <span className="text-yellow-400 text-sm font-bold">+{act.base_points}</span>
                    </div>
                    <p className="text-white text-sm mt-2">{act.name_he}</p>
                  </div>
                ))}
              </div>
              <div className="mt-4 bg-blue-900/20 border border-blue-500/40 rounded-lg p-3">
                <p className="text-blue-300 text-sm">
                  💡 ניתן להוסיף פעילויות חדשות דרך הממשק או בקשה למפתח.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'missions' && (
            <div>
              <h3 className="text-white font-bold mb-3">יצירת משימה</h3>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="שם המשימה"
                  value={missionTitle}
                  onChange={(e) => setMissionTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
                <textarea
                  placeholder="תיאור המשימה"
                  value={missionDescription}
                  onChange={(e) => setMissionDescription(e.target.value)}
                  rows={3}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="אימוג׳י"
                    value={missionEmoji}
                    onChange={(e) => setMissionEmoji(e.target.value)}
                    maxLength={2}
                    className="w-16 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-center"
                  />
                  <input
                    type="number"
                    placeholder="יעד"
                    value={missionTarget}
                    onChange={(e) => setMissionTarget(Number(e.target.value))}
                    min={5}
                    max={180}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white"
                  />
                </div>
                <button
                  onClick={() => createMissionMutation.mutate()}
                  disabled={!missionTitle || createMissionMutation.isPending}
                  className="w-full bg-teal-500 hover:bg-teal-600 disabled:opacity-50 text-white font-semibold py-2 rounded-lg flex items-center justify-center gap-2 transition-all"
                >
                  <Save className="w-4 h-4" />
                  {createMissionMutation.isPending ? 'שמירה...' : 'צור משימה'}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'events' && (
            <div>
              <h3 className="text-white font-bold mb-3">אירועים שבועיים</h3>
              <div className="bg-slate-800 border border-slate-700 rounded-lg p-4 text-center">
                <p className="text-slate-400 text-sm">
                  ניהול אירועים שבועיים זמין דרך Dashboard ראשי או בקשה לתמיכה.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}