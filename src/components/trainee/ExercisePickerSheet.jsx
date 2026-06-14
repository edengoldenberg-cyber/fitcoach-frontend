import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Search, Star, Clock, X, Zap, Dumbbell } from 'lucide-react';

const TEMPLATES = [
  { key: 'push', label: '💪 דחיפה', exercises: ['לחיצת חזה', 'לחיצת כתפיים', 'טריצפס גלגלת', 'לחיצת ספסל משופע'] },
  { key: 'pull', label: '🦾 משיכה', exercises: ['מתח', 'חתירה במוט', 'כפיפת מרפק', 'פולאובר'] },
  { key: 'legs', label: '🦵 רגליים', exercises: ['סקוואט', 'לגפרס', 'ددة', 'כפיפת ברך שוכב'] },
  { key: 'full_body', label: '⚡ כל הגוף', exercises: ['דדליפט', 'סקוואט', 'לחיצת חזה', 'מתח', 'לחיצת כתפיים'] },
  { key: 'pilates', label: '🧘 פילאטיס', exercises: ['מאה', 'גלגול', 'גשר', 'שחייה', 'כיסא'] },
  { key: 'hiit', label: '🔥 HIIT', exercises: ['ברפי', 'קפיצת ג\'קי', 'הר ההרים', 'סקוואט קפיצה'] },
];

const CATEGORIES = ['חזה', 'גב', 'כתפיים', 'ידיים', 'רגליים', 'בטן', 'קרדיו', 'פילאטיס'];

export default function ExercisePickerSheet({ open, onClose, onAddExercise, recentExercises = [], favoriteExercises = [] }) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('database');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  const { data: exerciseDatabase = [] } = useQuery({
    queryKey: ['exerciseDatabasePicker'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' }, 'name_he', 500),
    enabled: open,
  });

  const filteredRecent = useMemo(() => {
    if (!search.trim()) return recentExercises.slice(0, 8);
    return recentExercises.filter(e =>
      (e.name || e.exercise_name || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [search, recentExercises]);

  const filteredFavorites = useMemo(() => {
    if (!search.trim()) return favoriteExercises.slice(0, 8);
    return favoriteExercises.filter(e =>
      (e.name || e.exercise_name || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [search, favoriteExercises]);

  const filteredDatabase = useMemo(() => {
    const term = search.trim().toLowerCase();
    const source = exerciseDatabase.map(ex => ({
      id: ex.id,
      exercise_id: ex.id,
      name: ex.name_he,
      exercise_name: ex.name_he,
      subtitle: [ex.muscle_group_primary, Array.isArray(ex.equipment) ? ex.equipment.join(', ') : ''].filter(Boolean).join(' · ')
    })).filter(ex => ex.name);

    if (!term) return source.slice(0, 30);
    return source.filter(ex => ex.name.toLowerCase().includes(term)).slice(0, 30);
  }, [search, exerciseDatabase]);

  if (!open) return null;

  const handleAdd = (exercise) => {
    const item = typeof exercise === 'string' ? { name: exercise, exercise_name: exercise } : exercise;
    onAddExercise({
      exercise_id: item.exercise_id || item.id || null,
      exercise_name: item.exercise_name || item.name,
      name: item.name || item.exercise_name,
      sets: 3
    });
    onClose();
  };

  const handleAddTemplate = (template) => {
    template.exercises.forEach(name => {
      onAddExercise({ exercise_name: name, name, sets: 3 });
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Sheet */}
      <div className="relative bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl">
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-lg font-bold text-slate-800">הוסף תרגיל</h3>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100">
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* Search */}
        <div className="px-5 py-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="חפש תרגיל..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full h-11 pr-10 pl-4 border-2 border-slate-200 rounded-xl text-sm bg-white focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100"
            />
          </div>
        </div>

        {/* Tabs */}
        {!search && (
          <div className="flex gap-1 px-5 pb-2 overflow-x-auto">
            {[
              { key: 'database', label: '🏋️ מאגר', icon: Dumbbell },
              { key: 'recent', label: '🕐 אחרונים', icon: Clock },
              { key: 'favorites', label: '⭐ מועדפים', icon: Star },
              { key: 'templates', label: '📋 תבניות', icon: Zap },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                  activeTab === tab.key
                    ? 'bg-orange-500 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 pb-8">
          {search ? (
            /* Search results */
            <div className="space-y-2 pt-2">
              {filteredDatabase.map(ex => (
                <ExerciseItem key={ex.id || ex.name} exercise={ex} name={ex.name} subtitle={ex.subtitle} onAdd={handleAdd} />
              ))}
              {/* Always allow adding custom */}
              {search.length > 1 && (
                <button
                  onClick={() => handleAdd(search)}
                  className="w-full py-3 border-2 border-dashed border-orange-300 rounded-xl text-orange-600 text-sm font-medium flex items-center justify-center gap-2"
                >
                  <span>➕</span> הוסף "{search}"
                </button>
              )}
            </div>
          ) : activeTab === 'database' ? (
            <div className="space-y-2 pt-2">
              {filteredDatabase.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">לא נמצאו תרגילים במאגר</p>
              ) : filteredDatabase.map((ex) => (
                <ExerciseItem
                  key={ex.id || ex.name}
                  exercise={ex}
                  name={ex.name}
                  subtitle={ex.subtitle}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          ) : activeTab === 'recent' ? (
            <div className="space-y-2 pt-2">
              {filteredRecent.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">אין תרגילים אחרונים</p>
              ) : filteredRecent.map((ex, i) => (
                <ExerciseItem
                  key={i}
                  exercise={ex}
                  name={ex.name || ex.exercise_name}
                  subtitle={ex.lastUsed}
                  onAdd={handleAdd}
                />
              ))}
            </div>
          ) : activeTab === 'favorites' ? (
            <div className="space-y-2 pt-2">
              {filteredFavorites.length === 0 ? (
                <p className="text-center text-slate-400 py-8 text-sm">אין מועדפים</p>
              ) : filteredFavorites.map((ex, i) => (
                <ExerciseItem
                  key={i}
                  exercise={ex}
                  name={ex.name || ex.exercise_name}
                  onAdd={handleAdd}
                  isFavorite
                />
              ))}
            </div>
          ) : (
            /* Templates */
            <div className="grid grid-cols-2 gap-3 pt-2">
              {TEMPLATES.map(t => (
                <button
                  key={t.key}
                  onClick={() => handleAddTemplate(t)}
                  className="p-4 bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-2xl text-right hover:border-orange-300 hover:bg-orange-50 transition-all"
                >
                  <div className="text-2xl mb-1">{t.label.split(' ')[0]}</div>
                  <div className="font-bold text-slate-800 text-sm">{t.label.split(' ').slice(1).join(' ')}</div>
                  <div className="text-xs text-slate-500 mt-1">{t.exercises.length} תרגילים</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ExerciseItem({ exercise, name, subtitle, onAdd, isFavorite }) {
  return (
    <button
      onClick={() => onAdd(exercise || name)}
      className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-orange-50 border border-slate-100 hover:border-orange-200 rounded-xl transition-all text-right"
    >
      <div>
        <div className="flex items-center gap-2">
          {isFavorite && <Star className="w-3 h-3 text-amber-400 fill-amber-400" />}
          <span className="font-medium text-slate-800 text-sm">{name}</span>
        </div>
        {subtitle && <span className="text-xs text-slate-400 mt-0.5 block">{subtitle}</span>}
      </div>
      <span className="text-orange-500 text-xl font-light flex-shrink-0">+</span>
    </button>
  );
}