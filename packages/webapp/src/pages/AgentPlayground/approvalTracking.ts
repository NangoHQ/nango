import { describeTool, qualifiedToolName } from './toolDisplay';

import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';
import type { AnalyticsEventProperties } from '@nangohq/types';
import type { DynamicToolUIPart } from 'ai';

export type PendingApproval = Extract<DynamicToolUIPart, { state: 'approval-requested' }>;

export function pendingApprovals(message: PlaygroundMessage): PendingApproval[] {
    return message.parts.filter(
        (part): part is PendingApproval => part.type === 'dynamic-tool' && part.state === 'approval-requested' && !part.approval.isAutomatic
    );
}

export function approvalProperties(
    part: PendingApproval,
    chatId: string,
    sessionId: string | undefined
): Omit<AnalyticsEventProperties<'playground:approval_button_click'>, 'is_approved'> {
    const display = describeTool(part.toolName, part.input);
    return {
        chat_id: chatId,
        ...(sessionId ? { agent_session_id: sessionId } : {}),
        tool_name: qualifiedToolName(part.toolName, part.input),
        ...(display.integrationId ? { integration: display.integrationId } : {}),
        ...(display.method ? { http_method: display.method } : {})
    };
}
