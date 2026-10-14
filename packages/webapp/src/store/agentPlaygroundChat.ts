import type { AgentPlaygroundMessageMetadata } from '@nangohq/types';
import type { UIMessage } from 'ai';

export type PlaygroundMessage = UIMessage<AgentPlaygroundMessageMetadata>;

interface StoredChat {
    userId: string;
    messages: PlaygroundMessage[];
    lastMessageAt: number;
}

// The chat holds data from the user's connected apps, so the dashboard drops it once nobody has used it for this long.
export const AGENT_PLAYGROUND_CHAT_IDLE_MS = 24 * 60 * 60 * 1000;

const CHAT_PREFIX = 'nango_agent_playground_chat:';
const LAST_CHAT_PREFIX = 'nango_agent_playground_last_chat:';

function readChat(chatId: string): StoredChat | undefined {
    try {
        const raw = localStorage.getItem(CHAT_PREFIX + chatId);
        return raw ? (JSON.parse(raw) as StoredChat) : undefined;
    } catch {
        return undefined;
    }
}

function keysWithPrefix(storage: Storage, prefix: string): string[] {
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key?.startsWith(prefix) ?? false);
}

function isIdle(chat: StoredChat | undefined, now: number): boolean {
    return !chat || typeof chat.lastMessageAt !== 'number' || now - chat.lastMessageAt >= AGENT_PLAYGROUND_CHAT_IDLE_MS;
}

export function removeIdleAgentPlaygroundChats(now = Date.now()): void {
    try {
        for (const key of keysWithPrefix(localStorage, CHAT_PREFIX)) {
            if (isIdle(readChat(key.slice(CHAT_PREFIX.length)), now)) {
                localStorage.removeItem(key);
            }
        }
    } catch {}
}

export function openAgentPlaygroundChat(env: string, userId: string, now = Date.now()): { chatId: string; messages?: PlaygroundMessage[] } {
    try {
        removeIdleAgentPlaygroundChats(now);
        for (const chatId of [sessionStorage.getItem(LAST_CHAT_PREFIX + env), localStorage.getItem(LAST_CHAT_PREFIX + env)]) {
            const chat = chatId ? readChat(chatId) : undefined;
            if (chatId && chat?.userId === userId) {
                return { chatId, messages: chat.messages.map(settleAnsweredApprovals) };
            }
        }
    } catch {}
    return { chatId: crypto.randomUUID() };
}

export const INTERRUPTED_CALL = 'Interrupted before it finished. It may or may not have run.';

// An approved request may already have run, so asking again could make the change twice.
export function settleAnsweredApprovals(message: PlaygroundMessage): PlaygroundMessage {
    return {
        ...message,
        parts: message.parts.map((part) => {
            if (part.type !== 'dynamic-tool' || part.state !== 'approval-responded') {
                return part;
            }
            if (!part.approval.approved) {
                return { ...part, state: 'output-denied', approval: { ...part.approval, approved: false } };
            }
            return {
                type: 'dynamic-tool',
                toolName: part.toolName,
                toolCallId: part.toolCallId,
                state: 'output-error',
                input: part.input,
                errorText: INTERRUPTED_CALL
            };
        })
    };
}

// Saves also run on reload and on edits to a finished reply, and those must not restart the idle clock.
// An approval and the reply after it extend the last message instead of adding one.
function lastMessageAt(previous: StoredChat | undefined, userId: string, messages: PlaygroundMessage[], now: number): number {
    const before = previous?.messages.at(-1);
    const after = messages.at(-1);
    const unchanged = previous && previous.userId === userId && before?.id === after?.id && before?.parts.length === after?.parts.length;
    return unchanged && typeof previous.lastMessageAt === 'number' ? previous.lastMessageAt : now;
}

export function saveAgentPlaygroundChat({
    chatId,
    env,
    userId,
    messages,
    now = Date.now()
}: {
    chatId: string;
    env: string;
    userId: string;
    messages: PlaygroundMessage[];
    now?: number;
}): void {
    try {
        if (messages.length === 0) {
            deleteAgentPlaygroundChat(chatId);
            return;
        }
        const chat: StoredChat = { userId, messages, lastMessageAt: lastMessageAt(readChat(chatId), userId, messages, now) };
        localStorage.setItem(CHAT_PREFIX + chatId, JSON.stringify(chat));
        // A reload reopens this tab's chat. A new tab opens the environment's latest one.
        sessionStorage.setItem(LAST_CHAT_PREFIX + env, chatId);
        localStorage.setItem(LAST_CHAT_PREFIX + env, chatId);
    } catch {
        // Otherwise a reload would restore an older version of the chat.
        deleteAgentPlaygroundChat(chatId);
    }
}

export function deleteAgentPlaygroundChat(chatId: string): void {
    try {
        localStorage.removeItem(CHAT_PREFIX + chatId);
    } catch {}
}

export function clearAgentPlaygroundChats(): void {
    try {
        for (const storage of [localStorage, sessionStorage]) {
            for (const key of [...keysWithPrefix(storage, CHAT_PREFIX), ...keysWithPrefix(storage, LAST_CHAT_PREFIX)]) {
                storage.removeItem(key);
            }
        }
    } catch {}
}
