import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { normalizeFoodName } from '@/components/trainee/nutritionLearning';

const BEEF_TERMS = ['בקר', 'בשר בקר', 'בקר טחון'];

function matchesBeef(record) {
  const name = (record.food_name || '').toLowerCase();
  const norm = (record.normalized_name || '').toLowerCase();
  return BEEF_TERMS.some(t => name.includes(t) || norm.includes(t));
}

export default function DebugFoods() {
  const [showAll, setShowAll] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const { data: trainee } = useQuery({
    queryKey: ['debugFoodsTrainee', user?.id, user?.email],
    queryFn: async () => {
      if (user?.id) {
        const byId = await base44.entities.Trainee.filter({ user_id: user.id });
        if (byId?.[0]) return byId[0];
      }
      if (user?.email) {
        const byEmail = await base44.entities.Trainee.filter({ user_email: user.email });
        return byEmail?.[0] || null;
      }
      return null;
    },
    enabled: !!(user?.id || user?.email),
  });

  const { data: allFoods = [], isFetching, refetch } = useQuery({
    queryKey: ['debugFoodsAll', trainee?.id],
    queryFn: () => base44.entities.UserFoodItem.filter({ trainee_id: trainee.id }),
    enabled: !!trainee?.id,
  });

  const beefRecords = allFoods.filter(matchesBeef);
  const displayRecords = showAll ? allFoods : beefRecords;

  const cols = [
    { key: 'id',               label: 'ID' },
    { key: 'food_name',        label: 'food_name' },
    { key: 'normalized_name',  label: 'normalized_name' },
    { key: 'calories_per_100g',label: 'kcal/100g' },
    { key: 'protein_per_100g', label: 'protein/100g' },
    { key: 'carbs_per_100g',   label: 'carbs/100g' },
    { key: 'fat_per_100g',     label: 'fat/100g' },
    { key: 'source',           label: 'source' },
    { key: 'updated_at',       label: 'updated_at' },
  ];

  return (
    <div dir="ltr" style={{ fontFamily: 'monospace', padding: 24, maxWidth: '100%', overflowX: 'auto' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
        🔍 DebugFoods — UserFoodItem canonical records
      </h1>

      {/* Auth context */}
      <div style={{ background: '#f4f4f4', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
        <div><strong>user.email:</strong> {user?.email ?? '—'}</div>
        <div><strong>user.id:</strong> {user?.id ?? '—'}</div>
        <div><strong>trainee.id:</strong> {trainee?.id ?? (user ? 'not found' : 'loading…')}</div>
        <div><strong>total UserFoodItem records:</strong> {isFetching ? 'fetching…' : allFoods.length}</div>
        <div><strong>beef-related records:</strong> {isFetching ? '…' : beefRecords.length}</div>
      </div>

      {/* Normalization sanity check */}
      <div style={{ background: '#fffbe6', border: '1px solid #ffe58f', padding: 12, borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
        <strong>normalizeFoodName() output for beef terms:</strong>
        <ul style={{ margin: '6px 0 0 0', paddingLeft: 20 }}>
          {['בקר', 'בשר בקר', 'בקר טחון', 'בשר'].map(t => (
            <li key={t}>"{t}" → "{normalizeFoodName(t)}"</li>
          ))}
        </ul>
      </div>

      {/* Controls */}
      <div style={{ marginBottom: 12, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          onClick={() => refetch()}
          style={{ padding: '6px 14px', borderRadius: 4, background: '#1a1a1a', color: '#fff', border: 'none', cursor: 'pointer', fontSize: 13 }}
        >
          ↺ Refetch
        </button>
        <label style={{ fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ marginRight: 6 }} />
          Show all {allFoods.length} records (not just beef)
        </label>
      </div>

      {/* Table */}
      {isFetching && <div style={{ color: '#888', marginBottom: 12 }}>Loading…</div>}

      {!isFetching && !trainee && (
        <div style={{ color: 'red', marginBottom: 12 }}>
          ⚠️ No trainee record found for this user. UserFoodItem records are scoped to trainee_id.
        </div>
      )}

      {!isFetching && trainee && displayRecords.length === 0 && (
        <div style={{ color: '#888' }}>
          No {showAll ? '' : 'beef-related '}records found.
        </div>
      )}

      {displayRecords.length > 0 && (
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#222', color: '#fff' }}>
              {cols.map(c => (
                <th key={c.key} style={{ padding: '6px 10px', textAlign: 'left', whiteSpace: 'nowrap', border: '1px solid #444' }}>
                  {c.label}
                </th>
              ))}
              <th style={{ padding: '6px 10px', textAlign: 'left', border: '1px solid #444' }}>
                norm(food_name)
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRecords.map((r, i) => {
              const isBeef = matchesBeef(r);
              const bg = isBeef ? (i % 2 === 0 ? '#fff8e1' : '#fff3cd') : (i % 2 === 0 ? '#fff' : '#f9f9f9');
              return (
                <tr key={r.id} style={{ background: bg }}>
                  {cols.map(c => (
                    <td key={c.key} style={{ padding: '5px 10px', border: '1px solid #ddd', whiteSpace: c.key === 'id' || c.key === 'updated_at' ? 'nowrap' : 'normal', maxWidth: 200 }}>
                      {c.key === 'updated_at'
                        ? (r.updated_at ? new Date(r.updated_at).toLocaleString('he-IL') : '—')
                        : (r[c.key] ?? '—')}
                    </td>
                  ))}
                  <td style={{ padding: '5px 10px', border: '1px solid #ddd', color: '#555' }}>
                    {normalizeFoodName(r.food_name || '')}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {/* Raw JSON for copy-paste */}
      {beefRecords.length > 0 && (
        <details style={{ marginTop: 24 }}>
          <summary style={{ cursor: 'pointer', fontSize: 13, color: '#555' }}>
            Raw JSON of beef records (for copy-paste)
          </summary>
          <pre style={{ background: '#f4f4f4', padding: 12, borderRadius: 6, fontSize: 11, overflow: 'auto', maxHeight: 400, marginTop: 8 }}>
            {JSON.stringify(beefRecords, null, 2)}
          </pre>
        </details>
      )}
    </div>
  );
}
