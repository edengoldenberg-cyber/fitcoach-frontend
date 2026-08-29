/**
 * ArboxBroadcastManager — One-time WhatsApp satisfaction survey broadcast.
 *
 * Flow: Draft → Preview → Test Send → Confirm → Execute
 *
 * Safety:
 *   - Survey URL is required and validated (http/https) before any send
 *   - Test send is mandatory and goes to ONE explicit number only
 *   - Full send requires explicit confirmation modal showing exact counts
 *   - No send on page load, refresh, preview, navigate, or retry
 *   - All messages go through the existing rate-limited WhatsApp queue
 *   - Campaign ID + deterministic batch_id prevent double-send
 */

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Button }  from '@/components/ui/button';
import { Card }    from '@/components/ui/card';
import { toast }   from 'sonner';
import {
  Send, Eye, CheckCircle2, AlertTriangle, Loader2,
  MessageSquare, Users, Phone, RefreshCw, Link, XCircle,
} from 'lucide-react';

const DEFAULT_TEMPLATE = `היי {{first_name}} 👋

חשוב לנו לדעת איך החוויה שלך ב-SHAPE ואיפה אנחנו יכולים להשתפר ❤️

הכנו שאלון קצר של פחות מדקה ונשמח מאוד לשמוע את דעתך:

{{survey_url}}

התשובות עוזרות לנו להשתפר ולתת לך חוויה טובה יותר 🙏

צוות SHAPE`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidUrl(url) {
  if (!url?.trim()) return false;
  try {
    const u = new URL(url.trim());
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch { return false; }
}

function templateNeedsSurveyUrl(template) {
  return /\{\{survey_url\}\}/.test(template);
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

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, queued }) {
  const map = {
    completed: { cls: 'bg-emerald-100 text-emerald-700', label: `נשלח · ${queued ?? 0}` },
    test_sent: { cls: 'bg-blue-100 text-blue-700',      label: 'בדיקה נשלחה' },
    executing: { cls: 'bg-amber-100 text-amber-700',    label: 'מבצע...' },
    draft:     { cls: 'bg-slate-100 text-slate-600',    label: 'טיוטה' },
    failed:    { cls: 'bg-red-100 text-red-700',        label: 'נכשל' },
  };
  const { cls, label } = map[status] ?? { cls: 'bg-slate-100 text-slate-500', label: status };
  return <span className={`px-2 py-0.5 rounded-full font-medium text-xs ${cls}`}>{label}</span>;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ArboxBroadcastManager({ coachEmail }) {
  const qc = useQueryClient();

  const [step,          setStep]          = useState(1); // 1=compose, 2=preview, 3=test, 4=confirm
  const [campaignId,    setCampaignId]    = useState(null);
  const [campaignName,  setCampaignName]  = useState('');
  const [template,      setTemplate]      = useState(DEFAULT_TEMPLATE);
  const [surveyUrl,     setSurveyUrl]     = useState('');
  const [audienceFilter, setAudienceFilter] = useState('active_with_phone');
  const [testPhone,     setTestPhone]     = useState('');
  const [confirmed,     setConfirmed]     = useState(false);
  const [preview,       setPreview]       = useState(null);
  const [execResult,    setExecResult]    = useState(null);

  const urlNeeded   = templateNeedsSurveyUrl(template);
  const urlValid    = !urlNeeded || isValidUrl(surveyUrl);
  const urlError    = urlNeeded && surveyUrl.trim() && !isValidUrl(surveyUrl);

  // Past campaigns
  const { data: pastData, refetch: refetchPast } = useQuery({
    queryKey:  ['arboxBroadcasts'],
    queryFn:   () => base44.functions.invoke('listArboxBroadcasts', {}),
    staleTime: 30_000,
  });
  const pastCampaigns = pastData?.campaigns ?? [];

  // ── Step 1 → 2: Create + preview ─────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: async () => {
      if (!campaignName.trim()) throw new Error('יש להזין שם לקמפיין');
      if (!template.trim())     throw new Error('יש להזין תוכן הודעה');
      if (urlNeeded && !surveyUrl.trim()) throw new Error('יש להזין קישור לשאלון');
      if (urlNeeded && !isValidUrl(surveyUrl)) throw new Error('הקישור לשאלון אינו תקין (חייב להתחיל ב-http:// או https://)');

      const created = await base44.functions.invoke('createArboxBroadcast', {
        campaign_name:    campaignName.trim(),
        message_template: template.trim(),
        audience_filter:  audienceFilter,
        survey_url:       surveyUrl.trim() || undefined,
      });
      if (!created?.ok) throw new Error(created?.error || 'שגיאה ביצירת הקמפיין');
      setCampaignId(created.campaign.id);

      const prev = await base44.functions.invoke('previewArboxBroadcast', {
        campaign_id: created.campaign.id,
      });
      if (!prev?.ok) throw new Error(prev?.error || 'שגיאה בטעינת תצוגה מקדימה');
      setPreview(prev);
      setStep(2);
      return prev;
    },
    onError: (err) => toast.error(err.message),
  });

  // ── Step 3: Test send ─────────────────────────────────────────────────────────
  const testMutation = useMutation({
    mutationFn: async () => {
      if (!testPhone.trim()) throw new Error('יש להזין מספר טלפון לבדיקה');
      const result = await base44.functions.invoke('sendArboxBroadcastTest', {
        campaign_id: campaignId,
        test_phone:  testPhone.trim(),
      });
      if (!result?.ok) throw new Error(result?.error || 'שגיאה בשליחת הודעת בדיקה');
      setStep(4);
      return result;
    },
    onSuccess: () => toast.success('✅ הודעת בדיקה נוספה לתור — בדוק את הטלפון לפני שממשיכים'),
    onError:   (err) => toast.error(err.message),
  });

  // ── Step 4: Execute ──────────────────────────────────────────────────────────
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!confirmed) throw new Error('יש לסמן אישור לפני שליחת הקמפיין');
      const result = await base44.functions.invoke('executeArboxBroadcast', {
        campaign_id: campaignId,
        confirm:     true,
      });
      if (!result?.ok) throw new Error(result?.error || 'שגיאה בהפעלת הקמפיין');
      return result;
    },
    onSuccess: (data) => {
      setExecResult(data);
      toast.success(`🚀 הקמפיין הופעל — ${data.queued} הודעות נוספו לתור`);
      refetchPast();
      qc.invalidateQueries(['arboxBroadcasts']);
    },
    onError: (err) => toast.error(err.message),
  });

  const isLoading = createMutation.isPending || testMutation.isPending || executeMutation.isPending;
  const withPhone  = preview?.audience?.with_phone ?? 0;
  const totalActive = preview?.audience?.total_active ?? 0;
  const skipped    = preview?.audience?.skipped_no_phone ?? 0;
  const etaMin     = Math.ceil(withPhone / 20);

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5" dir="rtl">

      {/* Step indicator */}
      <div className="flex items-center gap-1.5 text-xs text-slate-500 flex-wrap">
        {[
          [1, 'כתיבה'],
          [2, 'תצוגה'],
          [3, 'בדיקה'],
          [4, 'אישור'],
        ].map(([n, label], i, arr) => (
          <React.Fragment key={n}>
            <StepBadge n={n} active={step === n} done={step > n} />
            <span className={step === n ? 'font-semibold text-slate-800 text-xs' : 'text-xs'}>{label}</span>
            {i < arr.length - 1 && <div className="h-px w-6 bg-slate-200" />}
          </React.Fragment>
        ))}
      </div>

      {/* ── Step 1: Compose ────────────────────────────────────────────────── */}
      {step === 1 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <MessageSquare className="w-4 h-4 text-teal-600" />
            כתיבת הקמפיין
          </div>

          {/* Campaign name */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">שם הקמפיין</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              placeholder="למשל: סקר שביעות רצון אוגוסט 2026"
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
            />
          </div>

          {/* Survey URL — required when template has {{survey_url}} */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1">
              <Link className="w-3.5 h-3.5" />
              קישור לשאלון
              {urlNeeded && <span className="text-red-500 font-bold">*</span>}
            </label>
            <input
              className={`w-full border rounded-lg px-3 py-2 text-sm font-mono ${
                urlError ? 'border-red-400 bg-red-50' : ''
              }`}
              placeholder="https://forms.example.com/survey"
              value={surveyUrl}
              onChange={e => setSurveyUrl(e.target.value)}
              dir="ltr"
            />
            {urlError && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <XCircle className="w-3 h-3" /> הכתובת אינה תקינה — חייבת להתחיל ב-https:// או http://
              </p>
            )}
            {urlNeeded && !surveyUrl.trim() && (
              <p className="text-xs text-amber-600">
                ⚠ ההודעה מכילה {'{{survey_url}}'} — יש לספק קישור תקין
              </p>
            )}
            {!urlNeeded && (
              <p className="text-xs text-slate-400">
                הוסף {'{{survey_url}}'} להודעה כדי להפעיל שדה זה
              </p>
            )}
          </div>

          {/* Audience filter */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">קהל יעד</label>
            <select
              className="w-full border rounded-lg px-3 py-2 text-sm"
              value={audienceFilter}
              onChange={e => setAudienceFilter(e.target.value)}
            >
              <option value="active_with_phone">לקוחות Arbox פעילים עם מספר WhatsApp</option>
              <option value="all_clients">כל הלקוחות הפעילים (כולל ללא מספר)</option>
            </select>
            <p className="text-xs text-slate-400">
              פעיל = user_role=client AND active=true (ללא פילטר מנוי)
            </p>
          </div>

          {/* Message template */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">
              תוכן ההודעה
              <span className="text-slate-400 mr-1 font-normal">
                — משתנים: {'{{first_name}}'}, {'{{survey_url}}'}
              </span>
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm leading-relaxed resize-none"
              rows={11}
              value={template}
              onChange={e => setTemplate(e.target.value)}
              dir="rtl"
            />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => createMutation.mutate()}
              disabled={isLoading || !urlValid}
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              className="gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
              תצוגה מקדימה
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 2: Preview ─────────────────────────────────────────────────── */}
      {step === 2 && preview && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <Users className="w-4 h-4 text-teal-600" />
            תצוגה מקדימה
          </div>

          {/* Audience counts */}
          <div className="bg-teal-50 border border-teal-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-semibold text-teal-800">קהל יעד</p>
            <div className="grid grid-cols-3 gap-3">
              <div className="text-center bg-white rounded-lg p-2 border border-teal-100">
                <p className="text-2xl font-bold text-slate-800">{totalActive}</p>
                <p className="text-xs text-slate-500">לקוחות פעילים</p>
              </div>
              <div className="text-center bg-white rounded-lg p-2 border border-emerald-200">
                <p className="text-2xl font-bold text-emerald-700">{withPhone}</p>
                <p className="text-xs text-slate-500">יקבלו WhatsApp</p>
              </div>
              <div className="text-center bg-white rounded-lg p-2 border border-amber-200">
                <p className="text-2xl font-bold text-amber-600">{skipped}</p>
                <p className="text-xs text-slate-500">ללא מספר (ידולגו)</p>
              </div>
            </div>
          </div>

          {/* Sample messages */}
          {preview.samples?.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-600">5 הודעות ראשונות לדוגמה:</p>
              {preview.samples.map((s, i) => (
                <div key={i} className="bg-slate-50 border rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">{s.first_name} · {s.phone_masked}</p>
                  <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {s.rendered_text}
                  </pre>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setStep(1)}>חזרה לעריכה</Button>
            <Button
              onClick={() => setStep(3)}
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              className="gap-2"
            >
              <Phone className="w-4 h-4" />
              שלח הודעת בדיקה
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 3: Test send ────────────────────────────────────────────────── */}
      {step === 3 && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <Phone className="w-4 h-4 text-teal-600" />
            שליחת הודעת בדיקה
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
            ⚠ חובה לשלוח הודעת בדיקה לטלפון שלך לפני השליחה המלאה.
            ודא שהקישור לשאלון עובד, ושהשם מוצג נכון.
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-600">מספר הטלפון שלך לבדיקה</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono"
              placeholder="+972501234567 או 0501234567"
              value={testPhone}
              onChange={e => setTestPhone(e.target.value)}
              dir="ltr"
            />
            <p className="text-xs text-slate-400">
              ההודעה תישלח רק למספר זה — לא לאף לקוח אחר
            </p>
          </div>

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setStep(2)}>חזרה לתצוגה</Button>
            <Button
              onClick={() => testMutation.mutate()}
              disabled={isLoading}
              style={{ backgroundColor: '#79DBD6', color: 'white' }}
              className="gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח בדיקה
            </Button>
          </div>
        </Card>
      )}

      {/* ── Step 4: Confirm & Execute ────────────────────────────────────────── */}
      {step === 4 && preview && !execResult && (
        <Card className="p-5 space-y-4">
          <div className="flex items-center gap-2 font-semibold text-slate-800 text-sm">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            אישור שליחה
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-sm text-emerald-800">
            ✅ הודעת הבדיקה נשלחה בהצלחה. ודא שקיבלת אותה לפני המשך.
          </div>

          {/* Exact numbers confirmation box */}
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2 text-sm">
            <p className="font-bold text-red-800 text-base">
              אתה עומד לשלוח הודעת WhatsApp ל-{withPhone} לקוחות
            </p>
            <div className="space-y-1 text-slate-700">
              <p>📋 <strong>קמפיין:</strong> {campaignName}</p>
              <p>👥 <strong>לקוחות פעילים:</strong> {totalActive}</p>
              <p>✅ <strong>יקבלו הודעה:</strong> {withPhone} לקוחות (עם מספר WhatsApp תקין)</p>
              <p>⚠️ <strong>{skipped} לקוחות ללא מספר טלפון לא יקבלו את ההודעה</strong></p>
              <p className="text-amber-700">
                ⏱ שליחה בקצב 20 הודעות/דקה — יסתיים בכ-{etaMin} דקות
              </p>
            </div>
          </div>

          {/* Explicit confirmation checkbox */}
          <label className="flex items-start gap-3 cursor-pointer bg-slate-50 border rounded-xl p-3">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
              className="w-4 h-4 accent-teal-600 mt-0.5 flex-shrink-0"
            />
            <span className="text-sm text-slate-700">
              קראתי את הפרטים לעיל ואני מאשר שליחת הקמפיין ל-<strong>{withPhone} לקוחות</strong>.
              אני מבין שלא ניתן לבטל את השליחה לאחר האישור.
            </span>
          </label>

          {!confirmed && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <AlertTriangle className="w-3.5 h-3.5" />
              יש לסמן את תיבת האישור לפני שניתן לשלוח
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={() => setStep(3)}>חזרה לבדיקה</Button>
            <Button
              onClick={() => executeMutation.mutate()}
              disabled={!confirmed || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              שלח לכל הלקוחות ({withPhone})
            </Button>
          </div>
        </Card>
      )}

      {/* ── Execution result ─────────────────────────────────────────────────── */}
      {execResult && (
        <Card className="p-5 space-y-3">
          <div className="flex items-center gap-2 font-semibold text-emerald-700 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            הקמפיין הופעל בהצלחה
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
              <p className="text-xs text-slate-500">שגיאת עיבוב</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            ההודעות נוספו לתור ויישלחו בקצב של עד 20 לדקה דרך WhatsApp.
            ניתן לעקוב אחר ההתקדמות בטבלת הקמפיינים הקודמים.
          </p>
          <Button
            variant="outline" size="sm"
            onClick={() => {
              setStep(1); setCampaignId(null); setCampaignName(''); setSurveyUrl('');
              setConfirmed(false); setPreview(null); setExecResult(null);
            }}
          >
            קמפיין חדש
          </Button>
        </Card>
      )}

      {/* ── Past campaigns ───────────────────────────────────────────────────── */}
      {pastCampaigns.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-700">קמפיינים קודמים</span>
            <Button variant="ghost" size="sm" onClick={() => refetchPast()}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {pastCampaigns.slice(0, 5).map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
                <div className="min-w-0">
                  <span className="font-medium text-slate-800 block truncate">{c.campaign_name}</span>
                  <span className="text-xs text-slate-400">
                    {new Date(c.created_at).toLocaleDateString('he-IL')}
                    {c.survey_url && <span className="mr-2 text-teal-600">· עם קישור</span>}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs flex-shrink-0 mr-2">
                  <StatusBadge status={c.status} queued={c.queued_count} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
