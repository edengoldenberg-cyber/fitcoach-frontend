/**
 * MessageVariationEditor
 *
 * Two modes:
 *   fixed    — single message template with live WhatsApp preview side-by-side (wideLayout)
 *   rotation — multiple variants, each with text + inline preview
 *
 * Variable chips insert {{var}} at cursor in the last-focused textarea.
 */
import React, { useState, useRef, useEffect } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Plus, Trash2, GripVertical } from 'lucide-react';
import WhatsAppPreviewBubble from './WhatsAppPreviewBubble';

// ── Variable definitions ────────────────────────────────────────────────────────
const VARIABLES = [
  { var: '{{trainee_name}}',       label: 'שם המתאמן' },
  { var: '{{coach_name}}',         label: 'שם המאמן' },
  { var: '{{absence_count}}',      label: 'ימי היעדרות' },
  { var: '{{last_visit_date}}',    label: 'ביקור אחרון' },
  { var: '{{remaining_sessions}}', label: 'מפגשים שנותרו' },
  { var: '{{package_expiry_date}}',label: 'תוקף המנוי' },
  { var: '{{app_link}}',           label: 'קישור לאפליקציה' },
  { var: '{{date}}',               label: 'תאריך היום' },
];

function generateId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Clickable chip bar ──────────────────────────────────────────────────────────
function VariableChips({ onInsert }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
      <p className="text-xs font-semibold text-slate-500 mb-2">לחץ להוספה ←</p>
      <div className="flex flex-wrap gap-1.5">
        {VARIABLES.map(h => (
          <button
            key={h.var}
            type="button"
            onMouseDown={e => {
              e.preventDefault(); // keep textarea focus
              onInsert(h.var);
            }}
            className="text-xs rounded-full px-2.5 py-1 bg-teal-50 border border-teal-200 text-teal-800 hover:bg-teal-100 active:scale-95 transition-all font-medium cursor-pointer"
            title={h.var}
          >
            {h.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Variant card ────────────────────────────────────────────────────────────────
function VariantCard({ variant, index, total, onUpdate, onDelete, insertRef }) {
  const taRef = useRef(null);
  const cursorRef = useRef({ start: 0, end: 0 });

  // Always-fresh refs so insertRef callback never closes over stale props.
  // onFocus only fires once per focus event, not on every React re-render,
  // so without these refs the callback would use the text/variant from the
  // render that was current when the textarea was first focused.
  const latestVariantRef = useRef(variant);
  useEffect(() => { latestVariantRef.current = variant; }, [variant]);

  const latestOnUpdateRef = useRef(onUpdate);
  useEffect(() => { latestOnUpdateRef.current = onUpdate; }, [onUpdate]);

  const trackCursor = e => {
    cursorRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
  };

  // Register this textarea as the active insert target when focused.
  const handleFocus = () => {
    insertRef.current = (variable) => {
      const el = taRef.current;
      // Read from the actual DOM element — always current regardless of
      // how many React renders have happened since focus.
      const cur = el?.value ?? latestVariantRef.current.text ?? '';
      const { start, end } = cursorRef.current;
      const next = cur.slice(0, start) + variable + cur.slice(end);
      latestOnUpdateRef.current({ ...latestVariantRef.current, text: next });
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          const pos = start + variable.length;
          el.setSelectionRange(pos, pos);
        }
      });
    };
  };

  return (
    <div className={`border-2 rounded-xl overflow-hidden transition-all ${variant.enabled ? 'border-teal-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0" />
        <Badge variant="outline" className="text-xs font-semibold bg-white text-slate-700">
          נוסח {index + 1}
        </Badge>
        <div className="flex items-center gap-2 mr-auto">
          <Switch checked={variant.enabled} onCheckedChange={v => onUpdate({ ...variant, enabled: v })} />
          <span className="text-xs text-slate-500">{variant.enabled ? 'פעיל' : 'כבוי'}</span>
          {total > 1 && (
            <button type="button" onClick={onDelete}
              className="p-1 rounded-lg hover:bg-red-100 text-slate-300 hover:text-red-500 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Textarea + preview */}
      <div className="p-3 grid grid-cols-[1fr_200px] gap-3">
        <Textarea
          ref={taRef}
          value={variant.text}
          onChange={e => onUpdate({ ...variant, text: e.target.value })}
          onFocus={handleFocus}
          onKeyUp={trackCursor}
          onMouseUp={trackCursor}
          onSelect={trackCursor}
          placeholder={`תוכן נוסח ${index + 1}...`}
          className="text-sm min-h-[100px] resize-none text-right"
          dir="rtl"
        />
        <div className="min-w-0">
          <WhatsAppPreviewBubble text={variant.text} />
        </div>
      </div>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────────────
export default function MessageVariationEditor({
  variants,
  onChange,
  baseTemplate,
  onBaseTemplateChange,
  wideLayout = false,
}) {
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const [mode, setMode] = useState(hasVariants ? 'rotation' : 'fixed');

  // Ref for inserting variables — updated by whichever textarea is active
  const insertRef = useRef(null);

  // Refs for fixed-mode textarea
  const fixedTaRef  = useRef(null);
  const fixedCursor = useRef({ start: 0, end: 0 });

  // Keep latest baseTemplate accessible in closure without staleness
  const baseTplRef = useRef(baseTemplate);
  useEffect(() => { baseTplRef.current = baseTemplate; }, [baseTemplate]);

  const registerFixedTextarea = () => {
    insertRef.current = (variable) => {
      const el = fixedTaRef.current;
      const cur = baseTplRef.current || '';
      const { start, end } = fixedCursor.current;
      const next = cur.slice(0, start) + variable + cur.slice(end);
      onBaseTemplateChange(next);
      requestAnimationFrame(() => {
        if (el) {
          el.focus();
          const pos = start + variable.length;
          el.setSelectionRange(pos, pos);
        }
      });
    };
  };

  const trackFixed = e => {
    fixedCursor.current = { start: e.target.selectionStart, end: e.target.selectionEnd };
  };

  const handleInsert = (variable) => {
    if (insertRef.current) {
      insertRef.current(variable);
    } else {
      // Fallback: append to active field
      if (mode === 'fixed') onBaseTemplateChange((baseTemplate || '') + variable);
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    if (newMode === 'fixed') {
      onChange(null);
    } else if (newMode === 'rotation' && !hasVariants) {
      onChange([
        { id: generateId(), label: 'הודעה 1', text: baseTemplate || '', enabled: true },
        { id: generateId(), label: 'הודעה 2', text: '', enabled: true },
      ]);
    }
  };

  const updateVariant = (id, updated) => onChange((variants || []).map(v => v.id === id ? updated : v));
  const deleteVariant = (id) => {
    const next = (variants || []).filter(v => v.id !== id);
    onChange(next.length ? next : null);
    if (!next.length) setMode('fixed');
  };
  const addVariant = () => {
    onChange([...(variants || []), {
      id: generateId(),
      label: `הודעה ${(variants?.length || 0) + 1}`,
      text: '',
      enabled: true,
    }]);
  };

  const enabledCount = (variants || []).filter(v => v.enabled).length;

  return (
    <div className="space-y-4" dir="rtl">
      {/* Mode toggle */}
      <div className="flex gap-2">
        {[
          { key: 'fixed',    label: 'הודעה קבועה',       sub: 'תמיד אותה הודעה' },
          { key: 'rotation', label: 'רוטציית נוסחאות',   sub: 'מחליף בין וריאציות' },
        ].map(opt => (
          <button key={opt.key} type="button" onClick={() => handleModeChange(opt.key)}
            className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-right transition-all ${mode === opt.key ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-slate-300 bg-white'}`}>
            <div className="font-semibold text-sm">{opt.label}</div>
            <div className="text-xs opacity-70 mt-0.5">{opt.sub}</div>
          </button>
        ))}
      </div>

      {/* ── Fixed mode ── */}
      {mode === 'fixed' && (
        <div className={wideLayout ? 'grid grid-cols-[1fr_260px] gap-4' : 'space-y-3'}>
          {/* Editor side */}
          <div className="space-y-3">
            <Textarea
              ref={fixedTaRef}
              value={baseTemplate}
              onChange={e => onBaseTemplateChange(e.target.value)}
              onFocus={registerFixedTextarea}
              onKeyUp={trackFixed}
              onMouseUp={trackFixed}
              onSelect={trackFixed}
              placeholder="תוכן ההודעה..."
              className="text-sm min-h-[140px] resize-none text-right"
              dir="rtl"
            />
            <VariableChips onInsert={handleInsert} />
          </div>

          {/* Preview side (wideLayout) or below (narrow) */}
          {wideLayout ? (
            <div>
              <p className="text-xs font-semibold text-slate-500 mb-2">👁️ תצוגה מקדימה חיה</p>
              <WhatsAppPreviewBubble text={baseTemplate} />
            </div>
          ) : (
            <WhatsAppPreviewBubble text={baseTemplate} />
          )}
        </div>
      )}

      {/* ── Rotation mode ── */}
      {mode === 'rotation' && (
        <div className="space-y-3">
          {enabledCount > 1 && (
            <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-xl px-3 py-2.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
              {enabledCount} נוסחאות פעילות — נוסח אחד ייבחר אוטומטית בכל שליחה
            </div>
          )}

          {(variants || []).map((v, i) => (
            <VariantCard
              key={v.id}
              variant={v}
              index={i}
              total={variants.length}
              insertRef={insertRef}
              onUpdate={updated => updateVariant(v.id, updated)}
              onDelete={() => deleteVariant(v.id)}
            />
          ))}

          <Button type="button" variant="outline" onClick={addVariant}
            className="w-full border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 gap-2">
            <Plus className="w-4 h-4" />
            הוסף נוסח
          </Button>

          {/* Variable chips in rotation mode */}
          <VariableChips onInsert={handleInsert} />
        </div>
      )}
    </div>
  );
}
