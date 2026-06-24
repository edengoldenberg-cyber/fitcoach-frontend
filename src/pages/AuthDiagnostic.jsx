import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

function decodeJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const pad = s => s + '='.repeat((4 - s.length % 4) % 4);
    return JSON.parse(atob(pad(parts[1].replace(/-/g, '+').replace(/_/g, '/'))));
  } catch { return null; }
}

function Row({ label, value, ok }) {
  const color = ok === true ? '#4ade80' : ok === false ? '#f87171' : '#fbbf24';
  return (
    <div style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #1e293b', fontFamily: 'monospace', fontSize: 13 }}>
      <span style={{ color: '#94a3b8', minWidth: 200 }}>{label}</span>
      <span style={{ color, wordBreak: 'break-all' }}>{String(value ?? '—')}</span>
    </div>
  );
}

export default function AuthDiagnostic() {
  const [data, setData] = useState(null);
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const now = Math.floor(Date.now() / 1000);

    const token     = localStorage.getItem('fitcoach_token') || null;
    const sessToken = sessionStorage.getItem('temp_access_session') || null;
    const pending   = localStorage.getItem('pending_access_token') || null;

    let payload = null, iat = null, exp = null, expired = null, remaining = null;
    if (token) {
      payload   = decodeJwt(token);
      iat       = payload?.iat ?? null;
      exp       = payload?.exp ?? null;
      expired   = exp ? now > exp : null;
      remaining = exp ? exp - now : null;
    }

    // Call /api/auth/me
    let meStatus = null, meOk = null, meBody = null, authHeaderSent = false;
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (token) { headers['Authorization'] = `Bearer ${token}`; authHeaderSent = true; }
      const res  = await fetch(`${API}/api/auth/me`, { method: 'GET', headers, credentials: 'include' });
      meStatus   = res.status;
      meOk       = res.ok;
      meBody     = await res.json().catch(() => ({}));
    } catch (e) {
      meStatus   = 'NETWORK_ERROR';
      meBody     = { error: e.message };
    }

    // Call /api/auth/refresh
    let refreshStatus = null, refreshOk = null, refreshBody = null;
    try {
      const res    = await fetch(`${API}/api/auth/refresh`, { method: 'POST', credentials: 'include' });
      refreshStatus = res.status;
      refreshOk     = res.ok;
      refreshBody   = await res.json().catch(() => ({}));
    } catch (e) {
      refreshStatus = 'NETWORK_ERROR';
      refreshBody   = { error: e.message };
    }

    setData({
      now,
      token_present:     !!token,
      token_prefix:      token ? token.substring(0, 30) + '...' : null,
      sub:               payload?.sub ?? null,
      email:             payload?.email ?? null,
      role:              payload?.role ?? null,
      iat,
      exp,
      issued_at:         iat ? new Date(iat * 1000).toISOString() : null,
      expires_at:        exp ? new Date(exp * 1000).toISOString() : null,
      expired,
      remaining_seconds: remaining,
      session_token:     sessToken ? 'present' : 'absent',
      pending_token:     pending   ? 'present' : 'absent',
      auth_header_sent:  authHeaderSent,
      me_status:         meStatus,
      me_ok:             meOk,
      me_email:          meBody?.email ?? null,
      me_role:           meBody?.role  ?? null,
      me_error:          meBody?.error ?? null,
      refresh_status:    refreshStatus,
      refresh_ok:        refreshOk,
      refresh_new_token: refreshBody?.access_token ? 'issued' : (refreshBody?.error || 'none'),
    });
    setRunning(false);
  }

  useEffect(() => { run(); }, []);

  const bg = { background: '#0f172a', minHeight: '100vh', padding: 24, color: 'white' };

  return (
    <div style={bg} dir="ltr">
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, fontFamily: 'monospace' }}>
        🔐 Auth Diagnostic
      </h1>
      <p style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace', marginBottom: 20 }}>
        {API} · {new Date().toISOString()}
      </p>

      <button
        onClick={run}
        disabled={running}
        style={{ background: '#3b82f6', color: 'white', border: 'none', padding: '8px 18px',
                 borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', marginBottom: 24 }}
      >
        {running ? 'Running...' : '↺ Re-run'}
      </button>

      {data && (
        <>
          <section style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>LOCALSTORAGE</h2>
            <Row label="fitcoach_token present"   value={data.token_present ? 'YES' : 'NO'}    ok={data.token_present} />
            <Row label="token (first 30 chars)"   value={data.token_prefix} />
            <Row label="sub"                       value={data.sub} />
            <Row label="email"                     value={data.email} />
            <Row label="role"                      value={data.role} />
            <Row label="temp_access_session"       value={data.session_token} ok={data.session_token === 'absent'} />
            <Row label="pending_access_token"      value={data.pending_token}  ok={data.pending_token  === 'absent'} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>TOKEN EXPIRY</h2>
            <Row label="issued at"      value={data.issued_at} />
            <Row label="expires at"     value={data.expires_at} />
            <Row label="expired?"       value={data.expired === null ? 'N/A' : data.expired ? 'YES — TOKEN DEAD' : 'NO — still valid'} ok={data.expired === false} />
            <Row label="remaining"      value={data.remaining_seconds === null ? 'N/A' : `${data.remaining_seconds}s (${(data.remaining_seconds / 60).toFixed(1)} min)`}
                                        ok={data.remaining_seconds > 0} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>GET /api/auth/me</h2>
            <Row label="Authorization header sent" value={data.auth_header_sent ? 'YES' : 'NO'} ok={data.auth_header_sent} />
            <Row label="HTTP status"               value={data.me_status}   ok={data.me_ok} />
            <Row label="email from /me"            value={data.me_email}    ok={!!data.me_email} />
            <Row label="role from /me"             value={data.me_role}     ok={!!data.me_role} />
            <Row label="error from /me"            value={data.me_error}    ok={!data.me_error} />
          </section>

          <section style={{ marginBottom: 24 }}>
            <h2 style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>POST /api/auth/refresh</h2>
            <Row label="HTTP status"    value={data.refresh_status} ok={data.refresh_ok} />
            <Row label="new token"      value={data.refresh_new_token} ok={data.refresh_new_token === 'issued'} />
          </section>

          <section>
            <h2 style={{ color: '#94a3b8', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>OVERALL STATUS</h2>
            {(() => {
              const healthy = data.token_present && !data.expired && data.me_ok;
              return (
                <div style={{ padding: '12px 16px', borderRadius: 8, background: healthy ? '#14532d' : '#7f1d1d',
                              fontFamily: 'monospace', fontSize: 14, fontWeight: 700 }}>
                  {healthy ? '✅ SESSION HEALTHY' : '❌ SESSION BROKEN — check fields above'}
                </div>
              );
            })()}
          </section>
        </>
      )}
    </div>
  );
}
