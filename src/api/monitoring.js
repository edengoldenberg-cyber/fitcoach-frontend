/**
 * Client-side beta monitoring helper.
 * All calls are fire-and-forget: never await, never throw.
 */

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  'http://localhost:3001';

function getToken() {
  try { return localStorage.getItem('fitcoach_token') || ''; } catch { return ''; }
}

export function reportEvent(event_type, message, metadata = {}) {
  const token = getToken();
  if (!token) return;
  fetch(`${API_BASE}/api/functions/logMonitoringEvent`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body:    JSON.stringify({
      event_type,
      message: String(message || '').slice(0, 400),
      path:    typeof window !== 'undefined' ? window.location.pathname : null,
      metadata,
    }),
  }).catch(() => {}); // intentional fire-and-forget
}

export const monitoring = {
  jsError:          (msg, meta = {}) => reportEvent('js_error',           msg, meta),
  mealSaveFailed:   (msg, meta = {}) => reportEvent('meal_save_failed',   msg, meta),
  waterSaveFailed:  (msg, meta = {}) => reportEvent('water_save_failed',  msg, meta),
  workoutSaveFailed:(msg, meta = {}) => reportEvent('workout_save_failed', msg, meta),
};
