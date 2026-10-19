import { describe, expect, it } from 'vitest';

import { approvalProperties, pendingApprovals } from './approvalTracking';

import type { PendingApproval } from './approvalTracking';
import type { PlaygroundMessage } from '@/store/agentPlaygroundChat';

const pending = (toolCallId: string, toolName: string, input: unknown, isAutomatic?: boolean): PendingApproval => ({
    type: 'dynamic-tool',
    toolName,
    toolCallId,
    state: 'approval-requested',
    input,
    approval: { id: `approval-${toolCallId}`, ...(isAutomatic ? { isAutomatic } : {}) }
});

describe('pendingApprovals', () => {
    it('lists the calls waiting for the user, but not automatic ones or finished calls', () => {
        const waiting = pending('call-1', 'nango_proxy', { method: 'POST' });
        const message: PlaygroundMessage = {
            id: 'reply',
            role: 'assistant',
            parts: [
                { type: 'text', text: 'I need your approval.' },
                waiting,
                pending('call-2', 'nango_proxy', { method: 'POST' }, true),
                { type: 'dynamic-tool', toolName: 'nango_tool_search', toolCallId: 'call-3', state: 'output-available', input: {}, output: {} }
            ]
        };

        expect(pendingApprovals(message)).toEqual([waiting]);
    });
});

describe('approvalProperties', () => {
    it('names the integration tool behind nango_execute', () => {
        expect(
            approvalProperties(pending('call-1', 'nango_execute', { tool: 'linear__create_issue', input: { title: 'Bug' } }), 'chat-1', 'session-1')
        ).toEqual({
            chat_id: 'chat-1',
            agent_session_id: 'session-1',
            tool_name: 'linear__create_issue',
            integration: 'linear'
        });
    });

    it('names the integration and method of a proxy call, but not its path', () => {
        expect(
            approvalProperties(
                pending('call-1', 'nango_proxy', { integration: 'pg-hubspot', method: 'delete', path: '/crm/v3/objects/contacts/12345' }),
                'chat-1',
                undefined
            )
        ).toEqual({
            chat_id: 'chat-1',
            tool_name: 'nango_proxy',
            integration: 'pg-hubspot',
            http_method: 'DELETE'
        });
    });
});
