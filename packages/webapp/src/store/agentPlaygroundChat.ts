import { LocalStorageKeys } from '../utils/local-storage';

import type { AgentPlaygroundMessageMetadata } from '@nangohq/types';
import type { UIMessage } from 'ai';

type PlaygroundMessage = UIMessage<AgentPlaygroundMessageMetadata>;

interface StoredChat {
    env: string;
    messages: PlaygroundMessage[];
}

function sessionExpiresAt(messages: PlaygroundMessage[]): number | undefined {
    const latest = [...messages].reverse().find((message) => message.metadata?.sessionExpiresAt);
    return latest?.metadata?.sessionExpiresAt ? Date.parse(latest.metadata.sessionExpiresAt) : undefined;
}

// The chat holds data from the user's connected apps, so it never outlives the session it belongs to.
export function loadAgentPlaygroundChat(env: string, now = Date.now()): PlaygroundMessage[] | undefined {
    try {
        const raw = sessionStorage.getItem(LocalStorageKeys.AgentPlaygroundChat);
        if (!raw) {
            return undefined;
        }
        const stored = JSON.parse(raw) as StoredChat;
        const expiresAt = sessionExpiresAt(stored.messages);
        if (stored.env !== env || !expiresAt || expiresAt <= now) {
            clearAgentPlaygroundChat();
            return undefined;
        }
        return stored.messages;
    } catch {
        return undefined;
    }
}

export function saveAgentPlaygroundChat(env: string, messages: PlaygroundMessage[]): void {
    try {
        if (messages.length === 0) {
            clearAgentPlaygroundChat();
            return;
        }
        sessionStorage.setItem(LocalStorageKeys.AgentPlaygroundChat, JSON.stringify({ env, messages } satisfies StoredChat));
    } catch {
        // Otherwise a reload would restore an older version of the chat.
        clearAgentPlaygroundChat();
    }
}

export function clearAgentPlaygroundChat(): void {
    try {
        sessionStorage.removeItem(LocalStorageKeys.AgentPlaygroundChat);
    } catch {
        // Blocked storage holds nothing to clear.
    }
}
