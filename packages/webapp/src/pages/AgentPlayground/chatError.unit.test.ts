import { describe, expect, it } from 'vitest';

import { describeChatError } from './chatError.js';

describe('describeChatError', () => {
    it('explains a setup failure and offers a retry', () => {
        const error = new Error(JSON.stringify({ error: { code: 'session_creation_failed', message: 'toolset is empty' } }));

        expect(describeChatError(error)).toEqual({ title: "Couldn't start the agent.", detail: 'toolset is empty', action: 'retry' });
    });

    it('offers no retry when the feature is off', () => {
        const error = new Error(JSON.stringify({ error: { code: 'feature_disabled', message: 'Agent Playground is not enabled for this account' } }));

        expect(describeChatError(error)).toEqual({ title: 'The Agent Playground is not enabled for this account.', action: 'none' });
    });

    it('sends a rejected chat to a new chat', () => {
        const error = new Error(JSON.stringify({ error: { code: 'invalid_body', errors: [] } }));

        expect(describeChatError(error)).toEqual({ title: "This chat can't continue.", action: 'new-chat' });
    });

    it('asks a rate-limited user to wait', () => {
        const error = new Error(JSON.stringify({ error: { code: 'too_many_request', message: 'Too many Agent Playground messages for this user' } }));

        expect(describeChatError(error)).toEqual({
            title: 'Too many messages in a short time.',
            detail: 'Wait a minute, then try again.',
            action: 'retry'
        });
    });

    it('says the playground is unavailable when the model provider fails, and offers a retry', () => {
        const error = new Error(JSON.stringify({ error: { code: 'model_unavailable', retryable: true } }));

        expect(describeChatError(error)).toEqual({
            title: 'The Agent Playground is temporarily unavailable.',
            detail: 'Try again in a few minutes.',
            action: 'retry'
        });
    });

    it('offers no retry when waiting will not bring the model provider back', () => {
        const error = new Error(JSON.stringify({ error: { code: 'model_unavailable', retryable: false } }));

        expect(describeChatError(error)).toEqual({
            title: 'The Agent Playground is temporarily unavailable.',
            detail: 'Please check back later.',
            action: 'none'
        });
    });

    it('keeps the text of an error sent mid-reply', () => {
        expect(describeChatError(new Error('Rate limit reached'))).toEqual({
            title: 'The agent ran into a problem.',
            detail: 'Rate limit reached',
            action: 'retry'
        });
    });
});
