import { describe, expect, it } from 'vitest';

import { hasReplyContent, hasVisibleContent, setReplyOutcome, unfinishedLastToolCall } from './replyOutcome.js';

import type { AgentPlaygroundMessageMetadata } from '@nangohq/types';
import type { UIMessage } from 'ai';

const userMessage: UIMessage<AgentPlaygroundMessageMetadata> = { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hi' }] };
const emptyReply: UIMessage<AgentPlaygroundMessageMetadata> = {
    id: 'reply',
    role: 'assistant',
    parts: [{ type: 'step-start' }],
    metadata: { sessionId: 'session' }
};

describe('setReplyOutcome', () => {
    it('marks the last message and keeps its metadata', () => {
        const messages = setReplyOutcome([userMessage, emptyReply], { kind: 'stopped' });

        expect(messages[0]).toBe(userMessage);
        expect(messages[1]?.metadata).toEqual({ sessionId: 'session', replyOutcome: { kind: 'stopped' } });
    });

    it('marks the user message when no reply arrived', () => {
        const messages = setReplyOutcome([userMessage], { kind: 'failed', error: 'boom' });

        expect(messages[0]?.metadata).toEqual({ replyOutcome: { kind: 'failed', error: 'boom' } });
    });

    it('clears the outcome', () => {
        const marked = setReplyOutcome([emptyReply], { kind: 'stopped' });

        expect(setReplyOutcome(marked, undefined)[0]?.metadata).toEqual({ sessionId: 'session' });
    });

    it('leaves the messages alone when there is nothing to clear', () => {
        const messages = [userMessage];

        expect(setReplyOutcome(messages, undefined)).toBe(messages);
    });
});

describe('hasReplyContent', () => {
    it('counts only what the agent sent', () => {
        expect(hasReplyContent(userMessage)).toBe(false);
        expect(hasReplyContent({ ...emptyReply, metadata: { replyOutcome: { kind: 'stopped' } } })).toBe(false);
        expect(hasReplyContent({ ...emptyReply, parts: [{ type: 'text', text: 'Hello' }] })).toBe(true);
    });
});

describe('unfinishedLastToolCall', () => {
    const running = { type: 'dynamic-tool', toolName: 'nango_proxy', toolCallId: 'call', state: 'input-available', input: {} } as const;
    const finished = { ...running, state: 'output-available', output: {} } as const;

    it('finds a tool call that is the last thing shown and never finished', () => {
        expect(unfinishedLastToolCall({ ...emptyReply, parts: [{ type: 'text', text: 'Looking' }, running, { type: 'text', text: '' }] })).toBe(running);
    });

    it('finds nothing when text follows the tool call, or the tool call finished', () => {
        expect(unfinishedLastToolCall({ ...emptyReply, parts: [running, { type: 'text', text: 'Done' }] })).toBeUndefined();
        expect(unfinishedLastToolCall({ ...emptyReply, parts: [finished] })).toBeUndefined();
        expect(unfinishedLastToolCall(emptyReply)).toBeUndefined();
    });
});

describe('hasVisibleContent', () => {
    it('hides a reply that carries only metadata and step markers', () => {
        expect(hasVisibleContent(emptyReply)).toBe(false);
        expect(hasVisibleContent({ ...emptyReply, parts: [{ type: 'text', text: '' }] })).toBe(false);
        expect(hasVisibleContent({ ...emptyReply, parts: [{ type: 'text', text: '\n' }] })).toBe(false);
    });

    it('shows a reply that ended without content', () => {
        expect(hasVisibleContent({ ...emptyReply, metadata: { replyOutcome: { kind: 'stopped' } } })).toBe(true);
    });

    it('shows a reply with text', () => {
        expect(hasVisibleContent({ ...emptyReply, parts: [{ type: 'text', text: 'Hello' }] })).toBe(true);
    });
});
