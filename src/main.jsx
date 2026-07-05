import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { reportEvent } from '@/api/monitoring.js'

// ─── Global error capture ─────────────────────────────────────────────────────

window.onerror = (message, source, lineno, colno, error) => {
  // Skip browser extension noise and ResizeObserver spam
  if (!message || /ResizeObserver|chrome-extension/.test(String(message))) return;
  reportEvent('js_error', String(message), {
    source, lineno, colno,
    stack: error?.stack?.slice(0, 300),
  });
};

window.addEventListener('unhandledrejection', (evt) => {
  const reason = evt.reason;
  const msg = reason?.message || String(reason) || 'Unhandled promise rejection';
  if (/ResizeObserver|chrome-extension/.test(msg)) return;
  reportEvent('js_error', msg, { stack: reason?.stack?.slice(0, 300) });
});

// ─── Service Worker auto-reload on activation ─────────────────────────────────
// When a new SW takes over (after skipWaiting + clientsClaim), reload the page
// so the new JS bundle runs immediately. Without this, the old bundle keeps
// executing even after the new SW is active.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[SW] Controller changed — reloading for new version');
    window.location.reload();
  });
}

// ─── React root ───────────────────────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
