import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { source } = body;

    if (!source) {
      return Response.json({ error: 'source is required' }, { status: 400 });
    }

    const isSimulator = source === 'manual_test';

    console.log(`[determineLeadSimulatorMode] source="${source}" → isSimulatorLead=${isSimulator}`);

    return Response.json({
      ok: true,
      source,
      isSimulatorLead: isSimulator,
      rule: isSimulator ? 'manual_test → simulator mode' : 'default → real mode'
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});