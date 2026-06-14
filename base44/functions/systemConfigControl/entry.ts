import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * systemConfigControl — Read or write SystemConfig keys
 * Admin only for writes. Anyone can read.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { action, key, value } = body;

    if (!key) return Response.json({ ok: false, error: 'Missing key' }, { status: 400 });

    if (action === 'set') {
      // Write requires admin
      if (user.role !== 'admin') {
        return Response.json({ ok: false, error: 'Forbidden: admin only' }, { status: 403 });
      }
      const existing = await base44.asServiceRole.entities.SystemConfig.filter({ key });
      if (existing && existing[0]) {
        const updated = await base44.asServiceRole.entities.SystemConfig.update(existing[0].id, {
          value: value === true,
          updated_by: user.email
        });
        return Response.json({ ok: true, action: 'updated', key, value: updated.value });
      } else {
        const created = await base44.asServiceRole.entities.SystemConfig.create({
          key,
          value: value === true,
          updated_by: user.email
        });
        return Response.json({ ok: true, action: 'created', key, value: created.value });
      }
    }

    // Default: get
    const records = await base44.asServiceRole.entities.SystemConfig.filter({ key });
    const record = records && records[0];
    return Response.json({
      ok: true,
      key,
      value: record ? record.value : null,
      exists: !!record,
      record: record || null
    });

  } catch (error) {
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});