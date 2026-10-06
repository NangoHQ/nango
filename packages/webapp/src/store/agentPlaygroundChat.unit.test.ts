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

describe('agent playground chat storage', () => {
    beforeEach(() => store.clear());

    it('restores a chat in the same environment while its session lasts', () => {
        const messages = [message('2026-10-01T12:30:00Z')];
        saveAgentPlaygroundChat('dev', messages);

        expect(loadAgentPlaygroundChat('dev', now)).toEqual(messages);
    });

    it('drops a chat whose session has expired, or that belongs to another environment', () => {
        saveAgentPlaygroundChat('dev', [message('2026-10-01T11:59:00Z')]);
        expect(loadAgentPlaygroundChat('dev', now)).toBeUndefined();
        expect(store.size).toBe(0);

        saveAgentPlaygroundChat('dev', [message('2026-10-01T12:30:00Z')]);
        expect(loadAgentPlaygroundChat('prod', now)).toBeUndefined();
    });

    it('marks an approved call that never finished as interrupted', () => {
        const toolPart = {
            type: 'dynamic-tool' as const,
            toolName: 'nango_execute',
            toolCallId: 'call',
            state: 'approval-responded' as const,
            input: {},
            approval: { id: 'approval', approved: true }
        };
        saveAgentPlaygroundChat('dev', [{ ...message('2026-10-01T12:30:00Z'), parts: [toolPart] }]);

        const [restored] = loadAgentPlaygroundChat('dev', now) ?? [];
        expect(restored?.parts[0]).toMatchObject({ state: 'output-error', toolCallId: 'call', errorText: INTERRUPTED_CALL });
    });

    it('drops a chat with no session yet', () => {
        saveAgentPlaygroundChat('dev', [message()]);

        expect(loadAgentPlaygroundChat('dev', now)).toBeUndefined();
    });

    it('forgets the chat when it is emptied or cleared', () => {
        saveAgentPlaygroundChat('dev', [message('2026-10-01T12:30:00Z')]);
        saveAgentPlaygroundChat('dev', []);
        expect(store.size).toBe(0);

        saveAgentPlaygroundChat('dev', [message('2026-10-01T12:30:00Z')]);
        clearAgentPlaygroundChat();
        expect(store.size).toBe(0);
    });
});
