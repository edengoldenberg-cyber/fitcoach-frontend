// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// UNIVERSAL EVENT LOGGER - No filtering, all events captured
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class UniversalEventLogger {
  constructor() {
    this.events = [];
    this.maxEvents = 200;
    this.startTime = Date.now();
  }

  log(eventType, payload = {}) {
    const now = Date.now();
    const elapsed = now - this.startTime;

    const event = {
      id: this.events.length,
      timestamp: now,
      elapsed,
      eventType,
      payload
    };

    this.events.push(event);

    // Keep only last 200 events
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }

    // Update window reference for diagnostics panel
    window.__universalEventLog = {
      events: this.events,
      lastEventType: eventType,
      lastEventTs: now,
      totalEventsLogged: this.events.length,
      elapsedSinceStart: elapsed
    };

    // Console output
    const colors = {
      'UI_': '#FF6B9D',
      'MEAL_': '#00AA00',
      'WATCHDOG_': '#FFA500',
      'ERROR': '#FF0000'
    };

    let color = '#666666';
    for (const [prefix, c] of Object.entries(colors)) {
      if (eventType.startsWith(prefix)) {
        color = c;
        break;
      }
    }

    console.log(
      `%c[${eventType}:${elapsed}ms]`,
      `color: ${color}; font-weight: bold;`,
      payload
    );
  }

  getAllEvents() {
    return this.events;
  }

  getLastN(n = 50) {
    return this.events.slice(Math.max(0, this.events.length - n));
  }

  getReport() {
    const lastEvent = this.events[this.events.length - 1];
    return {
      totalEvents: this.events.length,
      elapsedMs: Date.now() - this.startTime,
      lastEventType: lastEvent?.eventType || 'NONE',
      lastEventTs: lastEvent?.timestamp || null,
      events: this.events.slice(-200),
      timestamp: new Date().toISOString()
    };
  }

  clear() {
    this.events = [];
    this.startTime = Date.now();
    delete window.__universalEventLog;
  }
}

// Global singleton
let loggerInstance = null;

export function getEventLogger() {
  if (!loggerInstance) {
    loggerInstance = new UniversalEventLogger();
    window.__eventLogger = loggerInstance;
  }
  return loggerInstance;
}

export function logEvent(eventType, payload = {}) {
  getEventLogger().log(eventType, payload);
}

export function getAllEvents() {
  return getEventLogger().getAllEvents();
}

export function getEventReport() {
  return getEventLogger().getReport();
}

export function clearEventLog() {
  if (loggerInstance) {
    loggerInstance.clear();
  }
}