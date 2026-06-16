/**
 * Coach ratings are stored in WorkoutSession.notes as "[N/5] feedback text"
 * because coach_rating/coach_feedback do not exist in the schema.
 *
 * These helpers encode/decode that format consistently across all pages.
 */

export function parseCoachRating(notes) {
  if (!notes) return { rating: 0, feedback: '' };
  const m = notes.match(/^\[(\d)\/5\]\s*([\s\S]*)/);
  if (m) return { rating: parseInt(m[1], 10), feedback: m[2].trim() };
  return { rating: 0, feedback: '' };
}

export function encodeCoachRating(rating, feedback) {
  if (!rating || rating < 1) return null;
  return feedback ? `[${rating}/5] ${feedback}` : `[${rating}/5]`;
}

/** True when notes holds a coach rating rather than trainee text. */
export function isCoachRatingNote(notes) {
  return !!notes && /^\[\d\/5\]/.test(notes);
}
