/**
 * Pure save / enable semantics for AutomationEditorDrawer.
 *
 * INVARIANT: an automation's enabled state is owned solely by `form.enabled`
 * (the Section-1 switch). No save action derives `enabled` from which button
 * was pressed or from an implicit "draft vs activate" mode. `resolveSaveEnabled`
 * is the single source of truth and simply echoes `form.enabled` — this is what
 * protects an existing automation from being silently activated or deactivated
 * when a coach edits an unrelated field and saves.
 *
 * Kept as a standalone pure module so the semantics are unit-testable without a
 * DOM (see __tests__/automationSaveLogic.test.js).
 */

const E164_RE = /^\+\d{7,15}$/;

/**
 * The enabled value that will be persisted. Always mirrors the form switch.
 * @param {{enabled?: boolean}} form
 * @returns {boolean}
 */
export function resolveSaveEnabled(form) {
  return !!(form && form.enabled);
}

/**
 * Validate a form for saving.
 *
 * When `activating` is false (the record will be saved disabled) only a name is
 * required — coaches must be able to park incomplete drafts safely.
 *
 * When `activating` is true (the record will be saved enabled) the full set of
 * activation requirements is enforced BEFORE the enabled record is written.
 *
 * @param {object} form
 * @param {boolean} activating  true when the record will be persisted enabled
 * @returns {{ok: true} | {ok: false, message: string, scrollKey: 'when'|'who'|'what'|'then'}}
 */
export function validateAutomation(form, activating) {
  if (!form || !form.name || !form.name.trim()) {
    return { ok: false, message: 'נא להזין שם לאוטומציה', scrollKey: 'when' };
  }

  // Disabled draft: a name is enough. Everything else can be finished later.
  if (!activating) return { ok: true };

  if (form.target_type === 'one') {
    const ph = (form.target_phone || '').trim();
    if (!E164_RE.test(ph)) {
      return {
        ok: false,
        message: 'כדי להפעיל אוטומציה עם יעד "מספר טלפון ספציפי" יש להזין מספר תקין בפורמט E.164, לדוגמה: +972541234567',
        scrollKey: 'who',
      };
    }
  }

  if (form.target_type === 'selected') {
    if (!Array.isArray(form.target_member_ids) || form.target_member_ids.length === 0) {
      return {
        ok: false,
        message: 'כדי להפעיל אוטומציה עם יעד "חברים נבחרים" יש לבחור לפחות חבר אחד',
        scrollKey: 'who',
      };
    }
  }

  const hasFixed = !!(form.message_template && form.message_template.trim());
  const enabledVariants = (form.message_variants || []).filter(
    (v) => v && v.enabled && v.text && v.text.trim()
  );
  if (!hasFixed && enabledVariants.length === 0) {
    return { ok: false, message: 'כדי להפעיל אוטומציה יש להזין תוכן הודעה', scrollKey: 'what' };
  }

  if (form.follow_up_config && form.follow_up_config.enabled) {
    const steps = form.follow_up_config.steps || [];
    const badStep = steps.find(
      (s) => s && s.action === 'send' && !(s.message_template && s.message_template.trim())
    );
    if (badStep) {
      return {
        ok: false,
        message: 'נא להשלים את תוכן הודעות רצף המעקב לפני הפעלה',
        scrollKey: 'then',
      };
    }
  }

  return { ok: true };
}

/**
 * Hebrew confirmation copy that always states the resulting enabled state, so the
 * coach knows unambiguously whether the automation is now live.
 * @param {object} form
 * @param {boolean} isNew
 * @returns {string}
 */
export function describeSaveOutcome(form, isNew) {
  const enabled = resolveSaveEnabled(form);
  if (isNew) {
    return enabled ? 'האוטומציה נוצרה והופעלה ✅' : 'האוטומציה נשמרה כטיוטה (כבויה)';
  }
  return enabled ? 'השינויים נשמרו — האוטומציה פעילה ✅' : 'השינויים נשמרו — האוטומציה כבויה';
}
