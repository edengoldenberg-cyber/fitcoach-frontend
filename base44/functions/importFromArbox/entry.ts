import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const fxLimit = body.fxLimit || body.limit || 100;

    const ARBOX_API_KEY = Deno.env.get('ARBOX_API_KEY');
    const ARBOX_BOX_ID = Deno.env.get('ARBOX_BOX_ID');
    const ARBOX_API_BASE_URL = 'https://arboxserver.arboxapp.com/api';

    if (!ARBOX_API_KEY || !ARBOX_BOX_ID) {
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user.email,
        provider: 'arbox',
        action: 'import_members',
        ok: false,
        status: 0,
        error: 'חסרים פרטי Arbox בהגדרות',
        hint: 'יש להגדיר ARBOX_API_KEY ו-ARBOX_BOX_ID',
        uniqueIdentifier: '',
        durationMs: Date.now() - startTime
      });
      
      return Response.json({
        ok: false,
        status: 0,
        hint: 'חסרים פרטי Arbox בהגדרות',
        error: 'חסרים פרטי Arbox בהגדרות',
        uniqueIdentifier: '',
        imported: 0,
        updated: 0,
        fetched: 0,
        durationMs: Date.now() - startTime
      });
    }

    // Use POST /manage/v2/reports/getLivForCustomer to get members
    const endpoint = `${ARBOX_API_BASE_URL}/manage/v2/reports/getLivForCustomer`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      // Basic Authentication: username=API_KEY, password=empty
      // Format: BASE64(API_KEY:) - note the colon at the end
      const basicAuth = btoa(`${ARBOX_API_KEY}:`);
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ limit: fxLimit }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const statusCode = response.status;
      const responseText = await response.text();

      // Parse JSON
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        const hint = 'התשובה מ-Arbox אינה JSON תקין. בדוק את ה-URL והמפתח.';
        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'import_members',
          ok: false,
          status: statusCode,
          error: 'Response not JSON',
          hint,
          uniqueIdentifier: '',
          endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
          method: 'POST',
          durationMs: Date.now() - startTime,
          debugPayload: {
            responsePreview: responseText.substring(0, 500)
          }
        });

        return Response.json({
          ok: false,
          status: statusCode,
          hint,
          error: 'Response not JSON',
          uniqueIdentifier: '',
          imported: 0,
          updated: 0,
          fetched: 0,
          durationMs: Date.now() - startTime
        });
      }

      // Check for error codes
      if (data.errorCode) {
        const errorCode = data.errorCode;
        const uniqueIdentifier = data.uniqueIdentifier ? String(data.uniqueIdentifier) : '';

        let hint = '';
        if (errorCode === 1001) {
          hint = '1001 לרוב מעיד על:\n1. BOX_ID לא תואם למפתח\n2. חוסר הרשאה\n3. endpoint לא נכון\n\nבדוק: ARBOX_BOX_ID + ARBOX_API_KEY';
        } else {
          hint = `Arbox החזיר שגיאה ${errorCode}. בדוק לוגים.`;
        }

        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'import_members',
          ok: false,
          status: statusCode,
          error: data.message || 'Arbox error',
          errorCode,
          uniqueIdentifier,
          hint,
          endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
          method: 'POST',
          durationMs: Date.now() - startTime,
          debugPayload: {
            errorCode,
            uniqueIdentifier,
            message: data.message
          }
        });

        return Response.json({
          ok: false,
          status: statusCode,
          errorCode,
          uniqueIdentifier,
          hint,
          error: data.message || 'Arbox error',
          imported: 0,
          updated: 0,
          fetched: 0,
          durationMs: Date.now() - startTime
        });
      }

      // Check HTTP status
      if (!response.ok) {
        let hint = '';
        if (statusCode === 401 || statusCode === 403) {
          hint = 'API KEY לא תקין או לא מורשה';
        } else if (statusCode === 404) {
          hint = 'Endpoint לא נמצא';
        } else if (statusCode === 500) {
          hint = 'Arbox החזיר שגיאה פנימית 500';
        } else {
          hint = `שגיאת HTTP ${statusCode}`;
        }

        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'import_members',
          ok: false,
          status: statusCode,
          error: `HTTP ${statusCode}`,
          hint,
          uniqueIdentifier: '',
          endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
          method: 'POST',
          durationMs: Date.now() - startTime,
          debugPayload: {
            responsePreview: responseText.substring(0, 500)
          }
        });

        return Response.json({
          ok: false,
          status: statusCode,
          hint,
          error: `HTTP ${statusCode}`,
          uniqueIdentifier: '',
          imported: 0,
          updated: 0,
          fetched: 0,
          durationMs: Date.now() - startTime
        });
      }

      // Process members
      const members = Array.isArray(data) ? data : (data.data || data.customers || []);
      
      if (members.length === 0) {
        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'import_members',
          ok: true,
          status: statusCode,
          fetched: 0,
          imported: 0,
          updated: 0,
          uniqueIdentifier: '',
          hint: 'Arbox החזיר 0 מתאמנים',
          endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
          method: 'POST',
          durationMs: Date.now() - startTime
        });

        return Response.json({
          ok: true,
          status: statusCode,
          hint: 'Arbox החזיר 0 מתאמנים',
          uniqueIdentifier: '',
          imported: 0,
          updated: 0,
          fetched: 0,
          durationMs: Date.now() - startTime
        });
      }

      // Get existing trainees
      const existingTrainees = await base44.asServiceRole.entities.ExternalTrainee.filter({
        coach_email: user.email
      });

      const phoneMap = new Map();
      existingTrainees.forEach(t => {
        if (t.phone_e164) phoneMap.set(t.phone_e164, t);
      });

      let imported = 0;
      let updated = 0;

      // Process each member
      for (const member of members) {
        const phoneRaw = member.phoneNumber || member.mobile || member.phone || '';
        const fullName = member.fullName || member.name || `${member.firstName || ''} ${member.lastName || ''}`.trim();
        
        if (!phoneRaw || !fullName) continue;

        // Normalize phone
        let phoneE164 = phoneRaw.replace(/[\s\-()]/g, '');
        if (phoneE164.startsWith('05')) {
          phoneE164 = '+9725' + phoneE164.substring(2);
        } else if (phoneE164.startsWith('972') && !phoneE164.startsWith('+')) {
          phoneE164 = '+' + phoneE164;
        }

        if (!phoneE164.startsWith('+972') || phoneE164.length !== 13) {
          continue;
        }

        const traineeData = {
          coach_email: user.email,
          full_name: fullName,
          phone_e164: phoneE164,
          source: 'ARBOX',
          arbox_member_id: String(member.id || member.memberId || member.customerId || '')
        };

        const existing = phoneMap.get(phoneE164);
        
        if (existing) {
          await base44.asServiceRole.entities.ExternalTrainee.update(existing.id, traineeData);
          updated++;
        } else {
          await base44.asServiceRole.entities.ExternalTrainee.create(traineeData);
          imported++;
        }
      }

      // Log success
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user.email,
        provider: 'arbox',
        action: 'import_members',
        ok: true,
        status: statusCode,
        fetched: members.length,
        imported,
        updated,
        uniqueIdentifier: '',
        hint: `✅ יובאו ${imported} | עודכנו ${updated}`,
        endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
        method: 'POST',
        durationMs: Date.now() - startTime,
        debugPayload: {
          totalProcessed: members.length,
          imported,
          updated
        }
      });

      return Response.json({
        ok: true,
        status: statusCode,
        fetched: members.length,
        imported,
        updated,
        uniqueIdentifier: '',
        hint: `✅ יובאו ${imported} | עודכנו ${updated}`,
        durationMs: Date.now() - startTime
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      let hint = '';
      let error = fetchError.message;
      
      if (fetchError.name === 'AbortError') {
        hint = 'פג זמן החיבור (Timeout 15 שניות)';
        error = 'Timeout';
      } else if (error.includes('getaddrinfo') || error.includes('DNS')) {
        hint = 'בעיה בדומיין/רשת: DNS failed';
        error = 'DNS lookup failed';
      } else if (error.includes('ECONNREFUSED')) {
        hint = 'החיבור נדחה. ה-URL כנראה לא נכון.';
      } else {
        hint = `שגיאת רשת: ${error}`;
      }

      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user.email,
        provider: 'arbox',
        action: 'import_members',
        ok: false,
        status: 0,
        error,
        hint,
        uniqueIdentifier: '',
        endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
        method: 'POST',
        durationMs: Date.now() - startTime,
        debugPayload: {
          errorName: fetchError.name,
          errorMessage: fetchError.message
        }
      });

      return Response.json({
        ok: false,
        status: 0,
        hint,
        error,
        uniqueIdentifier: '',
        imported: 0,
        updated: 0,
        fetched: 0,
        durationMs: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('importFromArbox error:', error);
    
    try {
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user?.email || 'unknown',
        provider: 'arbox',
        action: 'import_members',
        ok: false,
        status: 0,
        error: error.message || 'Unknown error',
        hint: 'שגיאה פנימית במערכת',
        uniqueIdentifier: '',
        durationMs: Date.now() - startTime
      });
    } catch (logError) {
      console.error('Failed to write log:', logError);
    }

    return Response.json({
      ok: false,
      status: 0,
      hint: 'שגיאה פנימית במערכת',
      error: error.message || 'Unknown error',
      uniqueIdentifier: '',
      imported: 0,
      updated: 0,
      fetched: 0,
      durationMs: Date.now() - startTime
    });
  }
});