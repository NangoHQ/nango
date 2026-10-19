import { describe, expect, it } from 'vitest';

import { INTERRUPTED_CALL } from '../../store/agentPlaygroundChat.js';
import { hasReplyContent, hasVisibleContent, markStopped, outcomeDisplay, setReplyOutcome } from './replyOutcome.js';

import type { PlaygroundMessage } from '../../store/agentPlaygroundChat.js';

const userMessage: PlaygroundMessage = { id: 'user', role: 'user', parts: [{ type: 'text', text: 'Hi' }] };
const emptyReply: PlaygroundMessage = {
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

const running = { type: 'dynamic-tool', toolName: 'nango_proxy', toolCallId: 'call', state: 'input-available', input: {} } as const;
const approved = { ...running, state: 'approval-responded', approval: { id: 'approval', approved: true } } as const;

describe('markStopped', () => {
    it('marks an approved call that never reported back as interrupted, so it is not sent again', () => {
        const [reply] = markStopped([{ ...emptyReply, parts: [approved] }]);

        expect(reply?.parts[0]).toMatchObject({ state: 'output-error', errorText: INTERRUPTED_CALL });
        expect(reply?.metadata?.replyOutcome).toEqual({ kind: 'stopped' });
    });
});

describe('outcomeDisplay', () => {
    const stopped = { ...emptyReply, metadata: { replyOutcome: { kind: 'stopped' } } } satisfies PlaygroundMessage;
    const finished = { ...running, state: 'output-available', output: {} } as const;
    const interrupted = { ...running, state: 'output-error', errorText: INTERRUPTED_CALL } as const;

    it('shows a stop on the tool call it cut short', () => {
        expect(outcomeDisplay({ ...stopped, parts: [{ type: 'text', text: 'Looking' }, running, { type: 'text', text: '' }] })).toEqual({
            notice: undefined,
            stoppedToolCall: running
        });
        expect(outcomeDisplay({ ...stopped, parts: [interrupted] })).toEqual({ notice: undefined, stoppedToolCall: interrupted });
    });

    it('shows a notice when text follows the tool call, or the tool call finished', () => {
        expect(outcomeDisplay({ ...stopped, parts: [running, { type: 'text', text: 'Done' }] }).notice).toEqual({ kind: 'stopped' });
        expect(outcomeDisplay({ ...stopped, parts: [finished] }).notice).toEqual({ kind: 'stopped' });
    });

    it('always shows a failure as a notice', () => {
        expect(outcomeDisplay({ ...emptyReply, parts: [running], metadata: { replyOutcome: { kind: 'failed', error: 'boom' } } })).toEqual({
            notice: { kind: 'failed', error: 'boom' },
            stoppedToolCall: undefined
        });
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
