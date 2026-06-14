/**
 * FitCoach Pro - Diagnostics Logger
 * Global structured logging system with localStorage persistence
 */

const MAX_LOGS = 500;
const STORAGE_KEY = 'fitcoach_diagnostic_logs';

// In-memory log buffer
let logBuffer = [];

// Initialize from localStorage on load
const initLogs = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      logBuffer = Array.isArray(parsed) ? parsed.slice(-MAX_LOGS) : [];
    }
  } catch (err) {
    console.warn('[Logger] Failed to load from localStorage:', err);
    logBuffer = [];
  }
};

// Persist to localStorage (debounced via ring buffer)
const persistLogs = () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logBuffer.slice(-MAX_LOGS)));
  } catch (err) {
    console.warn('[Logger] Failed to persist logs:', err);
  }
};

// Get current route
const getCurrentRoute = () => {
  if (typeof window === 'undefined') return 'unknown';
  return window.location.pathname || 'unknown';
};

// Get user context
const getUserContext = () => {
  const ctx = {};
  try {
    // Try to get from session/cache if available
    const userEmail = sessionStorage.getItem('fitcoach_user_email');
    const traineeEmail = sessionStorage.getItem('fitcoach_trainee_email');
    const isCoach = sessionStorage.getItem('fitcoach_is_coach');
    
    if (userEmail) ctx.userEmail = userEmail;
    if (traineeEmail) ctx.traineeEmail = traineeEmail;
    if (isCoach) ctx.userType = isCoach === 'true' ? 'coach' : 'trainee';
  } catch (err) {
    // Silent fail
  }
  return ctx;
};

/**
 * Log a diagnostic event
 * @param {string} action - Action name (e.g., "MEAL_SUGGEST_START")
 * @param {object} payload - Event data
 * @param {string} level - Log level: "info" | "warn" | "error"
 */
export const logEvent = (action, payload = {}, level = 'info') => {
  const entry = {
    ts: new Date().toISOString(),
    level,
    action,
    payload,
    route: getCurrentRoute(),
    ...getUserContext()
  };
  
  logBuffer.push(entry);
  
  // Keep ring buffer size
  if (logBuffer.length > MAX_LOGS) {
    logBuffer = logBuffer.slice(-MAX_LOGS);
  }
  
  // Persist to localStorage
  persistLogs();
  
  // Console output for dev
  const emoji = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '📋';
  console.log(`${emoji} [Diagnostics] ${action}`, payload);
  
  return entry;
};

/**
 * Log an error
 * @param {string} action - Action name
 * @param {Error|string} error - Error object or message
 * @param {object} payload - Additional context
 */
export const logError = (action, error, payload = {}) => {
  const errorPayload = {
    ...payload,
    error: error?.message || String(error),
    stack: error?.stack || undefined
  };
  return logEvent(action, errorPayload, 'error');
};

/**
 * Get logs with optional filtering
 * @param {object} options - { limit, level, action, since }
 * @returns {array} Log entries
 */
export const getLogs = (options = {}) => {
  let logs = [...logBuffer];
  
  if (options.level) {
    logs = logs.filter(log => log.level === options.level);
  }
  
  if (options.action) {
    logs = logs.filter(log => log.action.includes(options.action));
  }
  
  if (options.since) {
    logs = logs.filter(log => new Date(log.ts) >= new Date(options.since));
  }
  
  if (options.limit) {
    logs = logs.slice(-options.limit);
  }
  
  return logs;
};

/**
 * Clear all logs
 */
export const clearLogs = () => {
  logBuffer = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('[Logger] Failed to clear localStorage:', err);
  }
  console.log('🧹 [Diagnostics] Logs cleared');
};

/**
 * Export logs as text
 */
export const exportLogsAsText = (limit = 50) => {
  const logs = getLogs({ limit });
  let text = `FitCoach Pro - Diagnostic Report\n`;
  text += `Generated: ${new Date().toISOString()}\n`;
  text += `Total logs: ${logBuffer.length}\n`;
  text += `=`.repeat(60) + '\n\n';
  
  logs.forEach((log, idx) => {
    text += `[${idx + 1}] ${log.ts} | ${log.level.toUpperCase()} | ${log.action}\n`;
    text += `Route: ${log.route}\n`;
    if (log.userEmail) text += `User: ${log.userEmail}\n`;
    if (log.traineeEmail) text += `Trainee: ${log.traineeEmail}\n`;
    text += `Payload: ${JSON.stringify(log.payload, null, 2)}\n`;
    text += `-`.repeat(60) + '\n';
  });
  
  return text;
};

/**
 * Add a log entry (alias for logEvent)
 */
export const addLog = (action, payload = {}, level = 'info') => {
  return logEvent(action, payload, level);
};

// Initialize on module load
if (typeof window !== 'undefined') {
  initLogs();
}