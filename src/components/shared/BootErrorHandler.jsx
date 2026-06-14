// Boot Error Handler Component - inject early in the app lifecycle
import { useEffect } from 'react';

export function initBootErrorHandler() {
  if (typeof window === 'undefined') return;
  
  // Unregister any existing service workers to prevent errors
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function(registrations) {
      for (let registration of registrations) {
        registration.unregister();
      }
    });
  }
  
  window.__bootErrors = window.__bootErrors || [];
  window.__bootStartTime = window.__bootStartTime || Date.now();
  window.__hasRendered = false;

  // Capture all errors during boot
  window.addEventListener('error', function(e) {
    console.error('[BOOT ERROR]', e.message, e.error);
    window.__bootErrors.push({
      type: 'error',
      message: e.message,
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack,
      timestamp: Date.now()
    });
  });

  window.addEventListener('unhandledrejection', function(e) {
    console.error('[BOOT PROMISE REJECTION]', e.reason);
    window.__bootErrors.push({
      type: 'promise',
      message: String(e.reason),
      stack: e.reason?.stack,
      timestamp: Date.now()
    });
  });

  // Check if React rendered successfully after 2500ms
  setTimeout(function() {
    if (!window.__hasRendered && (window.__bootErrors.length > 0 || !document.getElementById('root')?.hasChildNodes())) {
      showBootCrashScreen();
    }
  }, 2500);

  function showBootCrashScreen() {
    const errors = window.__bootErrors;
    const primaryError = errors[0] || { message: 'Unknown boot error', stack: '' };
    const stackFirstLine = primaryError.stack?.split('\n')?.[1] || '';

    const crashHtml = `
      <div id="boot-crash-overlay" style="
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        direction: rtl;
      ">
        <div style="
          background: white;
          padding: 32px;
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.3);
          max-width: 500px;
          width: 90%;
        ">
          <div style="
            width: 64px;
            height: 64px;
            background: #ef4444;
            border-radius: 50%;
            margin: 0 auto 24px;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 32px;
          ">⚠️</div>
          
          <h1 style="
            font-size: 24px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 16px;
            color: #1f2937;
          ">קריסה באפליקציה</h1>
          
          <div style="
            background: #fef2f2;
            border: 1px solid #fecaca;
            border-radius: 8px;
            padding: 16px;
            margin-bottom: 16px;
          ">
            <p style="
              font-size: 14px;
              color: #991b1b;
              margin: 0 0 8px 0;
              font-weight: 600;
            ">שגיאה:</p>
            <p style="
              font-size: 13px;
              color: #7f1d1d;
              margin: 0;
              word-break: break-word;
            ">${escapeHtml(primaryError.message)}</p>
            ${stackFirstLine ? `
              <p style="
                font-size: 11px;
                color: #991b1b;
                margin: 8px 0 0 0;
                font-family: monospace;
                opacity: 0.8;
              ">${escapeHtml(stackFirstLine)}</p>
            ` : ''}
          </div>

          <div style="
            background: #f3f4f6;
            border-radius: 8px;
            padding: 12px;
            margin-bottom: 16px;
          ">
            <p style="
              font-size: 12px;
              color: #6b7280;
              margin: 0;
            ">🔍 זמן קריסה: ${new Date().toLocaleString('he-IL')}</p>
            <p style="
              font-size: 12px;
              color: #6b7280;
              margin: 4px 0 0 0;
            ">📍 נתיב: ${window.location.pathname}</p>
          </div>

          <div style="display: flex; gap: 8px; flex-direction: column;">
            <button onclick="copyBootError()" style="
              background: #3b82f6;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              width: 100%;
            ">📋 העתק דוח שגיאה</button>
            
            <button onclick="window.location.reload()" style="
              background: #10b981;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              width: 100%;
            ">🔄 נסה שוב</button>
            
            <button onclick="window.location.href='/'" style="
              background: #6b7280;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              width: 100%;
            ">🏠 חזור לדף הבית</button>
          </div>
        </div>
      </div>
    `;

    document.body.innerHTML = crashHtml;

    // Send crash report to server (optional - implement if you have this endpoint)
    try {
      console.log('[BOOT CRASH] Errors:', errors);
    } catch (e) {
      console.error('Failed to log crash:', e);
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  window.copyBootError = function() {
    const errors = window.__bootErrors;
    const report = `
FIT COACH PRO - דוח קריסה
=================================
זמן: ${new Date().toISOString()}
נתיב: ${window.location.pathname}
User Agent: ${navigator.userAgent}

שגיאות (${errors.length}):
${errors.map(function(e, i) {
  return `
[${i + 1}] ${e.type.toUpperCase()}
הודעה: ${e.message}
${e.stack ? 'Stack:\n' + e.stack : ''}
`;
}).join('\n---\n')}
=================================
    `.trim();

    try {
      navigator.clipboard.writeText(report);
      alert('✅ דוח השגיאה הועתק ללוח');
    } catch (e) {
      prompt('העתק דוח זה:', report);
    }
  };

  console.log('[BOOT ERROR HANDLER] Initialized');
}

// Mark as rendered once React successfully mounts
export default function BootErrorHandler() {
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__hasRendered = true;
      console.log('[BOOT] React rendered successfully');
    }
  }, []);

  return null;
}