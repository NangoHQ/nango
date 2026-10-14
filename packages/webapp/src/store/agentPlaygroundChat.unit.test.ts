import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    AGENT_PLAYGROUND_CHAT_IDLE_MS,
    clearAgentPlaygroundChats,
    deleteAgentPlaygroundChat,
    INTERRUPTED_CALL,
    openAgentPlaygroundChat,
    saveAgentPlaygroundChat
} from './agentPlaygroundChat';

import type { PlaygroundMessage } from './agentPlaygroundChat';

function fakeStorage() {
    const store = new Map<string, string>();
    return {
        store,
        storage: {
            get length() {
                return store.size;
            },
            key: (index: number) => [...store.keys()][index] ?? null,
            getItem: (key: string) => store.get(key) ?? null,
            setItem: (key: string, value: string) => store.set(key, value),
            removeItem: (key: string) => store.delete(key)
        }
    };
}
const local = fakeStorage();
const tab = fakeStorage();
vi.stubGlobal('localStorage', local.storage);
vi.stubGlobal('sessionStorage', tab.storage);

const now = Date.parse('2026-10-01T12:00:00Z');
const hour = 60 * 60 * 1000;
const message = () => ({
    id: crypto.randomUUID(),
    role: 'assistant' as const,
    parts: [{ type: 'text' as const, text: 'Hi' }],
    metadata: { sessionId: 'session' }
});
const answeredApproval = (approved: boolean) => ({
    type: 'dynamic-tool' as const,
    toolName: 'nango_execute',
    toolCallId: 'call',
    state: 'approval-responded' as const,
    input: {},
    approval: { id: 'approval', approved }
});
const save = (chatId: string, messages: PlaygroundMessage[], at = now, env = 'dev', userId = 'user') =>
    saveAgentPlaygroundChat({ chatId, env, userId, messages, now: at });

describe('agent playground chat storage', () => {
    beforeEach(() => {
        local.store.clear();
        tab.store.clear();
    });

    it('reopens the last chat in the environment until it has gone a day without a message', () => {
        const messages = [message()];
        save('a', messages);

        expect(openAgentPlaygroundChat('dev', 'user', now + AGENT_PLAYGROUND_CHAT_IDLE_MS - 1)).toEqual({ chatId: 'a', messages });
        expect(openAgentPlaygroundChat('dev', 'user', now + AGENT_PLAYGROUND_CHAT_IDLE_MS).chatId).not.toBe('a');
        expect(local.store.has('nango_agent_playground_chat:a')).toBe(false);
    });

    it("prefers this tab's chat, and falls back to the environment's last chat in a new tab", () => {
        save('a', [message()]);
        save('b', [message()]);
        tab.store.set('nango_agent_playground_last_chat:dev', 'a');

        expect(openAgentPlaygroundChat('dev', 'user', now).chatId).toBe('a');
        tab.store.clear();
        expect(openAgentPlaygroundChat('dev', 'user', now).chatId).toBe('b');
    });

    it("keeps each environment's chat apart", () => {
        save('a', [message()], now, 'dev');
        save('b', [message()], now, 'prod');

        expect(openAgentPlaygroundChat('dev', 'user', now).chatId).toBe('a');
        expect(openAgentPlaygroundChat('prod', 'user', now).chatId).toBe('b');
    });

    it("never opens another user's chat", () => {
        save('a', [message()]);

        expect(openAgentPlaygroundChat('dev', 'someone-else', now).chatId).not.toBe('a');
    });

    it('restarts the idle clock on a new message or an extended reply, but not on a save of the same chat', () => {
        const first = message();
        save('a', [first]);
        save('a', [{ ...first, metadata: { sessionId: 'session', hidden: true } }], now + 20 * hour);
        expect(openAgentPlaygroundChat('dev', 'user', now + 25 * hour).messages).toBeUndefined();

        save('a', [first]);
        save('a', [first, message()], now + 20 * hour);
        expect(openAgentPlaygroundChat('dev', 'user', now + 25 * hour).messages).toHaveLength(2);

        save('a', [first]);
        save('a', [{ ...first, parts: [...first.parts, answeredApproval(true)] }], now + 20 * hour);
        expect(openAgentPlaygroundChat('dev', 'user', now + 25 * hour).messages).toHaveLength(1);
    });

    it('marks an approved call that never finished as interrupted, and a denied one as denied', () => {
        save('a', [{ ...message(), parts: [answeredApproval(true)] }]);
        expect(openAgentPlaygroundChat('dev', 'user', now).messages?.[0]?.parts[0]).toMatchObject({
            state: 'output-error',
            toolCallId: 'call',
            errorText: INTERRUPTED_CALL
        });

        save('a', [{ ...message(), parts: [answeredApproval(false)] }]);
        expect(openAgentPlaygroundChat('dev', 'user', now).messages?.[0]?.parts[0]).toMatchObject({ state: 'output-denied' });
    });

    it('forgets a chat when it is emptied or deleted, and every chat on sign-out', () => {
        save('a', [message()]);
        save('a', []);
        expect(local.store.has('nango_agent_playground_chat:a')).toBe(false);

        save('a', [message()]);
        deleteAgentPlaygroundChat('a');
        expect(local.store.has('nango_agent_playground_chat:a')).toBe(false);

        save('a', [message()], now, 'dev');
        save('b', [message()], now, 'prod');
        clearAgentPlaygroundChats();
        expect(local.store.size).toBe(0);
        expect(tab.store.size).toBe(0);
    });
});
