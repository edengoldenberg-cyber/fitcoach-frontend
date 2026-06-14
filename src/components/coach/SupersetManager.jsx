import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link2, Unlink, Plus, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

const GROUP_TYPES = [
  { value: 'superset', label: '🔗 סופר סט', color: 'border-blue-400 bg-blue-50', badge: 'bg-blue-500' },
  { value: 'triset',   label: '🔁 טרי סט',  color: 'border-purple-400 bg-purple-50', badge: 'bg-purple-500' },
  { value: 'circuit',  label: '⚡ סבב',     color: 'border-orange-400 bg-orange-50', badge: 'bg-orange-500' },
];

const GROUP_LABELS = { superset: 'סופר סט', triset: 'טרי סט', circuit: 'סבב' };
const GROUP_COLORS = {
  superset: { border: 'border-blue-400', bg: 'bg-blue-50', badge: 'bg-blue-500', text: 'text-blue-700', light: 'bg-blue-100' },
  triset:   { border: 'border-purple-400', bg: 'bg-purple-50', badge: 'bg-purple-500', text: 'text-purple-700', light: 'bg-purple-100' },
  circuit:  { border: 'border-orange-400', bg: 'bg-orange-50', badge: 'bg-orange-500', text: 'text-orange-700', light: 'bg-orange-100' },
};

