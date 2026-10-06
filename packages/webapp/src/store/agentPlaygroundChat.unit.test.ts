import { beforeEach, describe, expect, it, vi } from 'vitest';

import { clearAgentPlaygroundChat, INTERRUPTED_CALL, loadAgentPlaygroundChat, saveAgentPlaygroundChat } from './agentPlaygroundChat';

const store = new Map<string, string>();
vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, value),
    removeItem: (key: string) => store.delete(key)
});

const now = Date.parse('2026-10-01T12:00:00Z');
const message = (sessionExpiresAt?: string) => ({
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: 'Hi' }],
    ...(sessionExpiresAt ? { metadata: { sessionId: 'session', sessionExpiresAt } } : {})
});
const answeredApproval = (approved: boolean) => ({
    type: 'dynamic-tool' as const,
    toolName: 'nango_execute',
    toolCallId: 'call',
    state: 'approval-responded' as const,
    input: {},
    approval: { id: 'approval', approved }
});

describe('agent playground chat storage', () => {
    beforeEach(() => store.clear());

    it('restores a chat in the same environment while its session lasts', () => {
        const messages = [message('2026-10-01T12:30:00Z')];
        saveAgentPlaygroundChat('dev', 'user', messages);

        expect(loadAgentPlaygroundChat('dev', 'user', now)).toEqual(messages);
    });

    it('drops a chat whose session has expired, or that belongs to another environment or user', () => {
        saveAgentPlaygroundChat('dev', 'user', [message('2026-10-01T11:59:00Z')]);
        expect(loadAgentPlaygroundChat('dev', 'user', now)).toBeUndefined();
        expect(store.size).toBe(0);

        saveAgentPlaygroundChat('dev', 'user', [message('2026-10-01T12:30:00Z')]);
        expect(loadAgentPlaygroundChat('prod', 'user', now)).toBeUndefined();

        saveAgentPlaygroundChat('dev', 'user', [message('2026-10-01T12:30:00Z')]);
        expect(loadAgentPlaygroundChat('dev', 'someone-else', now)).toBeUndefined();
    });

    it('marks an approved call that never finished as interrupted, and a denied one as denied', () => {
        saveAgentPlaygroundChat('dev', 'user', [{ ...message('2026-10-01T12:30:00Z'), parts: [answeredApproval(true)] }]);
        expect(loadAgentPlaygroundChat('dev', 'user', now)?.[0]?.parts[0]).toMatchObject({ state: 'output-error', errorText: INTERRUPTED_CALL });

        saveAgentPlaygroundChat('dev', 'user', [{ ...message('2026-10-01T12:30:00Z'), parts: [answeredApproval(false)] }]);
        expect(loadAgentPlaygroundChat('dev', 'user', now)?.[0]?.parts[0]).toMatchObject({ state: 'output-denied' });
    });

    it('drops a chat with no session yet', () => {
        saveAgentPlaygroundChat('dev', 'user', [message()]);

        expect(loadAgentPlaygroundChat('dev', 'user', now)).toBeUndefined();
    });

    it('forgets the chat when it is emptied or cleared', () => {
        saveAgentPlaygroundChat('dev', 'user', [message('2026-10-01T12:30:00Z')]);
        saveAgentPlaygroundChat('dev', 'user', []);
        expect(store.size).toBe(0);

        saveAgentPlaygroundChat('dev', 'user', [message('2026-10-01T12:30:00Z')]);
        clearAgentPlaygroundChat();
        expect(store.size).toBe(0);
    });
});
