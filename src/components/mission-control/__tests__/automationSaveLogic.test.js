/**
 * automationSaveLogic.test.js
 *
 * Locks the save / enable semantics of the Automation Builder so the
 * "silent activation / deactivation on an unrelated edit" regression cannot
 * come back.
 *
 * Run: npx vitest run src/components/mission-control/__tests__/automationSaveLogic.test.js
 */
import { describe, it, expect } from 'vitest';
import {
  resolveSaveEnabled,
  validateAutomation,
  describeSaveOutcome,
} from '../automationSaveLogic';

const baseForm = (over = {}) => ({
  name: 'תזכורת חזרה אחרי 7 ימים',
  trigger_type: 'weekday_time',
  message_template: 'שלום {{trainee_name}}',
  message_variants: null,
  follow_up_config: null,
  target_type: 'all',
  target_phone: '',
  target_member_ids: null,
  cooldown_hours: 24,
  enabled: false,
  ...over,
});

// Mirrors handleSave(): the value written to payload.enabled.
const enabledThatWouldBeSaved = (form) => resolveSaveEnabled(form);

describe('resolveSaveEnabled — enabled state is taken only from the form switch', () => {
  it('echoes form.enabled = true', () => {
    expect(resolveSaveEnabled(baseForm({ enabled: true }))).toBe(true);
  });
  it('echoes form.enabled = false', () => {
    expect(resolveSaveEnabled(baseForm({ enabled: false }))).toBe(false);
  });
  it('missing / undefined enabled → false (never silently enabled)', () => {
    expect(resolveSaveEnabled({})).toBe(false);
    expect(resolveSaveEnabled(baseForm({ enabled: undefined }))).toBe(false);
  });
});

describe('no save path silently flips enabled', () => {
  it('existing ENABLED automation + unrelated field edited → still saved enabled', () => {
    const edited = baseForm({ enabled: true, cooldown_hours: 48 });
    expect(enabledThatWouldBeSaved(edited)).toBe(true);
    // the enabled save is allowed to proceed (form is complete)
    expect(validateAutomation(edited, enabledThatWouldBeSaved(edited))).toEqual({ ok: true });
  });

  it('existing DISABLED automation + unrelated field edited → still saved disabled', () => {
    const edited = baseForm({ enabled: false, cooldown_hours: 48, message_template: '' });
    expect(enabledThatWouldBeSaved(edited)).toBe(false);
    // disabled save only needs a name, so an incomplete disabled record still saves
    expect(validateAutomation(edited, false)).toEqual({ ok: true });
  });

  it('turning the switch ON is the only way the saved value becomes true', () => {
    const before = baseForm({ enabled: false });
    const after = { ...before, enabled: true }; // explicit user toggle
    expect(enabledThatWouldBeSaved(before)).toBe(false);
    expect(enabledThatWouldBeSaved(after)).toBe(true);
  });

  it('turning the switch OFF is the only way the saved value becomes false', () => {
    const before = baseForm({ enabled: true });
    const after = { ...before, enabled: false }; // explicit user toggle
    expect(enabledThatWouldBeSaved(before)).toBe(true);
    expect(enabledThatWouldBeSaved(after)).toBe(false);
  });
});

describe('validateAutomation — disabled draft save', () => {
  it('only a name is required', () => {
    const r = validateAutomation(
      baseForm({ enabled: false, message_template: '', message_variants: null }),
      false
    );
    expect(r).toEqual({ ok: true });
  });

  it('missing name is rejected even for a draft', () => {
    const r = validateAutomation(baseForm({ name: '   ', enabled: false }), false);
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('when');
  });

  it('incomplete audience is allowed while disabled', () => {
    const r = validateAutomation(
      baseForm({ enabled: false, target_type: 'selected', target_member_ids: null }),
      false
    );
    expect(r).toEqual({ ok: true });
  });

  it('incomplete follow-up is allowed while disabled', () => {
    const r = validateAutomation(
      baseForm({
        enabled: false,
        follow_up_config: { enabled: true, steps: [{ action: 'send', message_template: '' }] },
      }),
      false
    );
    expect(r).toEqual({ ok: true });
  });
});

describe('validateAutomation — activation (enabled) save runs full checks before writing', () => {
  it('passes for a complete "all" automation', () => {
    expect(validateAutomation(baseForm({ enabled: true }), true)).toEqual({ ok: true });
  });

  it('rejects empty message when activating', () => {
    const r = validateAutomation(
      baseForm({ enabled: true, message_template: '  ', message_variants: [] }),
      true
    );
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('what');
  });

  it('accepts an enabled rotation variant instead of a fixed template', () => {
    const r = validateAutomation(
      baseForm({
        enabled: true,
        message_template: '',
        message_variants: [{ id: 'v1', text: 'נוסח א', enabled: true }],
      }),
      true
    );
    expect(r).toEqual({ ok: true });
  });

  it('rejects a rotation whose only variant is disabled', () => {
    const r = validateAutomation(
      baseForm({
        enabled: true,
        message_template: '',
        message_variants: [{ id: 'v1', text: 'נוסח א', enabled: false }],
      }),
      true
    );
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('what');
  });

  it('rejects target_type "one" without a valid E.164 phone', () => {
    const r = validateAutomation(
      baseForm({ enabled: true, target_type: 'one', target_phone: '0541234567' }),
      true
    );
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('who');
  });

  it('accepts target_type "one" with a valid E.164 phone', () => {
    const r = validateAutomation(
      baseForm({ enabled: true, target_type: 'one', target_phone: '+972541234567' }),
      true
    );
    expect(r).toEqual({ ok: true });
  });

  it('rejects target_type "selected" with no members', () => {
    const r = validateAutomation(
      baseForm({ enabled: true, target_type: 'selected', target_member_ids: [] }),
      true
    );
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('who');
  });

  it('accepts target_type "selected" with members', () => {
    const r = validateAutomation(
      baseForm({ enabled: true, target_type: 'selected', target_member_ids: [11, 22] }),
      true
    );
    expect(r).toEqual({ ok: true });
  });

  it('rejects an enabled follow-up whose send step has no text', () => {
    const r = validateAutomation(
      baseForm({
        enabled: true,
        follow_up_config: { enabled: true, steps: [{ action: 'send', message_template: '' }] },
      }),
      true
    );
    expect(r.ok).toBe(false);
    expect(r.scrollKey).toBe('then');
  });

  it('ignores a disabled follow-up config when activating', () => {
    const r = validateAutomation(
      baseForm({
        enabled: true,
        follow_up_config: { enabled: false, steps: [{ action: 'send', message_template: '' }] },
      }),
      true
    );
    expect(r).toEqual({ ok: true });
  });
});

describe('describeSaveOutcome — Hebrew copy always states the resulting enabled state', () => {
  it('new + enabled → says activated', () => {
    expect(describeSaveOutcome(baseForm({ enabled: true }), true)).toMatch(/הופעלה/);
  });
  it('new + disabled → says draft / off', () => {
    expect(describeSaveOutcome(baseForm({ enabled: false }), true)).toMatch(/טיוטה|כבויה/);
  });
  it('existing + enabled → says active', () => {
    expect(describeSaveOutcome(baseForm({ enabled: true }), false)).toMatch(/פעילה/);
  });
  it('existing + disabled → says off', () => {
    expect(describeSaveOutcome(baseForm({ enabled: false }), false)).toMatch(/כבויה/);
  });
});
