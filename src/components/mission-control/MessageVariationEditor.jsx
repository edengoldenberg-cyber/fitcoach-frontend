import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, GripVertical, Eye, EyeOff } from 'lucide-react';
import WhatsAppPreviewBubble from './WhatsAppPreviewBubble';

function generateId() {
  return `v_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

const VARIABLE_HINTS = [
  { var: '{{trainee_name}}', desc: 'שם המתאמן' },
  { var: '{{coach_name}}', desc: 'שם המאמן' },
  { var: '{{app_link}}', desc: 'קישור לאפליקציה' },
  { var: '{{date}}', desc: 'תאריך היום' },
  { var: '{{absence_count}}', desc: 'ימי היעדרות' },
  { var: '{{last_visit_date}}', desc: 'ביקור אחרון' },
  { var: '{{remaining_sessions}}', desc: 'מפגשים שנותרו' },
  { var: '{{package_expiry_date}}', desc: 'תאריך פקיעת מנוי' },
];

function VariantCard({ variant, index, total, onUpdate, onDelete, onMoveUp, onMoveDown }) {
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div className={`border-2 rounded-xl overflow-hidden transition-all ${variant.enabled ? 'border-teal-200 bg-white' : 'border-slate-200 bg-slate-50 opacity-70'}`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-100">
        <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 cursor-grab" />
        <Badge variant="outline" className="text-xs font-mono bg-white">
          הודעה {index + 1}
        </Badge>
        {variant.label && (
          <span className="text-xs text-slate-500 flex-1 truncate">{variant.label}</span>
        )}
        <div className="flex items-center gap-1 mr-auto">
          <button
            type="button"
            onClick={() => setShowPreview(v => !v)}
            className="p-1 rounded-lg hover:bg-slate-200 transition-colors"
            title="תצוגה מקדימה"
          >
            {showPreview ? <EyeOff className="w-3.5 h-3.5 text-slate-500" /> : <Eye className="w-3.5 h-3.5 text-slate-500" />}
          </button>
          <div className="flex items-center gap-1">
            <Switch
              checked={variant.enabled}
              onCheckedChange={v => onUpdate({ ...variant, enabled: v })}
            />
            <span className="text-xs text-slate-500">{variant.enabled ? 'פעיל' : 'כבוי'}</span>
          </div>
          {total > 1 && (
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded-lg hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors"
              title="מחק"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        <Textarea
          value={variant.text}
          onChange={e => onUpdate({ ...variant, text: e.target.value })}
          placeholder={`תוכן הודעה ${index + 1}...`}
          className="text-sm min-h-[90px] resize-none text-right"
          dir="rtl"
        />
        {showPreview && (
          <WhatsAppPreviewBubble text={variant.text} className="mt-2" />
        )}
      </div>
    </div>
  );
}

export default function MessageVariationEditor({ variants, onChange, baseTemplate, onBaseTemplateChange }) {
  const hasVariants = Array.isArray(variants) && variants.length > 0;
  const [mode, setMode] = useState(hasVariants ? 'rotation' : 'fixed');

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

  const updateVariant = (id, updated) => {
    onChange((variants || []).map(v => v.id === id ? updated : v));
  };

  const deleteVariant = (id) => {
    const next = (variants || []).filter(v => v.id !== id);
    onChange(next.length ? next : null);
    if (!next.length) setMode('fixed');
  };

  const addVariant = () => {
    const next = [...(variants || []), { id: generateId(), label: `הודעה ${(variants?.length || 0) + 1}`, text: '', enabled: true }];
    onChange(next);
  };

  const enabledCount = (variants || []).filter(v => v.enabled).length;

  return (
    <div className="space-y-3" dir="rtl">
      {/* Mode selector */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleModeChange('fixed')}
          className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-right ${mode === 'fixed' ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
        >
          <div className="font-semibold">הודעה קבועה</div>
          <div className="text-xs font-normal opacity-70 mt-0.5">שולח תמיד את אותה הודעה</div>
        </button>
        <button
          type="button"
          onClick={() => handleModeChange('rotation')}
          className={`flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all text-right ${mode === 'rotation' ? 'border-teal-400 bg-teal-50 text-teal-800' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
        >
          <div className="font-semibold">רוטציית הודעות</div>
          <div className="text-xs font-normal opacity-70 mt-0.5">מחליף בין וריאציות שונות</div>
        </button>
      </div>

      {mode === 'fixed' && (
        <div className="space-y-2">
          <Textarea
            value={baseTemplate}
            onChange={e => onBaseTemplateChange(e.target.value)}
            placeholder="תוכן ההודעה..."
            className="text-sm min-h-[110px] resize-none text-right"
            dir="rtl"
          />
          <WhatsAppPreviewBubble text={baseTemplate} />
        </div>
      )}

      {mode === 'rotation' && (
        <div className="space-y-3">
          {enabledCount > 0 && (
            <div className="text-xs text-teal-700 bg-teal-50 border border-teal-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-teal-500 flex-shrink-0" />
              {enabledCount} הודעות פעילות — המערכת תבחר אחת באקראי בכל שליחה
            </div>
          )}
          {(variants || []).map((v, i) => (
            <VariantCard
              key={v.id}
              variant={v}
              index={i}
              total={variants.length}
              onUpdate={updated => updateVariant(v.id, updated)}
              onDelete={() => deleteVariant(v.id)}
            />
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={addVariant}
            className="w-full border-dashed border-teal-300 text-teal-700 hover:bg-teal-50 gap-2"
          >
            <Plus className="w-4 h-4" />
            הוסף וריאציה
          </Button>
        </div>
      )}

      {/* Variable hints */}
      <div className="rounded-lg bg-slate-50 border border-slate-200 p-3">
        <p className="text-xs font-semibold text-slate-600 mb-2">משתנים זמינים:</p>
        <div className="flex flex-wrap gap-1.5">
          {VARIABLE_HINTS.map(h => (
            <span key={h.var} className="text-xs bg-white border border-slate-200 rounded px-1.5 py-0.5 font-mono text-slate-700 cursor-help" title={h.desc}>
              {h.var}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
