/**
 * ArboxBroadcastManager — "שליחת הודעה בתפוצה"
 *
 * General manual WhatsApp broadcast for Mission Control.
 * Coach selects recipients, writes any message, optionally adds a link.
 *
 * Flow: נמענים → הודעה → תצוגה מקדימה → שליחה
 */

import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card }   from '@/components/ui/card';
import { toast }  from 'sonner';
import {
  Send, Eye, CheckCircle2, AlertTriangle, Loader2, MessageSquare,
  Users, Phone, RefreshCw, Link, Search, ChevronLeft, ChevronRight,
  XCircle, User, X,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(url) {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function templateNeedsLink(t) {
  return /\{\{link\}\}/.test(t) || /\{\{survey_url\}\}/.test(t);
}

function insertAtCursor(ref, variable) {
  const el = ref.current;
  if (!el) return null;
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd   ?? el.value.length;
  const next  = el.value.slice(0, start) + variable + el.value.slice(end);
  el.focus();
  // Return new value + cursor position for React state update
  return { value: next, cursor: start + variable.length };
}

// ─── Step badge ───────────────────────────────────────────────────────────────

function StepBadge({ n, active, done }) {
  return (
    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0
      ${done ? 'bg-emerald-500 text-white' : active ? 'bg-teal-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
      {done ? '✓' : n}
    </div>
  );
}

// ─── Campaign status badge ─────────────────────────────────────────────────────

function CampaignStatusBadge({ status, queued }) {
  const map = {
    completed: { cls: 'bg-emerald-100 text-emerald-700', label: `נשלח · ${queued ?? 0}` },
    test_sent: { cls: 'bg-blue-100 text-blue-700',       label: 'בדיקה נשלחה' },
    executing: { cls: 'bg-amber-100 text-amber-700',     label: 'שולח...' },
    draft:     { cls: 'bg-slate-100 text-slate-600',     label: 'טיוטה' },
    failed:    { cls: 'bg-red-100 text-red-700',         label: 'נכשל' },
  };
  const { cls, label } = map[status] ?? { cls: 'bg-slate-100 text-slate-500', label: status };
  return <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${cls}`}>{label}</span>;
}

// ─── WhatsApp bubble preview ───────────────────────────────────────────────────

function WhatsAppBubble({ text }) {
  if (!text) return null;
  return (
    <div className="bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-4 py-2.5 text-sm text-slate-800 max-w-sm shadow-sm whitespace-pre-wrap leading-relaxed font-sans">
      {text}
    </div>
  );
}

// ─── Step 1: Recipient Selector ────────────────────────────────────────────────

function RecipientSelector({ coachEmail, selected, setSelected, onNext }) {
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey:  ['arboxBroadcastCustomers', coachEmail],
    queryFn:   () => base44.functions.invoke('getArboxBroadcastCustomers', { coachEmail, active_only: false }),
    staleTime: 60_000,
    enabled:   !!coachEmail,
  });

  const customers = data?.customers ?? [];

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return customers;
    return customers.filter(c =>
      c.first_name?.toLowerCase().includes(s) ||
      c.last_name?.toLowerCase().includes(s)  ||
      c.phone_e164?.includes(s)
    );
  }, [customers, search]);

  const activeWithPhone = useMemo(
    () => customers.filter(c => c.active && c.has_valid_phone),
    [customers]
  );

  const selectedWithPhone = useMemo(
    () => [...selected].filter(id => {
      const c = customers.find(x => x.arbox_user_id === id);
      return c?.has_valid_phone;
    }),
    [selected, customers]
  );

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleVisible = () => {
    const allVisible = filtered.every(c => selected.has(c.arbox_user_id));
    setSelected(prev => {
      const next = new Set(prev);
      filtered.forEach(c => allVisible ? next.delete(c.arbox_user_id) : next.add(c.arbox_user_id));
      return next;
    });
  };

  const selectAllActive = () => {
    setSelected(new Set(activeWithPhone.map(c => c.arbox_user_id)));
  };

  const clearAll = () => setSelected(new Set());

  const allVisibleSelected = filtered.length > 0 && filtered.every(c => selected.has(c.arbox_user_id));

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
        <Users className="w-4 h-4 text-teal-600" />
        בחירת נמענים
      </div>

      {/* Count summary */}
      <div className="flex gap-3 text-xs flex-wrap">
        <span className="bg-teal-50 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full font-medium">
          נבחרו {selected.size} לקוחות
        </span>
        <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
          {selectedWithPhone.length} עם מספר WhatsApp תקין
        </span>
        {(selected.size - selectedWithPhone.length) > 0 && (
          <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full font-medium">
            {selected.size - selectedWithPhone.length} ללא מספר תקין
          </span>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={selectAllActive}>
          <CheckCircle2 className="w-3 h-3" /> בחר כל הפעילים עם WhatsApp ({activeWithPhone.length})
        </Button>
        <Button size="sm" variant="outline" className="text-xs h-7 gap-1" onClick={toggleVisible}>
          {allVisibleSelected ? 'בטל בחירה נראים' : 'בחר כל הנראים'}
        </Button>
        {selected.size > 0 && (
          <Button size="sm" variant="ghost" className="text-xs h-7 text-slate-400 gap-1" onClick={clearAll}>
            <X className="w-3 h-3" /> נקה הכל
          </Button>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-2.5 w-4 h-4 text-slate-400" />
        <input
          className="w-full border rounded-lg px-3 py-2 pr-9 text-sm"
          placeholder="חיפוש לפי שם או טלפון..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          dir="rtl"
        />
      </div>

      {/* Customer list */}
      <div className="border rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 border-b text-xs text-slate-500 flex justify-between">
          <span>{filtered.length} לקוחות {search ? '(מסוננים)' : ''}</span>
          <span className="text-slate-400">רק user_role=client</span>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-slate-400 text-sm">
              <Loader2 className="w-4 h-4 animate-spin ml-2" /> טוען לקוחות...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-sm text-slate-400">לא נמצאו לקוחות</div>
          ) : (
            filtered.map(c => (
              <label key={c.arbox_user_id}
                className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors ${
                  selected.has(c.arbox_user_id) ? 'bg-teal-50/60' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.arbox_user_id)}
                  onChange={() => toggle(c.arbox_user_id)}
                  className="w-4 h-4 accent-teal-600 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-800 text-sm">
                      {c.first_name} {c.last_name}
                    </span>
                    {!c.active && (
                      <span className="text-xs px-1.5 py-0.5 bg-slate-100 text-slate-400 rounded">לא פעיל</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-400 font-mono">
                    {c.phone_e164 ?? <span className="text-amber-500">⚠ ללא מספר</span>}
                  </div>
                </div>
                {c.has_valid_phone
                  ? <Phone className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
                }
              </label>
            ))
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={selectedWithPhone.length === 0}
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
          className="gap-2"
        >
          המשך לכתיבת הודעה
          <ChevronLeft className="w-4 h-4" />
        </Button>
      </div>
    </Card>
  );
}

// ─── Step 2: Message Composer ──────────────────────────────────────────────────

function MessageComposer({ campaignName, setCampaignName, template, setTemplate, link, setLink, onNext, onBack }) {
  const textareaRef = useRef(null);
  const needsLink   = templateNeedsLink(template);
  const linkError   = needsLink && link.trim() && !isValidUrl(link);
  const linkReady   = !needsLink || isValidUrl(link);

  const VARS = [
    { label: '{{first_name}}', v: '{{first_name}}' },
    { label: '{{last_name}}',  v: '{{last_name}}'  },
    { label: '{{full_name}}',  v: '{{full_name}}'  },
    { label: '{{link}}',       v: '{{link}}'       },
  ];

  const insertVar = (v) => {
    const result = insertAtCursor(textareaRef, v);
    if (result) {
      setTemplate(result.value);
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = result.cursor;
          textareaRef.current.selectionEnd   = result.cursor;
          textareaRef.current.focus();
        }
      });
    }
  };

  const canProceed = campaignName.trim() && template.trim() && linkReady;

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
        <MessageSquare className="w-4 h-4 text-teal-600" />
        כתיבת הודעה
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600">שם הקמפיין</label>
        <input
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="למשל: שאלון שביעות רצון אוגוסט"
          value={campaignName}
          onChange={e => setCampaignName(e.target.value)}
          dir="rtl"
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 flex items-center gap-2">
          תוכן ההודעה
          <div className="flex gap-1 flex-wrap">
            {VARS.map(({ label, v }) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVar(v)}
                className="bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-xs px-2 py-0.5 rounded-full font-mono transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </label>
        <textarea
          ref={textareaRef}
          className="w-full border rounded-lg px-3 py-2 text-sm leading-relaxed resize-none font-sans"
          rows={10}
          value={template}
          onChange={e => setTemplate(e.target.value)}
          dir="rtl"
          placeholder="כתוב את ההודעה כאן. לחץ על משתנה למעלה כדי להוסיפו."
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
          <Link className="w-3.5 h-3.5" />
          קישור
          {needsLink
            ? <span className="text-red-500 font-bold">*</span>
            : <span className="text-slate-400">(אופציונלי)</span>
          }
        </label>
        <input
          className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${linkError ? 'border-red-400 bg-red-50' : ''}`}
          placeholder="https://..."
          value={link}
          onChange={e => setLink(e.target.value)}
          dir="ltr"
        />
        {linkError && (
          <p className="text-xs text-red-600 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> יש להזין כתובת http:// או https:// תקינה
          </p>
        )}
        {needsLink && !link.trim() && (
          <p className="text-xs text-amber-600">⚠ ההודעה מכילה {'{{link}}'} — יש להזין קישור</p>
        )}
        {!needsLink && (
          <p className="text-xs text-slate-400">הוסף {'{{link}}'} להודעה כדי להפעיל שדה זה</p>
        )}
      </div>

      <div className="flex gap-2 justify-between">
        <Button variant="outline" onClick={onBack} className="gap-1">
          <ChevronRight className="w-4 h-4" /> חזרה לנמענים
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          style={{ backgroundColor: '#79DBD6', color: 'white' }}
          className="gap-2"
        >
          <Eye className="w-4 h-4" /> תצוגה מקדימה
        </Button>
      </div>
    </Card>
  );
}

// ─── Main component ────────────────────────────────────────────────────────────

export default function ArboxBroadcastManager({ coachEmail }) {
  const qc = useQueryClient();

  const [step,         setStep]         = useState(1); // 1=recipients, 2=message, 3=preview, 4=confirm
  const [selected,     setSelected]     = useState(new Set());
  const [campaignName, setCampaignName] = useState('');
  const [template,     setTemplate]     = useState('');
  const [link,         setLink]         = useState('');
  const [testPhone,    setTestPhone]    = useState('');
  const [testSent,     setTestSent]     = useState(false); // tracks optional test send
  const [confirmed,    setConfirmed]    = useState(false);
  const [campaignId,   setCampaignId]   = useState(null);
  const [preview,      setPreview]      = useState(null);
  const [previewIdx,   setPreviewIdx]   = useState(0);
  const [execResult,   setExecResult]   = useState(null);

  // Past campaigns
  const { data: pastData, refetch: refetchPast } = useQuery({
    queryKey:  ['arboxBroadcasts'],
    queryFn:   () => base44.functions.invoke('listArboxBroadcasts', {}),
    staleTime: 30_000,
  });
  const pastCampaigns = pastData?.campaigns ?? [];

  // Customer list (for selected counts in steps 3+)
  const { data: customersData } = useQuery({
    queryKey:  ['arboxBroadcastCustomers', coachEmail],
    queryFn:   () => base44.functions.invoke('getArboxBroadcastCustomers', { coachEmail }),
    staleTime: 60_000,
    enabled:   !!coachEmail,
  });
  const customers    = customersData?.customers ?? [];
  const selectedList = customers.filter(c => selected.has(c.arbox_user_id));
  const withPhone    = preview?.audience?.with_phone    ?? selectedList.filter(c => c.has_valid_phone).length;
  const skipped      = preview?.audience?.skipped_no_phone ?? (selected.size - withPhone);

  // ── Step 2 → 3: Create draft + preview ──────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error('יש להזין שם לקמפיין');
      if (!template.trim())     throw new Error('יש להזין תוכן הודעה');
      if (selected.size === 0)  throw new Error('יש לבחור לפחות לקוח אחד');
      if (templateNeedsLink(template) && !link.trim()) throw new Error('יש להזין קישור');
      if (templateNeedsLink(template) && !isValidUrl(link)) throw new Error('הקישור אינו תקין');

      const created = await base44.functions.invoke('createArboxBroadcast', {
        campaign_name:    campaignName.trim(),
        message_template: template.trim(),
        recipient_ids:    [...selected],
        link:             link.trim() || undefined,
      });
      if (!created?.ok) throw new Error(created?.error || 'שגיאה ביצירת הקמפיין');
      setCampaignId(created.campaign.id);

      const prev = await base44.functions.invoke('previewArboxBroadcast', {
        campaign_id: created.campaign.id,
      });
      if (!prev?.ok) throw new Error(prev?.error || 'שגיאה בטעינת תצוגה מקדימה');
      setPreview(prev);
      setPreviewIdx(0);
      setStep(3);
      return prev;
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Step 4: Test send ────────────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: async () => {
      if (!testPhone.trim()) throw new Error('יש להזין מספר טלפון לבדיקה');
      const r = await base44.functions.invoke('sendArboxBroadcastTest', {
        campaign_id: campaignId,
        test_phone:  testPhone.trim(),
      });
      if (!r?.ok) throw new Error(r?.error || 'שגיאה בשליחת הודעת בדיקה');
      setStep(4);
      return r;
    },
    onSuccess: () => { setTestSent(true); toast.success('✅ הודעת בדיקה נשלחה — בדוק את הטלפון'); },
    onError:   (err) => toast.error(err.message),
  });

  // ── Execute ──────────────────────────────────────────────────────────────────
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!confirmed) throw new Error('יש לסמן אישור');
      const r = await base44.functions.invoke('executeArboxBroadcast', {
        campaign_id: campaignId,
        confirm:     true,
      });
      if (!r?.ok) throw new Error(r?.error || 'שגיאה בשליחה');
      return r;
    },
    onSuccess: (data) => {
      setExecResult(data);
      toast.success(`🚀 ההודעה נשלחה — ${data.queued} נמענים נוספו לתור`);
      refetchPast();
      qc.invalidateQueries(['arboxBroadcasts']);
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = createMutation.isPending || testMutation.isPending || executeMutation.isPending;

  const reset = () => {
    setStep(1); setSelected(new Set()); setCampaignName(''); setTemplate('');
    setLink(''); setTestPhone(''); setTestSent(false); setConfirmed(false);
    setCampaignId(null); setPreview(null); setPreviewIdx(0); setExecResult(null);
  };

  const etaMin = Math.ceil(withPhone / 20);

  // Current preview rendering
  const renderings   = preview?.renderings ?? [];
  const currentRender = renderings[previewIdx];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" dir="rtl">

      {/* Step indicator */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
        {[
          [1, 'נמענים'],
          [2, 'הודעה'],
          [3, 'תצוגה מקדימה'],
          [4, 'אישור ושליחה'],
        ].map(([n, label], i, arr) => (
          <React.Fragment key={n}>
            <StepBadge n={n} active={step === n} done={step > n} />
            <span className={`text-xs ${step === n ? 'font-semibold text-slate-800' : ''}`}>{label}</span>
            {i < arr.length - 1 && <div className="h-px w-5 bg-slate-200" />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: Recipient selector ──────────────────────────────────────── */}
      {step === 1 && (
        <RecipientSelector
          coachEmail={coachEmail}
          selected={selected}
          setSelected={setSelected}
          onNext={() => setStep(2)}
        />
      )}

      {/* ── Step 2: Message composer ────────────────────────────────────────── */}
      {step === 2 && (
        <MessageComposer
          campaignName={campaignName} setCampaignName={setCampaignName}
          template={template} setTemplate={setTemplate}
          link={link} setLink={setLink}
          onNext={() => createMutation.mutate()}
          onBack={() => setStep(1)}
        />
      )}

      {/* ── Step 3: Preview ─────────────────────────────────────────────────── */}
      {step === 3 && preview && !execResult && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <Eye className="w-4 h-4 text-teal-600" />
            תצוגה מקדימה
          </div>

          {/* Audience summary */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-2">
            <p className="text-sm font-semibold text-teal-800">קהל יעד שנבחר</p>
            <div className="flex gap-4 text-sm flex-wrap">
              <span className="text-slate-700">נבחרו: <strong>{preview.audience.selected_total}</strong></span>
              <span className="text-emerald-700">✓ יקבלו הודעה: <strong>{preview.audience.with_phone}</strong></span>
              {preview.audience.skipped_no_phone > 0 && (
                <span className="text-amber-700">⚠ ללא מספר: <strong>{preview.audience.skipped_no_phone}</strong></span>
              )}
            </div>
          </div>

          {/* Per-recipient preview */}
          {renderings.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-600">
                  תצוגה מקדימה — {currentRender?.full_name} · {currentRender?.phone_masked}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                    disabled={previewIdx === 0}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                  ><ChevronRight className="w-4 h-4" /></button>
                  <span className="text-xs text-slate-500">{previewIdx + 1} / {renderings.length}</span>
                  <button
                    onClick={() => setPreviewIdx(i => Math.min(renderings.length - 1, i + 1))}
                    disabled={previewIdx >= renderings.length - 1}
                    className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"
                  ><ChevronLeft className="w-4 h-4" /></button>
                </div>
              </div>

              {/* WhatsApp-style bubble */}
              <div className="bg-[#efeae2] rounded-xl p-4 flex justify-end">
                <WhatsAppBubble text={currentRender?.rendered_text} />
              </div>
            </div>
          )}

          {/* Test send */}
          <div className="border border-amber-200 bg-amber-50 rounded-xl p-3 space-y-2">
            <p className="text-xs font-semibold text-amber-800">
              ⚠ שלח הודעת בדיקה לטלפון שלך לפני השליחה המלאה
            </p>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-1.5 text-sm font-mono"
                placeholder="+972501234567 או 0501234567"
                value={testPhone}
                onChange={e => setTestPhone(e.target.value)}
                dir="ltr"
              />
              <Button
                onClick={() => testMutation.mutate()}
                disabled={isLoading}
                className="bg-amber-500 hover:bg-amber-600 text-white gap-1 text-xs"
              >
                {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Phone className="w-3 h-3" />}
                שלח בדיקה
              </Button>
            </div>
          </div>

          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setStep(2)} className="gap-1">
              <ChevronRight className="w-4 h-4" /> חזרה לעריכה
            </Button>
            <Button
              onClick={() => setStep(4)}
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              className="gap-2"
            >
              המשך לאישור שליחה
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 4: Confirm + Execute ────────────────────────────────────────── */}
      {step === 4 && preview && !execResult && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            אישור שליחה
          </div>

          {testSent ? (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
              ✅ הודעת בדיקה נשלחה בהצלחה. ודא שקיבלת אותה לפני שממשיכים.
            </div>
          ) : (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600">
              💡 שליחת הודעת בדיקה היא אופציונלית — ניתן לדלג ולשלוח ישירות.
            </div>
          )}

          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
            <p className="font-bold text-red-800 text-base">
              אתה עומד לשלוח הודעת WhatsApp ל-{withPhone} לקוחות
            </p>
            <div className="text-sm text-slate-700 space-y-1">
              <p>📋 <strong>קמפיין:</strong> {campaignName}</p>
              <p>✅ <strong>יקבלו הודעה:</strong> {withPhone} לקוחות</p>
              {skipped > 0 && <p>⚠️ <strong>{skipped} לקוחות ללא מספר טלפון לא יקבלו את ההודעה</strong></p>}
              <p className="text-amber-700">⏱ עד {etaMin} דקות לסיום (20 הודעות/דקה)</p>
            </div>
          </div>

          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 border rounded-xl p-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 accent-teal-600 mt-0.5 flex-shrink-0"
            />
            <span className="text-sm text-slate-700">
              קראתי את הפרטים ואני מאשר שליחת ההודעה ל-<strong>{withPhone} לקוחות</strong>.
              אני מבין שלא ניתן לבטל לאחר האישור.
            </span>
          </label>

          {!confirmed && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5" /> יש לסמן אישור לפני שניתן לשלוח
            </div>
          )}

          <div className="flex gap-2 justify-between">
            <Button variant="outline" onClick={() => setStep(3)} className="gap-1">
              <ChevronRight className="w-4 h-4" /> חזרה לתצוגה
            </Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={!confirmed || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח הודעה ל-{withPhone} לקוחות
            </Button>
          </div>
        </Card>
      )}

      {/* ── Result card ──────────────────────────────────────────────────────── */}
      {execResult && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4" /> ההודעה נוספה לתור — שולחת ברקע
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-2xl font-bold text-blue-700">{execResult.queued}</p>
              <p className="text-xs text-slate-500">ממתינות לשליחה</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-2xl font-bold text-amber-600">{execResult.skipped}</p>
              <p className="text-xs text-slate-500">דולגו (ללא טלפון)</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-2xl font-bold text-red-600">{execResult.failed}</p>
              <p className="text-xs text-slate-500">שגיאת תיוג</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">הודעות יישלחו בקצב של עד 20 לדקה דרך WhatsApp.</p>
          <Button variant="outline" size="sm" onClick={reset}>תפוצה חדשה</Button>
        </Card>
      )}

      {/* ── History ──────────────────────────────────────────────────────────── */}
      {pastCampaigns.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-700">היסטוריית תפוצות</span>
            <Button variant="ghost" size="sm" onClick={() => refetchPast()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="space-y-0 divide-y divide-slate-100">
            {pastCampaigns.slice(0, 10).map(c => (
              <div key={c.id} className="py-2.5 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800 text-sm truncate">{c.campaign_name}</div>
                  <div className="text-xs text-slate-400 flex gap-2 mt-0.5 flex-wrap">
                    <span>{new Date(c.created_at).toLocaleDateString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    <span>נמענים: {c.recipient_count}</span>
                    {c.status === 'completed' && (
                      <>
                        <span className="text-emerald-600">נשלחו: {c.queued_count}</span>
                        {c.failed_count > 0 && <span className="text-red-500">נכשלו: {c.failed_count}</span>}
                        {c.skipped_count > 0 && <span className="text-amber-500">דולגו: {c.skipped_count}</span>}
                      </>
                    )}
                  </div>
                </div>
                <CampaignStatusBadge status={c.status} queued={c.queued_count} />
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
