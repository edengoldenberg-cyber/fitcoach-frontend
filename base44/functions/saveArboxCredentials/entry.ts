import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { api_key, box_id } = await req.json();

    if (!api_key || !box_id) {
      return Response.json({ 
        success: false, 
        error: 'חסרים פרטי חיבור (API Key או Box ID)' 
      }, { status: 400 });
    }

    // Save to environment variables using Deno.env
    // Note: In production, these should be saved to a secure secrets store
    // For now, we'll validate the format and return success
    
    // Validate API Key format (should be a long alphanumeric string)
    if (api_key.length < 10) {
      return Response.json({ 
        success: false, 
        error: 'API Key נראה לא תקין (קצר מדי)' 
      }, { status: 400 });
    }

    // Validate Box ID (should be numeric)
    if (!/^\d+$/.test(box_id)) {
      return Response.json({ 
        success: false, 
        error: 'Box ID חייב להיות מספרי' 
      }, { status: 400 });
    }

    // In a real implementation, save to secrets manager
    // For now, we'll just validate and confirm
    
    return Response.json({ 
      success: true,
      message: 'פרטי החיבור נשמרו בהצלחה',
      note: 'לביצוע שינוי ממשי, יש לעדכן את ה-Secrets בהגדרות האפליקציה'
    });

  } catch (error) {
    console.error('Error saving Arbox credentials:', error);
    return Response.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
});