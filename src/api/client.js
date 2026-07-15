/**
 * src/api/client.js
 *
 * Public API surface — re-exports base44 from base44Client.js (standalone version)
 * and provides createHttpClient for AuthContext's public-settings call.
 *
 * No longer imports from @base44/sdk.
 */

import { base44 as _base44 } from './base44Client';

const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BASE44_APP_BASE_URL ||
  'http://localhost:3001';

// ─── Re-export base44 ─────────────────────────────────────────────────────────

export const base44 = _base44;

// ─── createHttpClient ─────────────────────────────────────────────────────────
// Used by AuthContext to call /api/apps/public/prod/public-settings/by-id/:appId
// Returns a minimal client with a .get() method.

export function createHttpClient({ baseURL = '', headers: extraHeaders = {}, token } = {}) {
  const base = baseURL.startsWith('http') ? baseURL : `${API_BASE}${baseURL}`;

  const buildHeaders = () => {
    const h = { 'Content-Type': 'application/json', ...extraHeaders };
    const stored = typeof localStorage !== 'undefined'
      ? localStorage.getItem('fitcoach_token')
      : null;
    const t = token || stored;
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  };

  return {
    get: async (path) => {
      const _t0 = Date.now();
      const _url = `${base}${path}`;
      const _swControlled = !!navigator?.serviceWorker?.controller;
      const _swURL = navigator?.serviceWorker?.controller?.scriptURL || 'none';
      console.log(`[PS_FETCH] FETCH_INIT t=${_t0} url=${_url} sw_controlling=${_swControlled} sw_script=${_swURL}`);

      // PerformanceObserver: proves whether SW intercepts (workerStart > 0 = SW handled it)
      let _perfObs = null;
      if (typeof PerformanceObserver !== 'undefined') {
        try {
          _perfObs = new PerformanceObserver((list) => {
            for (const e of list.getEntries()) {
              if (e.name && (e.name.includes('public-settings') || e.name.includes('by-id'))) {
                console.log(`[PS_FETCH] PERF_ENTRY name=${e.name} workerStart=${e.workerStart} fetchStart=${e.fetchStart} responseStart=${e.responseStart} responseEnd=${e.responseEnd} duration=${e.duration}`);
              }
            }
          });
          _perfObs.observe({ entryTypes: ['resource'] });
          console.log(`[PS_FETCH] PERF_OBSERVER_REGISTERED`);
        } catch (pe) {
          console.log(`[PS_FETCH] PERF_OBSERVER_ERR ${pe.message}`);
        }
      } else {
        console.log(`[PS_FETCH] PERF_OBSERVER_UNAVAILABLE`);
      }

      const controller = new AbortController();
      console.log(`[PS_FETCH] ABORT_CTRL_CREATED signal.aborted=${controller.signal.aborted}`);

      // Prove the abort signal event fires independently of fetch settling
      controller.signal.addEventListener('abort', () => {
        console.log(`[PS_FETCH] SIGNAL_ABORT_EVENT fired t=${Date.now()} dt=${Date.now() - _t0}ms signal.aborted=${controller.signal.aborted}`);
      });

      const timeoutId = setTimeout(() => {
        console.log(`[PS_FETCH] ABORT_SETTIMEOUT_CB t=${Date.now()} dt=${Date.now() - _t0}ms — calling controller.abort()`);
        controller.abort();
        console.log(`[PS_FETCH] ABORT_CALLED signal.aborted=${controller.signal.aborted}`);
      }, 9000);
      console.log(`[PS_FETCH] ABORT_SETTIMEOUT_REGISTERED timeoutId=${timeoutId}`);

      try {
        console.log(`[PS_FETCH] BEFORE_AWAIT_FETCH t=${Date.now()}`);
        const res = await fetch(_url, {
          method: 'GET',
          headers: buildHeaders(),
          credentials: 'include',
          // signal intentionally omitted — AbortController signal on a SW-intercepted
          // cross-origin fetch causes an indefinite hang on iOS Safari.
        });
        console.log(`[PS_FETCH] FETCH_RETURNED status=${res.status} ok=${res.ok} t=${Date.now()} dt=${Date.now() - _t0}ms`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          const err = Object.assign(new Error(data.error || res.statusText), {
            status: res.status,
            data,
          });
          throw err;
        }
        const json = await res.json();
        console.log(`[PS_FETCH] JSON_PARSED t=${Date.now()}`);
        return json;
      } catch (e) {
        console.log(`[PS_FETCH] CATCH e.name=${e.name} e.message=${e.message} aborted=${controller.signal.aborted} t=${Date.now()} dt=${Date.now() - _t0}ms`);
        throw e;
      } finally {
        console.log(`[PS_FETCH] FINALLY t=${Date.now()} dt=${Date.now() - _t0}ms`);
        clearTimeout(timeoutId);
        if (_perfObs) { try { _perfObs.disconnect(); } catch {} }
      }
    },

    post: async (path, body) => {
      const res = await fetch(`${base}${path}`, {
        method: 'POST',
        headers: buildHeaders(),
        credentials: 'include',
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const err = Object.assign(new Error(data.error || res.statusText), {
          status: res.status,
          data,
        });
        throw err;
      }
      return res.json();
    },
  };
}
