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
        return stored.messages.map(reopenAnsweredApprovals);
    } catch {
        return undefined;
    }
}

// An answer saved just before a reload is never sent, and a restored chat doesn't send it again.
function reopenAnsweredApprovals(message: PlaygroundMessage): PlaygroundMessage {
    return {
        ...message,
        parts: message.parts.map((part) => {
            if (part.type !== 'dynamic-tool' || part.state !== 'approval-responded') {
                return part;
            }
            const { approved: _approved, reason: _reason, ...approval } = part.approval;
            return { ...part, state: 'approval-requested', approval };
        })
    };
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
    } catch {}
}
