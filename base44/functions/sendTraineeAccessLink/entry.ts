import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { traineeId } = await req.json();

        if (!traineeId) {
            return Response.json({ error: 'traineeId required' }, { status: 400 });
        }

        // Get trainee with invite_token
        const trainees = await base44.entities.Trainee.list();
        const trainee = trainees.find(t => t.id === traineeId);

        if (!trainee) {
            return Response.json({ error: 'Trainee not found' }, { status: 404 });
        }

        // ─── Token Validation & Generation ───
        let token = trainee.invite_token;
        
        // If no token, generate a new one
        if (!token) {
            token = `invite_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
            try {
                await base44.entities.Trainee.update(traineeId, { invite_token: token });
                console.log(`[sendTraineeAccessLink] Generated new token for trainee: ${token}`);
            } catch (tokenErr) {
                console.error(`[sendTraineeAccessLink] Failed to generate token: ${tokenErr.message}`);
                return Response.json({ error: 'Failed to generate invite token' }, { status: 500 });
            }
        }

        // Build the access link
        const appUrl = (Deno.env.get('BASE44_APP_URL') || 'https://successful-fit-coach-pro.base44.app').replace(/\/+$/, '');
        const accessLink = `${appUrl}/AccessLink?token=${token}`;

        // Verify token is in URL
        if (!accessLink.includes('?token=')) {
            return Response.json({ error: 'Generated AccessLink missing token parameter' }, { status: 500 });
        }

        // Prepare WhatsApp message with standard format
        const message = `היי 👋
ברוכים הבאים ל-FIT COACH PRO 🎉

הנה הקישור האישי שלך לכניסה לאפליקציה:
${accessLink}

אחרי הכניסה הראשונית אפשר לשמור את האפליקציה במסך הבית ולהתחבר דרך Google.`;

        // Validate phone
        if (!trainee.phone) {
            return Response.json({ error: 'Trainee has no phone number' }, { status: 400 });
        }

        // Send via WhatsApp
        const phone = trainee.phone;
        
        try {
            await base44.functions.invoke('enqueueWhatsAppMessage', {
                coachEmail: user.email,
                toPhoneE164: phone,
                toName: trainee.full_name,
                renderedText: message,
                contextType: 'trainee',
                contextId: traineeId,
                trigger_source: 'sendTraineeAccessLink_manual'
            });
        } catch (queueErr) {
            console.error('Failed to queue WhatsApp message:', queueErr);
            return Response.json({ 
                error: 'Failed to queue WhatsApp message',
                details: queueErr.message
            }, { status: 500 });
        }

        return Response.json({
            ok: true,
            traineeId,
            traineePhone: phone,
            accessLink,
            token,
            message: 'Access link sent successfully via WhatsApp'
        });

    } catch (error) {
        console.error('Error sending access link:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});