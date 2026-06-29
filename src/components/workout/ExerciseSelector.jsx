import React, { useState, useRef, useCallback, useMemo } from 'react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from '@/components/ui/command';
import { Button } from '@/components/ui/button';
import { Plus, Dumbbell, Search } from 'lucide-react';

// Skeleton row while loading
const SkeletonRow = () => (
  <div className="flex items-center gap-3 px-3 py-3 animate-pulse">
    <div className="w-4 h-4 rounded bg-slate-200 shrink-0" />
    <div className="flex-1 space-y-1.5">
      <div className="h-3.5 rounded bg-slate-200 w-2/3" />
      <div className="flex gap-1.5">
        <div className="h-3 rounded bg-slate-100 w-16" />
        <div className="h-3 rounded bg-slate-100 w-12" />
      </div>
    </div>
  </div>
);

// Memoised exercise row
const ExerciseRow = React.memo(function ExerciseRow({ exercise, onSelect }) {
  const nameHe = exercise?.name_he || exercise?.name || 'תרגיל ללא שם';
  const muscle = exercise?.muscle_group_primary || exercise?.category || '';
  const equipmentRaw = exercise?.equipment || [];
  const equipFirst = Array.isArray(equipmentRaw) ? equipmentRaw[0] : equipmentRaw || '';

  const handleSelect = useCallback(() => {
    onSelect(exercise);
  }, [exercise, onSelect]);

  return (
    <CommandItem
      value={nameHe}
      onSelect={handleSelect}
      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-orange-50 data-[selected=true]:bg-orange-50 rounded-lg"
    >
      <Dumbbell className="w-4 h-4 text-slate-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-slate-800 text-sm leading-tight">{nameHe}</p>
        <div className="flex gap-1.5 mt-0.5 flex-wrap">
          {muscle && (
            <span className="text-[11px] px-1.5 py-0.5 bg-orange-50 text-orange-700 rounded-md border border-orange-100">
              {muscle}
            </span>
          )}
          {equipFirst && (
            <span className="text-[11px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded-md">
              {equipFirst}
            </span>
          )}
        </div>
      </div>
    </CommandItem>
  );
});

// Main component
export default function ExerciseSelector({
  onSelect,
  onCreateCustom,
  disabled = false,
  placeholder = 'הוסף תרגיל...',
  exercises = [],
  isLoading = false,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const wrapperRef = useRef(null);
  const [popoverWidth, setPopoverWidth] = useState(400);

  const handleOpenChange = useCallback((nextOpen) => {
    if (nextOpen && wrapperRef.current) {
      setPopoverWidth(wrapperRef.current.offsetWidth);
    }
    setOpen(nextOpen);
    if (!nextOpen) setQuery('');
  }, []);

  const handleSelect = useCallback((exercise) => {
    onSelect(exercise);
    setOpen(false);
    setQuery('');
  }, [onSelect]);

  const hasExactMatch = useMemo(() => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return exercises.some(ex => (ex.name_he || ex.name || '').toLowerCase() === q);
  }, [query, exercises]);

  const handleCreateCustom = useCallback(() => {
    if (onCreateCustom && query.trim()) {
      onCreateCustom(query.trim());
      setOpen(false);
      setQuery('');
    }
  }, [onCreateCustom, query]);

  return (
    <div ref={wrapperRef} className="w-full">
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 h-11 border-dashed border-slate-300 text-slate-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>{placeholder}</span>
          </Button>
        </PopoverTrigger>

        <PopoverContent
          align="start"
          sideOffset={4}
          style={{ width: popoverWidth }}
          className="p-0 rounded-xl shadow-xl border border-slate-200 bg-white overflow-hidden"
          dir="rtl"
        >
          <Command dir="rtl" shouldFilter={true}>
            <div className="sticky top-0 z-10 bg-white border-b border-slate-100">
              <CommandInput
                placeholder="חפש תרגיל..."
                value={query}
                onValueChange={setQuery}
                className="h-11 text-sm"
              />
            </div>

            <CommandList className="max-h-[320px] overflow-y-auto scroll-smooth">
              {isLoading ? (
                <div>
                  {Array.from({ length: 6 }).map((_, i) => (
                    <SkeletonRow key={i} />
                  ))}
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="flex flex-col items-center justify-center py-8 text-slate-400">
                      <Search className="w-8 h-8 mb-2 opacity-40" />
                      <p className="text-sm">לא נמצאו תרגילים התואמים</p>
                    </div>
                  </CommandEmpty>

                  <CommandGroup>
                    {exercises.map((ex) => (
                      <ExerciseRow
                        key={ex.id || ex.name_he}
                        exercise={ex}
                        onSelect={handleSelect}
                      />
                    ))}
                  </CommandGroup>

                  {query.trim() && !hasExactMatch && (
                    <div className="border-t border-slate-100 p-1">
                      <button
                        onClick={handleCreateCustom}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                      >
                        <Plus className="w-4 h-4 shrink-0" />
                        <span>הוסף תרגיל מותאם: "{query.trim()}"</span>
                      </button>
                    </div>
                  )}
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}