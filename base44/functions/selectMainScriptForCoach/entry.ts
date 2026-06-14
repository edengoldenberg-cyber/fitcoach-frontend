import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { coach_email } = body;

    if (!coach_email) {
      return Response.json({ error: 'coach_email is required' }, { status: 400 });
    }

    console.log(`[selectMainScriptForCoach] Finding Main Script for coach=${coach_email}`);

    const scripts = await base44.asServiceRole.entities.SalesScript.filter({
      coach_email,
      script_type: 'main',
      is_active: true,
      script_enabled: true
    });

    if (scripts.length === 0) {
      console.log(`[selectMainScriptForCoach] NO_ACTIVE_MAIN_SCRIPT for coach=${coach_email}`);
      return Response.json({
        ok: true,
        script: null,
        reason: 'NO_ACTIVE_MAIN_SCRIPT'
      });
    }

    const script = scripts[0];
    console.log(`[selectMainScriptForCoach] Found Main Script: ${script.id} - ${script.name}`);

    return Response.json({
      ok: true,
      script: {
        id: script.id,
        name: script.name,
        script_type: script.script_type,
        coach_email: script.coach_email
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});