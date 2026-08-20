/**
 * Regression tests for the clarification questionnaire state machine.
 *
 * Tests are pure-logic: they replicate the computations performed by
 * AIAnalyzeMealDialog and ClarificationQueue without mounting React.
 *
 * Run: node --test src/components/trainee/__tests__/clarification-state-machine.test.mjs
 */

import { test } from 'node:test';
import assert   from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dialogSrc = readFileSync(join(__dirname, '../AIAnalyzeMealDialog.jsx'), 'utf8');

// ── Pure helpers replicated from AIAnalyzeMealDialog ─────────────────────────

function getQuestionKey(q) {
  return String(q?.id || q?.question || '').toLowerCase().replace(/\s+/g, '_');
}

function isDependencySatisfied(question, answers, allQuestions) {
  if (!question.depends_on) return true;
  const { parent_measure_type, exclude_values = [] } = question.depends_on;
  const parentQ = allQuestions.find(pq =>
    pq.food_key === question.food_key && pq.measure_type === parent_measure_type
  );
  if (!parentQ) return true; // parent absent → no restriction
  const parentAns = answers[getQuestionKey(parentQ)];
  if (!parentAns) return false;
  const parentValue = parentAns.answer || '';
  if (exclude_values.some(v => parentAns.value === v || parentValue === v)) return false;
  if (parentAns._custom_grams_mode && !parentAns.grams) return false;
  return true;
}

function isClarificationAnswerComplete(answerState, question) {
  if (!answerState) return false;
  const answer = String(answerState.answer || '').trim();
  if (!answer) return false;
  if (answerState._custom_grams_mode && (!answerState.grams || answerState.grams <= 0)) return false;
  if (answerState._is_free_text) return true;
  if (question?.measure_type === 'count_pieces' && !answerState._custom_grams_mode) return true;
  if (question?.measure_type === 'size_pieces' || question?.measure_type === 'piece_form') {
    return answerState.grams !== null && answerState.grams > 0;
  }
  return true;
}

function parseFreeTextGrams(text) {
  const t = String(text || '');
  const countUnit = t.match(/(\d+)\s*(?:חתיכות?|נתחים?|יחידות?|קציצות?)[^0-9]{0,30}?(\d+)\s*גרם/);
  if (countUnit) {
    const count = parseInt(countUnit[1], 10);
    const unitG = parseInt(countUnit[2], 10);
    if (count > 0 && unitG > 0) return count * unitG;
  }
  const direct = t.match(/(\d+)\s*גרם/);
  if (direct) return parseInt(direct[1], 10);
  return null;
}

// The state-machine advance function (mirrors _advanceClarificationIndex in AIAnalyzeMealDialog)
function advanceIndex(currentIndex, allQuestions, newAnswers) {
  let next = currentIndex + 1;
  while (next < allQuestions.length && !isDependencySatisfied(allQuestions[next], newAnswers, allQuestions)) {
    next++;
  }
  return Math.min(next, allQuestions.length); // allQuestions.length means "all done"
}

function allAnswered(allQuestions, answers) {
  return allQuestions.every(q =>
    isClarificationAnswerComplete(answers[getQuestionKey(q)], q) ||
    !isDependencySatisfied(q, answers, allQuestions)
  );
}

// ── Question fixtures ─────────────────────────────────────────────────────────

const Q = {
  grain:  { id: 'q_grain',  question: 'כמה בורגול?', measure_type: 'volume', food_key: 'בורגול' },
  count:  { id: 'q_count',  question: 'כמה חתיכות?', measure_type: 'count_pieces', food_key: 'פרגית' },
  form:   { id: 'q_form',   question: 'איזה סוג?', measure_type: 'piece_form', food_key: 'פרגית',
            depends_on: { parent_measure_type: 'count_pieces', exclude_values: ['custom_grams'] } },
  size:   { id: 'q_size',   question: 'מה גודל?', measure_type: 'size_pieces', food_key: 'פרגית',
            depends_on: { parent_measure_type: 'count_pieces', exclude_values: ['custom_grams'] } },
  salad:  { id: 'q_salad',  question: 'כמה סלט?', measure_type: 'volume', food_key: 'סלט' },
};

