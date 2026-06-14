// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MEAL SUGGEST DEBUGGER - Comprehensive Instrumentation
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

class MealSuggestDiagnostics {
  constructor(runId) {
    this.runId = runId || generateRunId();
    this.startTime = Date.now();
    this.events = [];
    this.checkpoints = [];
    this.currentAttempt = 0;
    this.bestScore = 0;
    this.foundCount = 0;
    this.lastProgressTime = Date.now();
  }

  log(eventName, payload = {}) {
    const now = Date.now();
    const elapsed = now - this.startTime;
    
    const event = {
      timestamp: now,
      elapsed,
      runId: this.runId,
      event: eventName,
      payload: payload
    };

    this.events.push(event);

    // Log to console with color
    const colors = {
      'UI_CLICK_SUGGEST': '#FFA500',
      'ENGINE_START': '#00AA00',
      'BUILD_PROGRESS': '#0088FF',
      'BUILD_TIMEOUT': '#FF0000',
      'BUILD_SUCCESS': '#00DD00',
      'BUILD_FALLBACK_USED': '#FF8800',
      'ERROR': '#FF0000'
    };

    const color = colors[eventName] || '#666666';
    console.log(
      `%c[${eventName}:${elapsed}ms]`,
      `color: ${color}; font-weight: bold;`,
      payload
    );

    // Save to window for debugging
    window.__mealSuggestLastReport = this.getReport();
  }

  checkpoint(name, data = {}) {
    this.checkpoints.push({
      name,
      elapsed: Date.now() - this.startTime,
      ...data
    });
  }

  updateProgress(attempt, elapsedMs, bestScore, foundCount) {
    this.currentAttempt = attempt;
    this.bestScore = bestScore;
    this.foundCount = foundCount;

    // Log only every 500ms to avoid spam
    const now = Date.now();
    if (now - this.lastProgressTime >= 500) {
      this.log('BUILD_PROGRESS', {
        attempt,
        elapsedMs,
        bestScore: bestScore.toFixed(2),
        foundCount,
        timeRemaining: Math.max(0, 4000 - elapsedMs)
      });
      this.lastProgressTime = now;
    }
  }

  getReport() {
    const lastEvent = this.events[this.events.length - 1];
    const eventType = lastEvent?.event || 'UNKNOWN';
    
    // STRUCTURED: Map event type to exit reason (NO .includes matching)
    let exitReason = 'UNKNOWN';
    if (eventType === 'BUILD_SUCCESS') {
      exitReason = 'SUCCESS';
    } else if (eventType === 'BUILD_TIMEOUT') {
      exitReason = 'TIMEOUT';
    } else if (eventType === 'ERROR') {
      exitReason = 'ERROR';
    } else if (eventType === 'BUILD_FALLBACK_USED') {
      exitReason = 'FALLBACK';
    }
    
    return {
      runId: this.runId,
      elapsedMs: Date.now() - this.startTime,
      eventCount: this.events.length,
      checkpointCount: this.checkpoints.length,
      attempts: this.currentAttempt,
      lastKnownStep: eventType,
      exitReason,
      bestScore: this.bestScore,
      combinationsFound: this.foundCount,
      sourceCounts: {
        traineeFavorites: 0,
        coachRecommended: 0,
        globalFallback: 0
      },
      events: this.events.slice(-20),
      checkpoints: this.checkpoints,
      timestamp: new Date().toISOString()
    };
  }

  print() {
    console.log('═══════════════════════════════════════');
    console.log('MEAL SUGGEST DIAGNOSTIC REPORT');
    console.log('═══════════════════════════════════════');
    console.log(`Run ID: ${this.runId}`);
    console.log(`Total Duration: ${Date.now() - this.startTime}ms`);
    console.log(`Events: ${this.events.length}`);
    console.log(`Last Attempt: ${this.currentAttempt}`);
    console.log(`Best Score: ${this.bestScore.toFixed(2)}`);
    console.log(`Results Found: ${this.foundCount}`);
    console.log('───────────────────────────────────────');
    console.table(this.checkpoints);
    console.log('═══════════════════════════════════════');
  }
}

