import React, { useState, useEffect, useRef } from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Plus, Dumbbell } from 'lucide-react';

const normalizeName = (name) => {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
};

// Check if an exercise matches the search query across all name fields + aliases
function matchesQuery(ex, query) {
  const q = normalizeName(query);
  if (!q) return false;
  if (normalizeName(ex.name_he).includes(q)) return true;
  if (normalizeName(ex.name).includes(q)) return true;
  // Search aliases (already parsed as array by JSON_FIELDS parser on server)
  const aliases = Array.isArray(ex.aliases) ? ex.aliases : [];
  if (aliases.some(a => normalizeName(a).includes(q))) return true;
  return false;
}

export default function ExerciseAutocomplete({ 
  value, 
  onChange, 
  onSelect, 
  onCreateNew,
  placeholder = "הקלד שם תרגיל...",
  showCreateButton = false
}) {
  const [inputValue, setInputValue] = useState(value || '');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const suggestionsRef = useRef(null);

  const { data: allExercises = [] } = useQuery({
    queryKey: ['allExercises'],
    queryFn: () => base44.entities.Exercise.filter({ status: 'active' })
  });

  useEffect(() => {
    setInputValue(value || '');
  }, [value]);

  const suggestions = inputValue.trim().length >= 2
    ? allExercises
        .filter(ex => ex.canonical_id == null) // only show canonical exercises
        .filter(ex => matchesQuery(ex, inputValue))
        .slice(0, 8)
    : [];

  const handleInputChange = (e) => {
    const val = e.target.value;
    setInputValue(val);
    setShowSuggestions(true);
    setSelectedIndex(-1);
    onChange?.(val);
  };

  const handleSelectSuggestion = (exercise) => {
    console.log('[SELECT_EXISTING_EXERCISE]', { 
      exerciseId: exercise.id, 
      name: exercise.name_he 
    });
    setInputValue(exercise.name_he);
    setShowSuggestions(false);
    onSelect?.(exercise);
  };

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => 
        prev < suggestions.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => prev > 0 ? prev - 1 : -1);
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
      e.preventDefault();
      handleSelectSuggestion(suggestions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const handleBlur = () => {
    setTimeout(() => setShowSuggestions(false), 200);
  };

  const handleCreateNew = () => {
    console.log('[CREATE_NEW_EXERCISE]', { name: inputValue });
    onCreateNew?.(inputValue);
    setShowSuggestions(false);
  };

  const exactMatch = allExercises.find(ex => 
    normalizeName(ex.name_he) === normalizeName(inputValue)
  );

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => setShowSuggestions(true)}
        onBlur={handleBlur}
        placeholder={placeholder}
      />

      {showSuggestions && (suggestions.length > 0 || (showCreateButton && inputValue.trim().length >= 2)) && (
        <div 
          ref={suggestionsRef}
          className="absolute z-50 w-full mt-1 bg-white border rounded-lg shadow-lg max-h-64 overflow-y-auto"
        >
          {suggestions.length > 0 && (
            <div className="py-1">
              {suggestions.map((exercise, idx) => (
                <button
                  key={exercise.id}
                  onClick={() => handleSelectSuggestion(exercise)}
                  className={`w-full px-4 py-2 text-right hover:bg-slate-100 flex items-center gap-2 ${
                    idx === selectedIndex ? 'bg-slate-100' : ''
                  }`}
                >
                  <Dumbbell className="w-4 h-4 text-slate-400" />
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">{exercise.name_he}</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {(exercise.muscle_group || exercise.muscle_group_primary) && (
                        <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {exercise.muscle_group || exercise.muscle_group_primary}
                        </span>
                      )}
                      {(typeof exercise.equipment === 'string'
                          ? exercise.equipment.split(',').map(s => s.trim()).filter(Boolean)
                          : Array.isArray(exercise.equipment) ? exercise.equipment : []
                        ).slice(0, 2).map(eq => (
                        <span key={eq} className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded">
                          {eq}
                        </span>
                      ))}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showCreateButton && inputValue.trim().length >= 2 && !exactMatch && (
            <div className="border-t py-1">
              <button
                onClick={handleCreateNew}
                className="w-full px-4 py-2 text-right hover:bg-blue-50 flex items-center gap-2 text-blue-700"
              >
                <Plus className="w-4 h-4" />
                <span className="text-sm font-medium">הוסף "{inputValue}" לבנק תרגילים</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}