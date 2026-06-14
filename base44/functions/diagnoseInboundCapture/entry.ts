import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
        }

        const body = await req.json();
        const { leadId, coachEmail } = body;

        if (!leadId || !coachEmail) {
            return Response.json({ 
                error: 'Missing required parameters: leadId, coachEmail' 
            }, { status: 400 });
        }

        const report = {
            timestamp: new Date().toISOString(),
            leadId,
            coachEmail,
            checks: {},
            verdict: null,
            rootCause: null,
            recommendations: []
        };

        // ===== CHECK 1: Webhook Configuration =====
        const configs = await base44.asServiceRole.entities.WhatsAppProviderConfig.filter({
            coach_email: coachEmail,
            provider_type: 'greenapi',
            is_enabled: true
        });

        report.checks.webhookConfig = {
            configsFound: configs.length,
            configs: configs.map(c => ({
                id: c.id,
                instance_id: c.instance_id ? '***' : null,
                phone: c.phone_number_e164,
                status: c.status,
                lastTestAt: c.last_test_at,
                lastError: c.last_error
            })),
            ok: configs.length > 0 && configs.some(c => c.status === 'connected')
        };

        if (!report.checks.webhookConfig.ok) {
            report.recommendations.push('No active Green API webhook configuration found');
        }

        // ===== CHECK 2: Polling Worker Status =====
        const systemHealth = await base44.asServiceRole.entities.SystemHealth.filter({
            coach_email: coachEmail
        });

        const health = systemHealth[0];
        report.checks.pollingWorker = {
            lastWebhookReceived: health?.lastInboundWebhookReceivedAt || null,
            lastWebhookMessage: health?.lastInboundWebhookMessageText || null,
            pipelineStatus: health?.inboundPipelineStatus || 'UNKNOWN',
            lastSuccess: health?.lastInboundWebhookSuccess || false,
            lastParseSuccess: health?.lastInboundParseSuccess || false,
            lastLeadMatched: health?.lastInboundLeadMatched || false,
            failureReason: health?.lastInboundFailureReason || null,
            ok: health?.inboundPipelineStatus === 'MATCHED_SUCCESSFULLY'
        };

        // ===== CHECK 3: Last Inbound Payload =====
        const recentMessages = await base44.asServiceRole.entities.LeadMessageThread.filter({
            leadId: leadId,
            direction: 'INBOUND'
        }, '-messageTimestamp', 5);

        report.checks.lastInboundPayload = {
            messagesFound: recentMessages.length,
            lastMessage: recentMessages.length > 0 ? {
                id: recentMessages[0].id,
                timestamp: recentMessages[0].messageTimestamp,
                text: recentMessages[0].messageText ? recentMessages[0].messageText.substring(0, 100) : null,
                providerMessageId: recentMessages[0].providerMessageId,
                aiProcessed: recentMessages[0].aiProcessed
            } : null,
            ok: recentMessages.length > 0
        };

        // ===== CHECK 4: Diagnostic Logs =====
        const diagnosticLogs = await base44.asServiceRole.entities.WhatsAppDiagnosticsLog.filter({
            coach_email: coachEmail,
            event: { $in: ['QUEUE_ADD', 'WORKER_START', 'SEND_ATTEMPT'] }
        }, '-created_date', 20);

        const recentWorkerStart = diagnosticLogs.filter(l => l.event === 'WORKER_START').slice(0, 3);
        const recentQueueAdd = diagnosticLogs.filter(l => l.event === 'QUEUE_ADD').slice(0, 3);

        report.checks.diagnosticLogs = {
            workerStartEvents: recentWorkerStart.length,
            queueAddEvents: recentQueueAdd.length,
            recentWorkerRuns: recentWorkerStart.map(l => ({
                at: l.created_date,
                payload: l.payload?.messagesProcessed || 0
            })),
            ok: recentWorkerStart.length > 0
        };

        // ===== ANALYSIS =====
        const hasConfig = report.checks.webhookConfig.ok;
        const hasRecentPayload = report.checks.lastInboundPayload.ok;
        const pollingRunning = report.checks.diagnosticLogs.ok;

        if (!hasConfig) {
            report.verdict = 'CAPTURE_LAYER_DISABLED';
            report.rootCause = 'No active Green API webhook configuration';
            report.recommendations.push('Enable and test Green API webhook configuration');
        } else if (!pollingRunning) {
            report.verdict = 'POLLING_WORKER_INACTIVE';
            report.rootCause = 'Polling worker has not run recently';
            report.recommendations.push('Check polling worker automation trigger');
            report.recommendations.push('Verify pollGreenApiInbound function is deployed');
        } else if (!hasRecentPayload) {
            report.verdict = 'PAYLOAD_NOT_CAPTURED';
            report.rootCause = 'Worker is running but no inbound payloads are being received';
            report.recommendations.push('Check if Green API is receiving messages');
            report.recommendations.push('Verify phone number is correctly configured in Green API');
            report.recommendations.push('Check Green API instance status');
        } else {
            report.verdict = 'CAPTURE_HEALTHY';
            report.rootCause = null;
        }

        return Response.json(report, { status: 200 });

    } catch (error) {
        console.error('[diagnoseInboundCapture]', error);
        return Response.json({ 
            error: error.message,
            stack: error.stack 
        }, { status: 500 });
    }
});