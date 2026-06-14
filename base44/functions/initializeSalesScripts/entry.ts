import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// PART 2: Auto-create Main and Skeptical sales scripts if missing

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const coachEmail = user.email;
    
    // Check existing scripts
    const allScripts = await base44.asServiceRole.entities.SalesScript.list('-created_date', 100);
    const mainScript = allScripts.find(s => s.coach_email === coachEmail && s.script_type === 'main');
    const skepticalScript = allScripts.find(s => s.coach_email === coachEmail && s.script_type === 'skeptical');
    
    const created = [];
    
    // Create Main Sales Script if missing
    if (!mainScript) {
      const newMainScript = await base44.asServiceRole.entities.SalesScript.create({
        coach_email: coachEmail,
        name: 'Main Sales Script',
        script_type: 'main',
        description: 'סקריפט מכירה ראשי - חם ומזמין',
        is_active: true,
        script_enabled: true,
        hot_lead_triggers: 'כמה עולה,מחיר,רוצה להצטרף,איך נרשמים,אשמח להתחיל'
      });
      
      // Create stages
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newMainScript.id,
        stage_order: 1,
        stage_name: 'Opening',
        question_text: 'היי {{name}} 👋\nכאן עדן מ-Shape Studio.\nראיתי שהשארת פרטים —\nמה גרם לך לרצות להתחיל להתאמן עכשיו?',
        purpose: 'custom',
        crm_field: 'lead_reason'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newMainScript.id,
        stage_order: 2,
        stage_name: 'Goal',
        question_text: 'מעולה 💪\nמה המטרה העיקרית שלך כרגע —\nלרדת במשקל, להתחזק או להיכנס למסגרת?',
        purpose: 'goal',
        crm_field: 'goal'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newMainScript.id,
        stage_order: 3,
        stage_name: 'Experience',
        question_text: 'יצא לך להתאמן בעבר\nאו שאתה מתחיל עכשיו מחדש?',
        purpose: 'experience',
        crm_field: 'experience'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newMainScript.id,
        stage_order: 4,
        stage_name: 'Call Offer',
        question_text: 'כדי להבין מה יתאים לך הכי טוב\nהכי נכון יהיה שנדבר רגע קצר.\n\nנוח לך שנחזור אליך היום?',
        purpose: 'custom',
        crm_field: 'call_interest',
        suggest_call: true
      });
      
      created.push('Main Sales Script');
    }
    
    // Create Skeptical Lead Script if missing
    if (!skepticalScript) {
      const newSkepticalScript = await base44.asServiceRole.entities.SalesScript.create({
        coach_email: coachEmail,
        name: 'Skeptical Lead Script',
        script_type: 'skeptical',
        description: 'סקריפט ללידים מהססים - רך ותומך',
        is_active: true,
        script_enabled: true
      });
      
      // Create stages
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newSkepticalScript.id,
        stage_order: 1,
        stage_name: 'Soft Open',
        question_text: 'ברור 👍\nרק כדי להבין —\nמה גורם לך להתלבט כרגע?',
        purpose: 'custom',
        crm_field: 'skepticism_reason'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newSkepticalScript.id,
        stage_order: 2,
        stage_name: 'Concern',
        question_text: 'מה ההתלבטות המרכזית?\nמחיר, זמן, התמדה או משהו אחר?',
        purpose: 'main_concern',
        crm_field: 'main_concern'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newSkepticalScript.id,
        stage_order: 3,
        stage_name: 'Reassurance',
        question_text: 'מבין אותך.\nדווקא בגלל זה חשוב להתאים משהו שבאמת תוכל להתמיד בו.',
        purpose: 'custom',
        crm_field: 'reassurance'
      });
      
      await base44.asServiceRole.entities.SalesScriptStage.create({
        coach_email: coachEmail,
        script_id: newSkepticalScript.id,
        stage_order: 4,
        stage_name: 'Soft Call',
        question_text: 'נראה לי שהכי נכון יהיה לדבר רגע קצר\nולראות אם זה בכלל מתאים לך.',
        purpose: 'custom',
        crm_field: 'call_interest_soft',
        suggest_call: true
      });
      
      created.push('Skeptical Lead Script');
    }
    
    return Response.json({ 
      ok: true, 
      created,
      mainExists: !!mainScript,
      skepticalExists: !!skepticalScript
    });
    
  } catch (error) {
    console.error('[initializeSalesScripts] Error:', error.message);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});