function generateRunId() {
  return `MSR-${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 5)}`.toUpperCase();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// WATCHDOG - Promise.race with timeout, returns structured result
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export async function suggestMealWithWatchdog(
  engineFn,        // async function that does the actual work
  params = {},
  timeoutMs = 4000
) {
  const diag = new MealSuggestDiagnostics();
  
  diag.log('UI_HANDLER_START', {
    params: {
      mealType: params.mealType,
      targetCalories: params.targetCalories,
      focus: params.focus
    }
  });

  // Create the actual work promise
  const enginePromise = (async () => {
    try {
      // THIS IS THE FIRST LOG INSIDE THE ENGINE
      diag.log('MEAL_SUGGEST_START', {
        mode: 'generateMealSuggestions',
        params,
        timestamp: Date.now()
      });

      const result = await engineFn(diag);

      diag.log('BUILD_SUCCESS', {
        resultCount: result.suggestions?.length || 0,
        foundCount: diag.foundCount,
        bestScore: diag.bestScore
      });

      return {
        success: true,
        suggestions: result.suggestions || [],
        error: null,
        exitReason: 'SUCCESS',
        diagnostics: diag.getReport()
      };
    } catch (err) {
      diag.log('ERROR', {
        message: err.message,
        stack: err.stack?.split('\n')[0]
      });

      return {
        success: false,
        suggestions: [],
        error: err.message,
        exitReason: 'ERROR',
        diagnostics: diag.getReport()
      };
    }
  })();

  // Create timeout promise
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      diag.log('BUILD_TIMEOUT', {
        elapsedMs: Date.now() - diag.startTime,
        lastAttempt: diag.currentAttempt,
        lastBestScore: diag.bestScore,
        lastFoundCount: diag.foundCount
      });

      resolve({
        success: false,
        suggestions: generateEmergencyMeals(params),
        error: 'זמן מחכה הסתיים - חוזרים עם חלופות בסיסיות',
        exitReason: 'TIMEOUT',
        diagnostics: diag.getReport()
      });
    }, timeoutMs);
  });

  // Race the two promises - RETURNS STRUCTURED OBJECT
  const result = await Promise.race([enginePromise, timeoutPromise]);

  // Validate result structure (CRITICAL!)
  if (!result || typeof result !== 'object') {
    console.error('ERROR: watchdog returned invalid result type:', typeof result);
    return {
      success: false,
      suggestions: [],
      error: 'Invalid watchdog result structure',
      exitReason: 'ERROR',
      diagnostics: diag.getReport()
    };
  }

  // Final log
  diag.log('MEAL_SUGGEST_FINAL', {
    runId: diag.runId,
    exitReason: result.exitReason,
    elapsedMs: Date.now() - diag.startTime,
    attempts: diag.currentAttempt,
    resultCount: result.suggestions?.length || 0
  });

  // Print full report
  diag.print();

  // Return structured result - guaranteed to have exitReason
  return result;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EMERGENCY FALLBACK - Basic meals if engine times out
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function generateEmergencyMeals(params = {}) {
  const mealType = params.mealType || 'בוקר';
  const targetCalories = params.targetCalories || 400;

  const emergencyOptions = {
    'בוקר': [
      {
        name: 'תוצר חלב עם גרנולה',
        calories: 350,
        fallback: true
      },
      {
        name: 'ביצה מטוגנת עם לחם',
        calories: 380,
        fallback: true
      },
      {
        name: 'שייק חלב עם בננה',
        calories: 400,
        fallback: true
      }
    ],
    'צהריים': [
      {
        name: 'עוף עם אורז',
        calories: 500,
        fallback: true
      },
      {
        name: 'דג עם ירקות',
        calories: 450,
        fallback: true
      },
      {
        name: 'בשר חזיר עם תפוח אדמה',
        calories: 480,
        fallback: true
      }
    ],
    'ערב': [
      {
        name: 'חזה עוף עם ירקות',
        calories: 350,
        fallback: true
      },
      {
        name: 'דג מבושל עם סלט',
        calories: 380,
        fallback: true
      }
    ],
    'ביניים': [
      {
        name: 'אגוז וכיסלה',
        calories: 150,
        fallback: true
      },
      {
        name: 'יוגורט עם דבש',
        calories: 180,
        fallback: true
      },
      {
        name: 'תפוח עם חמאת בוטנים',
        calories: 200,
        fallback: true
      }
    ]
  };

  const options = emergencyOptions[mealType] || emergencyOptions['ביניים'];
  return options.slice(0, 3);
}

export { MealSuggestDiagnostics, generateRunId };