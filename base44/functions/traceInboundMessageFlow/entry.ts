import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (user?.role !== 'admin') {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { leadId } = body;

        if (!leadId) {
            return Response.json({ error: 'leadId required' }, { status: 400 });
        }

        // Get the lead
        const lead = await base44.asServiceRole.entities.Lead.filter({ id: leadId });
        if (!lead || lead.length === 0) {
            return Response.json({ error: 'Lead not found' }, { status: 404 });
        }

        const leadData = lead[0];
        const report = {
            leadId,
            leadName: `${leadData.firstName} ${leadData.lastName}`,
            coachEmail: leadData.coach_email,
            phoneE164: leadData.phoneE164,
            timestamp: new Date().toISOString(),
            pipeline: [],
            breakPoint: null,
            analysis: {}
        };

        // ===== STEP 1: Check LeadMessageThread (Capture & Persistence) =====
        const inboundMessages = await base44.asServiceRole.entities.LeadMessageThread.filter({
            leadId,
            direction: 'INBOUND'
        }, '-messageTimestamp', 10);

        const step1 = {
            step: 'CAPTURE_PERSISTENCE',
            description: 'Is inbound message captured and persisted?',
            messagesFound: inboundMessages.length,
            recent: inboundMessages.slice(0, 3).map(m => ({
                id: m.id,
                timestamp: m.messageTimestamp,
                text: m.messageText?.substring(0, 50),
                aiProcessed: m.aiProcessed,
                providerMessageId: m.providerMessageId
            }))
        };

        report.pipeline.push(step1);

        if (inboundMessages.length === 0) {
            report.breakPoint = 'STEP_1_NO_PERSISTENCE';
            report.analysis.severity = 'CRITICAL';
            report.analysis.issue = 'No inbound messages found in LeadMessageThread - messages are not being persisted';
            report.analysis.checkNext = 'diagnoseInboundCapture to verify webhook/poller is running';
            return Response.json(report, { status: 200 });
        }

        // ===== STEP 2: Check if messages are marked as processed =====
        const unprocessedMessages = inboundMessages.filter(m => !m.aiProcessed);
        const processedMessages = inboundMessages.filter(m => m.aiProcessed);

        const step2 = {
            step: 'AI_READINESS',
            description: 'Are inbound messages marked as unprocessed for AI?',
            unprocessedCount: unprocessedMessages.length,
            processedCount: processedMessages.length,
            allProcessed: unprocessedMessages.length === 0,
            recentUnprocessed: unprocessedMessages.slice(0, 3).map(m => ({
                id: m.id,
                timestamp: m.messageTimestamp,
                text: m.messageText?.substring(0, 50)
            }))
        };

        report.pipeline.push(step2);

        if (unprocessedMessages.length === 0 && inboundMessages.length > 0) {
            report.breakPoint = 'STEP_2_ALL_MARKED_PROCESSED';
            report.analysis.severity = 'HIGH';
            report.analysis.issue = `All ${inboundMessages.length} inbound messages are marked as aiProcessed=true`;
            report.analysis.problem = 'Once marked processed, AI agent will NOT pick them up again';
            report.analysis.likely_cause = 'Message was processed but reply failed or was never sent';
            report.analysis.checkNext = 'Verify reply status in WhatsAppMessageQueue';
            return Response.json(report, { status: 200 });
        }

        // ===== STEP 3: Check AI Conversation Log =====
        const aiLogs = await base44.asServiceRole.entities.AIConversationLog.filter({
            leadId
        }, '-processed_at', 5);

        const step3 = {
            step: 'AI_INVOCATION',
            description: 'Has AI been invoked for this lead?',
            aiLogsFound: aiLogs.length,
            aiStatus: aiLogs.length > 0 ? aiLogs[0].ai_status : 'NO_LOG',
            lastProcessed: aiLogs.length > 0 ? aiLogs[0].processed_at : null,
            lastError: aiLogs.length > 0 ? aiLogs[0].error_message : null
        };

        report.pipeline.push(step3);

        if (aiLogs.length === 0) {
            report.breakPoint = 'STEP_3_NO_AI_INVOCATION';
            report.analysis.severity = 'HIGH';
            report.analysis.issue = 'No AIConversationLog found - AI agent has never been invoked';
            report.analysis.possible_causes = [
                'aiConversationAgent function was never called',
                'Lead status or config prevents AI triggering',
                'Automation/scheduler did not trigger the function'
            ];
            report.analysis.checkNext = 'Verify pollGreenApiInbound or simulateInboundMessage called aiConversationAgent';
            return Response.json(report, { status: 200 });
        }

        // ===== STEP 4: Check Message Thread to AI Log Sync =====
        const mostRecentInbound = inboundMessages[0];
        const mostRecentAI = aiLogs[0];

        const inboundTime = new Date(mostRecentInbound.messageTimestamp).getTime();
        const aiTime = new Date(mostRecentAI.processed_at).getTime();
        const timeDiff = (aiTime - inboundTime) / 1000; // seconds

        const step4 = {
            step: 'PIPELINE_SYNC',
            description: 'Is the most recent inbound message synced with AI log?',
            mostRecentInbound: {
                id: mostRecentInbound.id,
                timestamp: mostRecentInbound.messageTimestamp,
                aiProcessed: mostRecentInbound.aiProcessed
            },
            mostRecentAI: {
                timestamp: mostRecentAI.processed_at,
                status: mostRecentAI.ai_status,
                lastUserMessage: mostRecentAI.last_user_message?.substring(0, 50)
            },
            timeDifferenceSeconds: timeDiff,
            synced: Math.abs(timeDiff) < 300 // within 5 minutes
        };

        report.pipeline.push(step4);

        if (!step4.synced && unprocessedMessages.length > 0) {
            report.breakPoint = 'STEP_4_STALE_AI_LOG';
            report.analysis.severity = 'MEDIUM';
            report.analysis.issue = `AI log is stale: last processed ${Math.abs(timeDiff)}s ago, but new inbound message arrived`;
            report.analysis.problem = 'New unprocessed inbound messages exist but AI has not been re-invoked';
            report.analysis.checkNext = 'Verify automation/scheduler will trigger aiConversationAgent again';
            return Response.json(report, { status: 200 });
        }

        // ===== STEP 5: Check Reply Queue Status =====
        const replies = await base44.asServiceRole.entities.WhatsAppMessageQueue.filter({
            context_type: 'lead',
            context_id: leadId
        }, '-created_date', 5);

        const step5 = {
            step: 'REPLY_GENERATION',
            description: 'Was a reply generated and queued?',
            repliesQueued: replies.length,
            recentReplies: replies.slice(0, 3).map(r => ({
                id: r.id,
                status: r.status,
                text: r.rendered_text?.substring(0, 50),
                createdAt: r.created_date
            }))
        };

        report.pipeline.push(step5);

        if (replies.length === 0 && unprocessedMessages.length > 0) {
            report.breakPoint = 'STEP_5_NO_REPLY_GENERATED';
            report.analysis.severity = 'HIGH';
            report.analysis.issue = 'Unprocessed inbound messages exist but NO reply was generated or queued';
            report.analysis.problem = 'AI was invoked but did not generate a response';
            report.analysis.checkNext = 'Check AIConversationLog.error_message and AIConversationLog.ai_status';
            return Response.json(report, { status: 200 });
        }

        // ===== STEP 6: Check Reply Status =====
        const failedReplies = replies.filter(r => r.status === 'failed');
        const sentReplies = replies.filter(r => r.status === 'sent');

        const step6 = {
            step: 'REPLY_DELIVERY',
            description: 'Was the reply successfully sent?',
            sentReplies: sentReplies.length,
            failedReplies: failedReplies.length,
            failureDetails: failedReplies.map(r => ({
                id: r.id,
                error: r.error_message,
                attempts: r.attempts
            }))
        };

        report.pipeline.push(step6);

        if (failedReplies.length > 0 && sentReplies.length === 0) {
            report.breakPoint = 'STEP_6_REPLY_DELIVERY_FAILED';
            report.analysis.severity = 'MEDIUM';
            report.analysis.issue = 'Replies were generated but failed to deliver';
            report.analysis.errors = failedReplies.map(r => r.error_message);
            return Response.json(report, { status: 200 });
        }

        // ===== ALL CHECKS PASSED =====
        report.breakPoint = null;
        report.analysis.severity = 'OK';
        report.analysis.issue = 'Pipeline flow is healthy - message captured, processed, and delivered';
        
        return Response.json(report, { status: 200 });

    } catch (error) {
        console.error('[traceInboundMessageFlow]', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});