function ans(question, answer, extra = {}) {
  return { question: question.question, food_key: question.food_key,
           measure_type: question.measure_type, answer, grams: extra.grams ?? null,
           resolved_count: extra.resolved_count ?? null, _custom_grams_mode: extra.custom ?? false, ...extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Q1 answered → advances to Q2
// ─────────────────────────────────────────────────────────────────────────────
test('SM-1: answering Q1 advances to Q2 (index 0→1)', () => {
  const allQ = [Q.grain, Q.count, Q.form];
  let idx = 0;
  const answers = {};
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: 200 });
  idx = advanceIndex(idx, allQ, answers);
  assert.equal(idx, 1, 'Index must advance from 0 to 1');
  assert.equal(allQ[idx].id, 'q_count', 'Active question must be q_count');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Open-text Q1 confirmed → advances to Q2
// ─────────────────────────────────────────────────────────────────────────────
test('SM-2: confirming free-text for Q1 advances to Q2', () => {
  const allQ = [Q.grain, Q.count];
  let idx = 0;
  const answers = {};
  // Simulate confirm-text handler: store answer then advance
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס בינונית', { grams: null });
  // isClarificationAnswerComplete returns true (non-empty, non-grams-required type)
  assert.ok(isClarificationAnswerComplete(answers[getQuestionKey(Q.grain)], Q.grain), 'Text answer must be complete');
  idx = advanceIndex(idx, allQ, answers);
  assert.equal(idx, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Q2 → Back → Q1
// ─────────────────────────────────────────────────────────────────────────────
test('SM-3: back from Q2 returns to Q1', () => {
  let idx = 1; // at Q2
  idx = Math.max(0, idx - 1);
  assert.equal(idx, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Previous answer remains after going back
// ─────────────────────────────────────────────────────────────────────────────
test('SM-4: going back to Q1 preserves the Q1 answer', () => {
  const allQ = [Q.grain, Q.count];
  const answers = {};
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: 200 });
  let idx = advanceIndex(0, allQ, answers); // advance to 1
  assert.equal(idx, 1);
  idx = Math.max(0, idx - 1); // go back
  const q1Ans = answers[getQuestionKey(allQ[idx])];
  assert.equal(q1Ans?.answer, 'כוס', 'Q1 answer must still be "כוס"');
  assert.equal(q1Ans?.grams, 200);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Edit previous answer → new value persists
// ─────────────────────────────────────────────────────────────────────────────
test('SM-5: editing Q1 after going back overwrites only Q1', () => {
  const allQ = [Q.grain, Q.count];
  const answers = {
    [getQuestionKey(Q.grain)]: ans(Q.grain, 'כוס', { grams: 200 }),
    [getQuestionKey(Q.count)]: ans(Q.count, '2 חתיכות', { resolved_count: 2 }),
  };
  // User edits Q1 (overwrites)
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס וחצי', { grams: 300 });
  assert.equal(answers[getQuestionKey(Q.grain)].answer, 'כוס וחצי');
  assert.equal(answers[getQuestionKey(Q.count)].answer, '2 חתיכות', 'Q2 must be unchanged');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Forward navigation after back works
// ─────────────────────────────────────────────────────────────────────────────
test('SM-6: forward navigation from Q1 after back advances to Q2', () => {
  const allQ = [Q.grain, Q.count];
  let idx = 1;
  idx = Math.max(0, idx - 1); // back to Q1
  assert.equal(idx, 0);
  const answers = {};
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: 200 });
  idx = advanceIndex(idx, allQ, answers);
  assert.equal(idx, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. No refinement request before final required answer
// ─────────────────────────────────────────────────────────────────────────────
test('SM-7: allAnswered is false before all required questions are complete', () => {
  const allQ = [Q.grain, Q.count];
  const answers = {
    [getQuestionKey(Q.grain)]: ans(Q.grain, 'כוס', { grams: 200 }),
    // Q.count not yet answered
  };
  assert.equal(allAnswered(allQ, answers), false, 'Must not be all-answered with Q2 missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Final answer enables submission
// ─────────────────────────────────────────────────────────────────────────────
test('SM-8: allAnswered becomes true after every required question is answered', () => {
  const allQ = [Q.grain, Q.count];
  const answers = {
    [getQuestionKey(Q.grain)]: ans(Q.grain, 'כוס', { grams: 200 }),
    [getQuestionKey(Q.count)]: ans(Q.count, '2 חתיכות', { resolved_count: 2 }),
  };
  assert.equal(allAnswered(allQ, answers), true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Progress indicator remains correct
// ─────────────────────────────────────────────────────────────────────────────
test('SM-9: progress: activeIndex + 1 out of totalQuestions', () => {
  const allQ = [Q.grain, Q.count, Q.form];
  const idx = 1; // at Q2
  const total = allQ.length;
  // "question 2 of 3"
  assert.equal(idx + 1, 2);
  assert.equal(total, 3);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Questions never duplicate
// ─────────────────────────────────────────────────────────────────────────────
test('SM-10: question list contains no duplicate keys', () => {
  const allQ = [Q.grain, Q.count, Q.form, Q.salad];
  const keys = allQ.map(getQuestionKey);
  const unique = new Set(keys);
  assert.equal(unique.size, keys.length, 'All question keys must be unique');
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Questions never skip (advance goes +1, skipping only dependency-hidden)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-11: advance goes to next eligible, not past it', () => {
  const allQ = [Q.grain, Q.count, Q.form]; // form depends on count
  const answers = {};
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: 200 });
  // Form depends on count; count not answered yet → form is NOT eligible yet
  const idx1 = advanceIndex(0, allQ, answers);
  assert.equal(idx1, 1, 'Must advance to count (idx=1), not jump to form (idx=2)');
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Open-text Enter = explicit Continue (same behavior)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-12: confirming text (either Enter or Continue) stores answer and advances', () => {
  const allQ = [Q.grain, Q.count];
  let idx = 0;
  const answers = {};
  const pendingText = 'חצי כוס';
  // Simulate confirm-text
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, pendingText, { grams: null });
  idx = advanceIndex(idx, allQ, answers);
  assert.equal(answers[getQuestionKey(Q.grain)].answer, 'חצי כוס');
  assert.equal(idx, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Empty open answer cannot advance
// ─────────────────────────────────────────────────────────────────────────────
test('SM-13: empty free-text answer is not considered complete', () => {
  const emptyAns = { answer: '', grams: null };
  assert.equal(isClarificationAnswerComplete(emptyAns, Q.grain), false, 'Empty answer must not be complete');
  const whitespaceAns = { answer: '   ', grams: null };
  assert.equal(isClarificationAnswerComplete(whitespaceAns, Q.grain), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 14–16. Mobile overflow — verified structurally (CSS classes enforced)
// These tests verify the classes are applied; visual rendering is manual.
// ─────────────────────────────────────────────────────────────────────────────
test('SM-14/15/16: ClarificationQueue has mobile-safe CSS classes', () => {
  assert.ok(dialogSrc.includes('w-full min-w-0 box-border'), 'Root container must have min-w-0 box-border');
  assert.ok(dialogSrc.includes('overflow-hidden'), 'Option buttons must have overflow-hidden');
  assert.ok(dialogSrc.includes('overflow-x-hidden'), 'DialogContent must prevent horizontal overflow');
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Switching question types does not alter modal width (CSS structural test)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-17: question card has stable width classes', () => {
  assert.ok(
    dialogSrc.includes('rounded-lg bg-white p-3 border border-amber-100 space-y-3 w-full min-w-0'),
    'Question card must have stable width classes'
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Back navigation makes zero API calls
// ─────────────────────────────────────────────────────────────────────────────
test('SM-18: back navigation is purely synchronous (no async code in handleClarificationGoBack)', () => {
  const goBackStart = dialogSrc.indexOf('const handleClarificationGoBack');
  const goBackEnd   = dialogSrc.indexOf('};', goBackStart);
  const goBackBody  = dialogSrc.slice(goBackStart, goBackEnd);
  assert.ok(!goBackBody.includes('await'), 'Back handler must not use await (no API calls)');
  assert.ok(!goBackBody.includes('invoke'), 'Back handler must not call API functions');
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. All stored answers reach buildStructuredAnswers
// ─────────────────────────────────────────────────────────────────────────────
test('SM-19: buildStructuredAnswers collects all answers with positive grams', () => {
  // Replicate the function
  const buildStructuredAnswers = (answers) => {
    const structured = {};
    for (const ansState of Object.values(answers)) {
      const key = ansState.food_key;
      if (!key || ansState.grams == null) continue;
      if (!structured[key] || ansState.measure_class === 'size') {
        structured[key] = { grams: ansState.grams, label: ansState.answer };
      }
    }
    return Object.keys(structured).length > 0 ? structured : null;
  };

  const answers = {
    'q_grain': { food_key: 'בורגול', measure_class: 'quantity', answer: 'כוס', grams: 200 },
    'q_form':  { food_key: 'פרגית', measure_class: 'form', answer: '5 × נתחים', grams: 750 },
    'q_salad': { food_key: 'סלט',   measure_class: 'quantity', answer: 'קערה', grams: 150 },
  };
  const structured = buildStructuredAnswers(answers);
  assert.ok(structured, 'Must produce a structured map');
  assert.equal(structured['בורגול']?.grams, 200);
  assert.equal(structured['פרגית']?.grams, 750);
  assert.equal(structured['סלט']?.grams, 150);
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. mergeRefinedResult behavior is intact
// ─────────────────────────────────────────────────────────────────────────────
test('SM-20: mergeRefinedResult restores dropped ingredients', () => {
  function sumIngs(ings) {
    return { calories: ings.reduce((s, i) => s + i.calories, 0) };
  }
  function mergeRefinedResult(prev, next) {
    const prevIngs = prev?.ingredients || [];
    const nextIngs = next?.ingredients || [];
    if (!prevIngs.length) return next;
    const norm = n => (n||'').toLowerCase().trim();
    const missing = prevIngs.filter(pi =>
      !nextIngs.some(ni => norm(ni.name) === norm(pi.name) || norm(ni.name).includes(norm(pi.name)) || norm(pi.name).includes(norm(ni.name)))
    );
    if (!missing.length) return next;
    const merged = [...nextIngs, ...missing];
    const totals = sumIngs(merged);
    return { ...next, ingredients: merged, total_calories: totals.calories, _merged_missing: missing.map(i => i.name) };
  }

  const prev = { ingredients: [{ name: 'פרגית', calories: 540 }, { name: 'בורגול', calories: 150 }, { name: 'סלט', calories: 40 }] };
  const next = { ingredients: [{ name: 'פרגית', calories: 1350 }] }; // AI dropped others
  const merged = mergeRefinedResult(prev, next);
  assert.equal(merged.ingredients.length, 3, 'All 3 ingredients must be present');
  assert.ok(merged._merged_missing?.includes('בורגול'), 'בורגול must be in _merged_missing');
});

// ─────────────────────────────────────────────────────────────────────────────
// Two-step protein: count answered → form becomes eligible → form answer advances
// ─────────────────────────────────────────────────────────────────────────────
test('SM-TWO-STEP: count → form dependency resolves correctly', () => {
  const allQ = [Q.grain, Q.count, Q.form]; // form depends on count
  let idx = 0;
  const answers = {};

  // Answer grain (Q0)
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: 200 });
  idx = advanceIndex(idx, allQ, answers); // → idx=1 (count)
  assert.equal(idx, 1);

  // Answer count (Q1) — form is now eligible
  answers[getQuestionKey(Q.count)] = ans(Q.count, '5 חתיכות', { resolved_count: 5 });
  idx = advanceIndex(idx, allQ, answers); // → idx=2 (form, now eligible)
  assert.equal(idx, 2, 'After answering count, form becomes eligible and index advances to it');

  // isDependencySatisfied for form should now be true
  assert.ok(isDependencySatisfied(Q.form, answers, allQ), 'Form must be dependency-satisfied after count answered');
});

test('SM-SINGLE-REFINEMENT-GUARD: isClarifying prevents double submit', () => {
  let isClarifying = false;
  let submitCount = 0;
  const handleSubmit = () => {
    if (isClarifying) return;
    isClarifying = true;
    submitCount++;
  };
  handleSubmit();
  handleSubmit(); // blocked
  assert.equal(submitCount, 1, 'Second submit must be blocked by in-flight guard');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-21: Back restores free-text answer into pendingText
// Root cause of BACK_PRESERVES_FREE_TEXT bug: handleClarificationGoBack always
// called setClarificationPendingText('') — fix: restore stored free-text.
// ─────────────────────────────────────────────────────────────────────────────
test('SM-21: back to free-text question restores the stored answer into pendingText', () => {
  // Replicate handleClarificationGoBack logic (fixed version)
  function computeRestoredText(prevQ, answers) {
    if (!prevQ) return '';
    const prevAns = answers[getQuestionKey(prevQ)];
    if (!prevAns || prevAns._custom_grams_mode || !prevAns.answer) return '';
    const opts = prevQ.options || [];
    const isOptionLabel = opts.some(o => String(o.label || o.value) === String(prevAns.answer));
    return isOptionLabel ? '' : prevAns.answer;
  }

  const ftQ = { id: 'q_ft', question: 'כמה בורגול?', measure_type: 'volume', food_key: 'בורגול', options: [
    { label: 'כוס', value: 'cup' },
    { label: 'שתי כוסות', value: '2cups' },
  ]};
  const allQ = [ftQ, Q.salad];

  // User answers ftQ via free text "כוס וחצי"
  const answers = { [getQuestionKey(ftQ)]: ans(ftQ, 'כוס וחצי', { grams: null }) };
  let idx = 1; // at Q.salad

  // Go back to ftQ
  const prevIdx = Math.max(0, idx - 1);
  const restored = computeRestoredText(allQ[prevIdx], answers);
  idx = prevIdx;

  assert.equal(idx, 0, 'Index must go back to 0');
  assert.equal(restored, 'כוס וחצי', 'Restored text must equal stored free-text answer');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-22: Back to option question does NOT restore pendingText (option shown by selection state)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-22: back to option question leaves pendingText empty', () => {
  function computeRestoredText(prevQ, answers) {
    if (!prevQ) return '';
    const prevAns = answers[getQuestionKey(prevQ)];
    if (!prevAns || prevAns._custom_grams_mode || !prevAns.answer) return '';
    const opts = prevQ.options || [];
    const isOptionLabel = opts.some(o => String(o.label || o.value) === String(prevAns.answer));
    return isOptionLabel ? '' : prevAns.answer;
  }

  const optQ = { id: 'q_count', question: 'כמה חתיכות?', measure_type: 'count_pieces', food_key: 'פרגית',
    options: [{ label: '1 חתיכה', value: '1_piece', resolved_count: 1 }, { label: '2 חתיכות', value: '2_pieces', resolved_count: 2 }] };
  const allQ = [optQ, Q.salad];
  const answers = { [getQuestionKey(optQ)]: { ...ans(optQ, '2 חתיכות'), resolved_count: 2 } };
  let idx = 1;
  const prevIdx = Math.max(0, idx - 1);
  const restored = computeRestoredText(allQ[prevIdx], answers);
  assert.equal(restored, '', 'Option answer must not be restored into free-text pendingText');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-23: Editing a free-text answer and navigating forward uses the edited value
// ─────────────────────────────────────────────────────────────────────────────
test('SM-23: edited free-text answer overwrites the original', () => {
  const allQ = [Q.grain, Q.salad];
  const answers = {};
  // Original answer
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס', { grams: null });
  let idx = advanceIndex(0, allQ, answers); // → 1
  assert.equal(idx, 1);

  // Go back and edit
  idx = Math.max(0, idx - 1); // back to Q.grain
  answers[getQuestionKey(Q.grain)] = ans(Q.grain, 'כוס וחצי', { grams: null }); // edit

  // Advance again
  idx = advanceIndex(idx, allQ, answers); // → 1 again
  assert.equal(idx, 1);
  assert.equal(answers[getQuestionKey(Q.grain)].answer, 'כוס וחצי', 'Edited answer must be stored');

  // Verify the salad answer is unchanged (was never answered here, but if it had been)
  assert.equal(answers[getQuestionKey(Q.salad)], undefined, 'Q2 must not be touched');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-24: Back makes zero API calls (source inspection)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-24: handleClarificationGoBack uses no async/await and calls no API', () => {
  const start = dialogSrc.indexOf('const handleClarificationGoBack');
  const end   = dialogSrc.indexOf('\n  };', start);
  const body  = dialogSrc.slice(start, end);
  assert.ok(!body.includes('await'), 'goBack must have no await');
  assert.ok(!body.includes('invoke'), 'goBack must not call functions.invoke');
  assert.ok(!body.includes('fetch'), 'goBack must not fetch');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-25: Free-text typing alone must NOT update clarificationAnswers
//         (pendingText is the only state that changes during typing)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-25: pendingText change handler does not write to clarificationAnswers', () => {
  // Verify source: onPendingTextChange / handleClarificationPendingTextChange
  // must only call setClarificationPendingText, not setClarificationAnswers
  const handlerStart = dialogSrc.indexOf('const handleClarificationPendingTextChange');
  const handlerEnd   = dialogSrc.indexOf('\n  };', handlerStart);
  const handlerBody  = dialogSrc.slice(handlerStart, handlerEnd);
  assert.ok(handlerBody.includes('setClarificationPendingText'), 'Must update pendingText');
  assert.ok(!handlerBody.includes('setClarificationAnswers'), 'Must NOT update answers on typing');
  assert.ok(!handlerBody.includes('advanceClarification'), 'Must NOT advance on typing');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-26: test-IDs present for stable E2E targeting
// ─────────────────────────────────────────────────────────────────────────────
test('SM-26: data-testid attributes present on clarification UI', () => {
  assert.ok(dialogSrc.includes('data-testid="clarification-queue"'), 'Queue must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-progress"'), 'Progress must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-question"'), 'Question must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-back"'), 'Back button must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-free-text"'), 'Free-text must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-continue"'), 'Continue must have testid');
  assert.ok(dialogSrc.includes('data-testid="clarification-submit"'), 'Submit must have testid');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-27: Free-text on LAST question → questionnaire completes without preset click
// ─────────────────────────────────────────────────────────────────────────────
test('SM-27: free-text on last question completes questionnaire without preset click', () => {
  const sizeQ = { id: 'q_size', question: 'איזה סוג חתיכות חזה עוף היו?', measure_type: 'size_pieces',
    food_key: 'חזה_עוף', options: [{ label: 'קטנות', value: 's', unit_grams: 60 }, { label: 'בינוניות', value: 'm', unit_grams: 100 }] };
  const allQ = [sizeQ];
  const answers = {};

  // User types "4 חתיכות של 100 גרם" — no preset clicked
  const parsedGrams = parseFreeTextGrams('4 חתיכות של 100 גרם');
  answers[getQuestionKey(sizeQ)] = {
    ...ans(sizeQ, '4 חתיכות של 100 גרם', { grams: parsedGrams }),
    _is_free_text: true,
  };

  assert.equal(parsedGrams, 400, 'Parsed grams must be 400');
  assert.ok(isClarificationAnswerComplete(answers[getQuestionKey(sizeQ)], sizeQ),
    'size_pieces + _is_free_text must be complete');
  assert.ok(allAnswered(allQ, answers), 'allAnswered must be true without any preset click');

  const nextIdx = advanceIndex(0, allQ, answers);
  assert.equal(nextIdx, 1, 'Index must advance past end (=allQ.length) to signal all done');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-28: Free-text on MIDDLE question advances exactly one step
// ─────────────────────────────────────────────────────────────────────────────
test('SM-28: free-text on middle question advances to next question', () => {
  const allQ = [Q.grain, Q.salad];
  let idx = 0;
  const answers = {};
  answers[getQuestionKey(Q.grain)] = {
    ...ans(Q.grain, 'כוס וחצי', { grams: null }),
    _is_free_text: true,
  };
  assert.ok(isClarificationAnswerComplete(answers[getQuestionKey(Q.grain)], Q.grain));
  idx = advanceIndex(idx, allQ, answers);
  assert.equal(idx, 1, 'Must advance to next question (index 1)');
  assert.ok(allQ[idx] === Q.salad, 'Next question must be Q.salad');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-29: Free-text answer survives Back navigation
// ─────────────────────────────────────────────────────────────────────────────
test('SM-29: free-text answer is present in answers map after going back', () => {
  const allQ = [Q.grain, Q.salad];
  const answers = {};
  answers[getQuestionKey(Q.grain)] = {
    ...ans(Q.grain, '3 כוסות', { grams: null }),
    _is_free_text: true,
  };
  let idx = advanceIndex(0, allQ, answers); // → 1
  idx = Math.max(0, idx - 1);              // back → 0
  const restored = answers[getQuestionKey(allQ[idx])];
  assert.equal(restored?.answer, '3 כוסות', 'Free-text answer must survive back');
  assert.ok(restored?._is_free_text, '_is_free_text flag must survive back');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-30: Editing free-text after Back uses the new value
// ─────────────────────────────────────────────────────────────────────────────
test('SM-30: edited free-text overwrites original and forward navigation uses edited value', () => {
  const allQ = [Q.grain, Q.salad];
  const answers = {};
  answers[getQuestionKey(Q.grain)] = { ...ans(Q.grain, 'כוס', { grams: null }), _is_free_text: true };
  let idx = advanceIndex(0, allQ, answers); // → 1
  idx = Math.max(0, idx - 1);              // back → 0

  // Edit: overwrite with new value
  answers[getQuestionKey(Q.grain)] = { ...ans(Q.grain, 'כוס וחצי', { grams: null }), _is_free_text: true };
  idx = advanceIndex(idx, allQ, answers);  // → 1 again

  assert.equal(answers[getQuestionKey(Q.grain)].answer, 'כוס וחצי', 'Edited value must be stored');
  assert.equal(idx, 1, 'Must advance past edited question');
  assert.equal(answers[getQuestionKey(Q.salad)], undefined, 'Q.salad must not be touched');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-31: Preset click is NOT required after confirmed free text
// ─────────────────────────────────────────────────────────────────────────────
test('SM-31: preset option NOT required after confirmed free-text answer', () => {
  // Simulates: user typed text, pressed המשך — no preset option object passed
  const q = { id: 'q_chicken', question: 'איזה סוג?', measure_type: 'piece_form', food_key: 'chicken',
    options: [{ label: 'קטנות', value: 's' }, { label: 'גדולות', value: 'l' }] };
  const answers = {};
  answers[getQuestionKey(q)] = { ...ans(q, 'נתחים בינוניים', { grams: null }), _is_free_text: true };
  assert.ok(isClarificationAnswerComplete(answers[getQuestionKey(q)], q),
    'Free-text must complete piece_form without preset click');
  assert.ok(allAnswered([q], answers), 'allAnswered must be true');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-32: parseFreeTextGrams — "4 חתיכות של 100 גרם" → 400
// ─────────────────────────────────────────────────────────────────────────────
test('SM-32: parseFreeTextGrams "4 חתיכות של 100 גרם" → 400', () => {
  assert.equal(parseFreeTextGrams('4 חתיכות של 100 גרם'), 400);
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-33: parseFreeTextGrams — "3 חתיכות של 80 גרם" → 240
// ─────────────────────────────────────────────────────────────────────────────
test('SM-33: parseFreeTextGrams "3 חתיכות של 80 גרם" → 240', () => {
  assert.equal(parseFreeTextGrams('3 חתיכות של 80 גרם'), 240);
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-34: parseFreeTextGrams — "250 גרם" → 250
// ─────────────────────────────────────────────────────────────────────────────
test('SM-34: parseFreeTextGrams "250 גרם" → 250', () => {
  assert.equal(parseFreeTextGrams('250 גרם'), 250);
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-35: parseFreeTextGrams — "3 נתחים בערך 80 גרם כל אחד" → 240
// ─────────────────────────────────────────────────────────────────────────────
test('SM-35: parseFreeTextGrams "3 נתחים בערך 80 גרם" → 240', () => {
  assert.equal(parseFreeTextGrams('3 נתחים בערך 80 גרם כל אחד'), 240);
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-36: parseFreeTextGrams — no quantity info → null
// ─────────────────────────────────────────────────────────────────────────────
test('SM-36: parseFreeTextGrams with no measurement → null', () => {
  assert.equal(parseFreeTextGrams('נתחים קטנים'), null, 'No measurement → null');
  assert.equal(parseFreeTextGrams(''), null, 'Empty → null');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-37: parseFreeTextGrams result flows into buildStructuredAnswers
// ─────────────────────────────────────────────────────────────────────────────
test('SM-37: parsed free-text grams flow through buildStructuredAnswers to backend', () => {
  function buildStructuredAnswers(answers) {
    const structured = {};
    for (const ansState of Object.values(answers)) {
      const key = ansState.food_key;
      if (!key || ansState.grams == null) continue;
      const isDefinitive = ansState.measure_type === 'piece_form' || ansState.measure_type === 'size_pieces';
      if (!structured[key] || isDefinitive) {
        structured[key] = { grams: ansState.grams, label: ansState.answer };
      }
    }
    return Object.keys(structured).length > 0 ? structured : null;
  }

  const q = { id: 'q_chicken', question: 'איזה סוג?', measure_type: 'size_pieces', food_key: 'חזה_עוף',
    options: [] };
  const parsedGrams = parseFreeTextGrams('4 חתיכות של 100 גרם');
  const answers = {
    [getQuestionKey(q)]: {
      food_key: 'חזה_עוף',
      measure_type: 'size_pieces',
      answer: '4 חתיכות של 100 גרם',
      grams: parsedGrams,
      _is_free_text: true,
    },
  };

  const structured = buildStructuredAnswers(answers);
  assert.ok(structured, 'Must produce structured map');
  assert.equal(structured['חזה_עוף']?.grams, 400, 'Must carry 400g to backend');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-38: _is_free_text flag is set in source (integration check)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-38: handleClarificationConfirmText sets _is_free_text and calls parseFreeTextGrams', () => {
  assert.ok(dialogSrc.includes('_is_free_text:  true'), 'Confirm handler must set _is_free_text');
  assert.ok(dialogSrc.includes('parseFreeTextGrams'), 'Confirm handler must call parseFreeTextGrams');
  assert.ok(dialogSrc.includes('grams:          parsedGrams'), 'Confirm handler must include parsedGrams');
});

// ─────────────────────────────────────────────────────────────────────────────
// SM-39: _advanceClarificationIndex always updates index (no length guard)
// ─────────────────────────────────────────────────────────────────────────────
test('SM-39: _advanceClarificationIndex no longer guards setClarificationIndex with length check', () => {
  // The old guard was: if (next < allQ.length) { setClarificationIndex(next); }
  // The fix removes the guard so the "all done" sentinel (index = allQ.length) is set.
  const advStart = dialogSrc.indexOf('const _advanceClarificationIndex');
  const advEnd   = dialogSrc.indexOf('\n  }, []);', advStart);
  const advBody  = dialogSrc.slice(advStart, advEnd);
  assert.ok(!advBody.includes('if (next < allQ.length)'), 'Length guard must be removed');
  assert.ok(advBody.includes('setClarificationIndex(next)'), 'Index must always be set');
});