const ORDER_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Generate a short unique group id
function makeGroupId() {
  return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

// Get all groups from exercises list
export function getGroups(exercises) {
  const groups = {};
  exercises.forEach((ex, idx) => {
    if (!ex.group_id) return;
    if (!groups[ex.group_id]) {
      groups[ex.group_id] = {
        group_id: ex.group_id,
        group_type: ex.group_type || 'superset',
        round_count: ex.round_count || 3,
        rest_after_round_seconds: ex.rest_after_round_seconds || 60,
        indices: [],
      };
    }
    groups[ex.group_id].indices.push(idx);
  });
  return groups;
}

// Get next available group letter
export function nextGroupLetter(exercises) {
  const usedLetters = new Set();
  exercises.forEach(ex => {
    if (ex.group_label) usedLetters.add(ex.group_label);
  });
  return ORDER_LETTERS.find(l => !usedLetters.has(l)) || 'A';
}

// ─── Coach: inline superset controls for each exercise row ───
export function ExerciseSupersetBadge({ exercise, idx, exercises, onUpdate }) {
  const [showMenu, setShowMenu] = useState(false);
  const [showDialog, setShowDialog] = useState(false);
  const [pickingSecond, setPickingSecond] = useState(false);

  const isGrouped = !!exercise.group_id;
  const group = isGrouped ? getGroups(exercises)[exercise.group_id] : null;
  const colors = isGrouped ? GROUP_COLORS[exercise.group_type] || GROUP_COLORS.superset : null;

  const handleCreateSuperset = (targetIdx) => {
    const groupId = makeGroupId();
    const letter = nextGroupLetter(exercises);
    const groupType = 'superset';
    onUpdate(exercises.map((ex, i) => {
      if (i === idx || i === targetIdx) {
        return {
          ...ex,
          group_id: groupId,
          group_type: groupType,
          group_label: letter,
          group_order: i === idx ? 1 : 2,
          round_count: 3,
          rest_after_round_seconds: 60,
        };
      }
      return ex;
    }));
    setShowMenu(false);
    toast.success(`✅ סופר סט ${letter} נוצר`);
  };

  const handleUngroup = () => {
    onUpdate(exercises.map((ex, i) => {
      if (ex.group_id === exercise.group_id) {
        const { group_id, group_type, group_label, group_order, round_count, rest_after_round_seconds, ...rest } = ex;
        return rest;
      }
      return ex;
    }));
    setShowMenu(false);
    toast.success('פורק הסופר סט');
  };

  const handleChangeType = (newType) => {
    onUpdate(exercises.map(ex => {
      if (ex.group_id === exercise.group_id) {
        return { ...ex, group_type: newType };
      }
      return ex;
    }));
  };

  const handleAddToGroup = (targetIdx) => {
    const maxOrder = Math.max(...(group?.indices || [0]).map(i => exercises[i].group_order || 1));
    onUpdate(exercises.map((ex, i) => {
      if (i === targetIdx) {
        return {
          ...ex,
          group_id: exercise.group_id,
          group_type: exercise.group_type,
          group_label: exercise.group_label,
          group_order: maxOrder + 1,
          round_count: exercise.round_count,
          rest_after_round_seconds: exercise.rest_after_round_seconds,
        };
      }
      return ex;
    }));
    setPickingSecond(false);
    setShowMenu(false);
    toast.success('תרגיל נוסף לקבוצה');
  };

  const otherIndices = exercises.map((_, i) => i).filter(i => i !== idx && !exercises[i].group_id);
  const canAdd = isGrouped && group && group.indices.length < 4;

  if (!isGrouped) {
    return (
      <div className="relative">
        <button
          onClick={() => setShowMenu(!showMenu)}
          className="text-xs text-slate-400 hover:text-blue-500 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
        >
          <Link2 className="w-3 h-3" />
          קשר
        </button>
        {showMenu && (
          <div className="absolute left-0 top-7 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[200px]" dir="rtl">
            <p className="text-xs font-bold text-slate-500 mb-2">צור סופר סט עם:</p>
            {otherIndices.length === 0 && (
              <p className="text-xs text-slate-400">אין תרגילים פנויים</p>
            )}
            {otherIndices.slice(0, 6).map(i => (
              <button
                key={i}
                onClick={() => handleCreateSuperset(i)}
                className="w-full text-right text-sm px-2 py-1.5 rounded hover:bg-blue-50 text-slate-700"
              >
                {i + 1}. {exercises[i].exercise_name}
              </button>
            ))}
            <button onClick={() => setShowMenu(false)} className="mt-2 text-xs text-slate-400 w-full text-center">סגור</button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className={`text-xs font-bold flex items-center gap-1 px-2 py-1 rounded-lg transition-colors ${colors.text} ${colors.light}`}
      >
        <Link2 className="w-3 h-3" />
        {GROUP_LABELS[exercise.group_type]} {exercise.group_label}
        {showMenu ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      {showMenu && (
        <div className="absolute left-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl p-3 min-w-[210px]" dir="rtl">
          {/* Change type */}
          <p className="text-xs font-bold text-slate-500 mb-1">סוג קבוצה</p>
          <div className="flex gap-1 mb-3">
            {GROUP_TYPES.map(gt => (
              <button
                key={gt.value}
                onClick={() => handleChangeType(gt.value)}
                className={`flex-1 text-[10px] py-1 rounded-lg border transition-colors ${
                  exercise.group_type === gt.value ? gt.color + ' border-2 font-bold' : 'border-slate-200 hover:bg-slate-50'
                }`}
              >
                {gt.label.split(' ')[0]}
                <br />
                {gt.label.split(' ')[1]}
              </button>
            ))}
          </div>

          {/* Add exercise to group */}
          {canAdd && otherIndices.length > 0 && (
            <>
              <p className="text-xs font-bold text-slate-500 mb-1">הוסף תרגיל לקבוצה</p>
              {otherIndices.slice(0, 4).map(i => (
                <button
                  key={i}
                  onClick={() => handleAddToGroup(i)}
                  className="w-full text-right text-xs px-2 py-1.5 rounded hover:bg-blue-50 text-slate-700"
                >
                  <Plus className="w-3 h-3 inline ml-1" />
                  {exercises[i].exercise_name}
                </button>
              ))}
            </>
          )}

          {/* Ungroup */}
          <button
            onClick={handleUngroup}
            className="w-full mt-2 text-xs text-red-500 flex items-center gap-1 px-2 py-1.5 rounded hover:bg-red-50"
          >
            <Unlink className="w-3 h-3" />
            פרק קבוצה
          </button>
          <button onClick={() => setShowMenu(false)} className="mt-1 text-xs text-slate-400 w-full text-center">סגור</button>
        </div>
      )}
    </div>
  );
}

// ─── Trainee: grouped block header ───
export function SupersetGroupHeader({ groupType, groupLabel, roundCount, restSeconds }) {
  const colors = GROUP_COLORS[groupType] || GROUP_COLORS.superset;
  return (
    <div className={`flex items-center justify-between px-4 py-2 rounded-t-xl ${colors.bg} border-b ${colors.border}`}>
      <div className="flex items-center gap-2">
        <span className={`text-xs font-bold text-white px-2 py-0.5 rounded-full ${colors.badge}`}>
          {GROUP_LABELS[groupType]} {groupLabel}
        </span>
        <span className="text-xs text-slate-600 font-medium">{roundCount} סבבים</span>
      </div>
      {restSeconds > 0 && (
        <span className="text-xs text-slate-500">מנוחה: {restSeconds}″ בין סבבים</span>
      )}
    </div>
  );
}

export { GROUP_COLORS, GROUP_LABELS, ORDER_LETTERS };