import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Reboots the Green API instance to restore webhook delivery.
 * Should be called when inbound webhooks stop arriving.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

    const { coachEmail } = await req.json();
    if (!coachEmail) return Response.json({ ok: false, error: 'coachEmail required' }, { status: 400 });

    const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({ coach_email: coachEmail });
    const config = configs[0];

    if (!config || config.provider_type !== 'greenapi') {
      return Response.json({ ok: false, error: 'Green API config not found' }, { status: 400 });
    }

    const { api_url, instance_id, api_token } = config;
    const baseUrl = (api_url || '').replace(/\/+$/, '');

    const rebootUrl = `${baseUrl}/waInstance${instance_id}/reboot/${api_token}`;
    const rebootRes = await fetch(rebootUrl, { method: 'GET' });
    const rebootBody = await rebootRes.text();
    let rebootData = {};
    try { rebootData = JSON.parse(rebootBody); } catch (_) {}

    await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.create({
      coach_email: coachEmail,
      event: 'UI_ACTION',
      payload: { action: 'reboot_instance', status: rebootRes.status, response: rebootData }
    }).catch(() => {});

    if (!rebootRes.ok) {
      console.error('[rebootGreenApiInstance] HTTP error:', rebootRes.status, rebootBody);
      return Response.json({ 
        ok: false, 
        error: `Green API returned ${rebootRes.status}`,
        details: rebootBody.slice(0, 200)
      }, { status: 200 });
    }

    return Response.json({ 
      ok: true, 
      message: 'Instance reboot started ✅', 
      response: rebootData 
    }, { status: 200 });

  } catch (error) {
    console.error('[rebootGreenApiInstance] FATAL ERROR:', error.message, error.stack);
    return Response.json({ ok: false, error: error.message }, { status: 200 });
  }
});