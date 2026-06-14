import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { trainee_email, trainee_name } = await req.json();
    
    if (!trainee_email) {
      return Response.json({ error: 'trainee_email is required' }, { status: 400 });
    }

    // Send email via Core integration
    await base44.integrations.Core.SendEmail({
      to: trainee_email,
      subject: 'הזמנה להצטרף ל-FIT COACH PRO 💪',
      body: `שלום ${trainee_name || 'מתאמן/ת'},

את/ה מוזמן/ת להצטרף לאפליקציית FIT COACH PRO!

המאמן שלך ממתין לך באפליקציה לניהול אימונים ותזונה.

לחצ/י על הקישור להתחברות:
https://successful-fit-coach-pro.base44.app

בברכה,
צוות FIT COACH PRO`
    });

    return Response.json({ 
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Error sending invite email:', error);
    return Response.json({ 
      error: error.message 
    }, { status: 500 });
  }
});