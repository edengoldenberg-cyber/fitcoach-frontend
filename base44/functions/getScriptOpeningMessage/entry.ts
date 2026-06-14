import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { script_id } = body;

    if (!script_id) {
      return Response.json({ error: 'script_id is required' }, { status: 400 });
    }

    console.log(`[getScriptOpeningMessage] Getting opening message for script=${script_id}`);

    const stages = await base44.asServiceRole.entities.SalesScriptStage.filter({
      script_id,
      stage_order: 1
    });

    if (stages.length === 0) {
      console.log(`[getScriptOpeningMessage] NO_OPENING_STAGE for script=${script_id}`);
      return Response.json({
        ok: true,
        stage: null,
        reason: 'NO_OPENING_STAGE'
      });
    }

    const stage = stages[0];
    console.log(`[getScriptOpeningMessage] Found opening stage: ${stage.id} - "${stage.stage_name}"`);

    return Response.json({
      ok: true,
      stage: {
        id: stage.id,
        stage_order: stage.stage_order,
        stage_name: stage.stage_name,
        question_text: stage.question_text,
        purpose: stage.purpose,
        crm_field: stage.crm_field
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});