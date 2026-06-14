/**
 * Parser חכם לשדה חזרות - מטפל בפורמטים שונים
 * @param {string|number} repsInput - הקלט: "8-12", "10", 10, "AMRAP", "עד כשל" וכו
 * @returns {{min: number|null, max: number|null, text: string|null}} - אובייקט מנורמל
 */
export function parseReps(repsInput) {
  // If already a clean number
  if (typeof repsInput === 'number' && !isNaN(repsInput)) {
    return { min: repsInput, max: repsInput, text: null };
  }

  // Convert to string for parsing
  const input = String(repsInput || '').trim();
  
  // Empty input
  if (!input) {
    return { min: null, max: null, text: null };
  }

  // Try to parse as single number
  const singleNum = parseFloat(input);
  if (!isNaN(singleNum) && /^\d+(\.\d+)?$/.test(input)) {
    return { min: singleNum, max: singleNum, text: null };
  }

  // Try to parse range: "8-12", "10 - 15", "8–12" (with dash or en-dash)
  const rangeMatch = input.match(/^(\d+)\s*[-–]\s*(\d+)$/);
  if (rangeMatch) {
    const min = parseInt(rangeMatch[1]);
    const max = parseInt(rangeMatch[2]);
    return { min, max, text: null };
  }

  // Non-numeric text (AMRAP, עד כשל, max reps, וכו)
  // Store as text, no numeric values
  return { min: null, max: null, text: input };
}

/**
 * Format reps for display in UI
 */
export function formatRepsDisplay(min, max, text) {
  if (text) return text;
  if (min && max && min !== max) return `${min}-${max}`;
  if (min) return String(min);
  return '';
}

/**
 * Validate that reps can be sent to backend
 * Returns { valid: boolean, error: string }
 */
export function validateReps(repsInput) {
  const parsed = parseReps(repsInput);
  
  // Allow numeric or text
  if ((parsed.min !== null && parsed.max !== null) || parsed.text !== null) {
    return { valid: true, error: null };
  }
  
  // Empty is technically valid (will use defaults)
  if (!repsInput || String(repsInput).trim() === '') {
    return { valid: true, error: null };
  }
  
  return { valid: false, error: 'פורמט לא תקין' };
}