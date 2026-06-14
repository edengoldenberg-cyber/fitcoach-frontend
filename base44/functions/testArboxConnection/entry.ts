import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ARBOX_API_KEY = Deno.env.get('ARBOX_API_KEY');
    const ARBOX_BOX_ID = Deno.env.get('ARBOX_BOX_ID');
    const ARBOX_API_BASE_URL = 'https://arboxserver.arboxapp.com/api';

    if (!ARBOX_API_KEY || !ARBOX_BOX_ID) {
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user.email,
        provider: 'arbox',
        action: 'test_connection',
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
        hint: 'חסרים פרטי Arbox בהגדרות (ARBOX_API_KEY או ARBOX_BOX_ID)',
        error: 'חסרים פרטי Arbox בהגדרות',
        uniqueIdentifier: '',
        durationMs: Date.now() - startTime
      });
    }

    // Test connection using POST /manage/v2/reports/getLivForCustomer
    const endpoint = `${ARBOX_API_BASE_URL}/manage/v2/reports/getLivForCustomer`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

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
        body: JSON.stringify({}),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      const statusCode = response.status;
      const responseText = await response.text();

      // Try to parse as JSON
      let data = null;
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'test_connection',
          ok: false,
          status: statusCode,
          error: 'Response not JSON',
          hint: 'התשובה מ-Arbox אינה JSON תקין',
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
          hint: 'התשובה מ-Arbox אינה JSON תקין',
          error: 'Response not JSON',
          uniqueIdentifier: '',
          durationMs: Date.now() - startTime
        });
      }

      // Check for Arbox error codes
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
          action: 'test_connection',
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
          endpoint: '/manage/v2/reports/getLivForCustomer',
          durationMs: Date.now() - startTime
        });
      }

      // Check HTTP status
      if (!response.ok) {
        let hint = '';
        if (statusCode === 401 || statusCode === 403) {
          hint = 'API KEY לא תקין או לא מורשה';
        } else if (statusCode === 404) {
          hint = 'Endpoint לא נמצא - בדוק את ה-URL';
        } else if (statusCode === 500) {
          hint = 'Arbox החזיר שגיאה פנימית 500';
        } else {
          hint = `שגיאת HTTP ${statusCode}`;
        }

        await base44.asServiceRole.entities.IntegrationLog.create({
          coach_email: user.email,
          provider: 'arbox',
          action: 'test_connection',
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
          endpoint: '/manage/v2/reports/getLivForCustomer',
          durationMs: Date.now() - startTime
        });
      }

      // Success!
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user.email,
        provider: 'arbox',
        action: 'test_connection',
        ok: true,
        status: statusCode,
        uniqueIdentifier: '',
        endpoint: endpoint.replace(ARBOX_API_KEY, '***'),
        method: 'POST',
        durationMs: Date.now() - startTime,
        hint: '✅ החיבור תקין',
        debugPayload: {
          endpoint: '/manage/v2/reports/getLivForCustomer',
          responseType: typeof data
        }
      });

      return Response.json({
        ok: true,
        status: statusCode,
        hint: '✅ החיבור תקין',
        uniqueIdentifier: '',
        endpoint: '/manage/v2/reports/getLivForCustomer',
        durationMs: Date.now() - startTime
      });

    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      let hint = '';
      let error = fetchError.message;
      
      if (fetchError.name === 'AbortError') {
        hint = 'פג זמן החיבור (Timeout 10 שניות)';
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
        action: 'test_connection',
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
        durationMs: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('testArboxConnection error:', error);
    
    try {
      await base44.asServiceRole.entities.IntegrationLog.create({
        coach_email: user?.email || 'unknown',
        provider: 'arbox',
        action: 'test_connection',
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
      durationMs: Date.now() - startTime
    });
  }
});