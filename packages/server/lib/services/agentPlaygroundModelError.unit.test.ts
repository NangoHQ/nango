import { APICallError, RetryError, streamText } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { modelErrorCategory, ModelKeyMissingError, modelUnavailableError } from './agentPlaygroundModelError.js';

function apiCallError({
    statusCode,
    code,
    type = code,
    isRetryable = statusCode === undefined || statusCode === 429 || statusCode >= 500
}: {
    statusCode?: number;
    code?: string;
    type?: string;
    isRetryable?: boolean;
}): APICallError {
    return new APICallError({
        message: 'OpenAI failed',
        url: 'https://api.openai.com/v1/responses',
        requestBodyValues: {},
        ...(statusCode ? { statusCode } : {}),
        ...(code || type ? { responseBody: JSON.stringify({ error: { message: 'OpenAI failed', type, code } }) } : {}),
        isRetryable
    });
}

async function streamedErrorCategory(model: MockLanguageModelV4): Promise<ReturnType<typeof modelErrorCategory>> {
    let received: unknown;
    const result = streamText({ model, prompt: 'Hi', maxRetries: 0, onError: ({ error }) => void (received = error) });
    await result.consumeStream();
    return modelErrorCategory(received);
}

describe('modelErrorCategory', () => {
    it.each([
        { statusCode: 500, expected: 'outage' },
        { statusCode: 503, expected: 'outage' },
        { statusCode: 408, expected: 'outage' },
        { statusCode: 429, code: 'rate_limit_exceeded', expected: 'rate_limit' },
        { statusCode: 429, code: 'insufficient_quota', expected: 'quota' },
        { statusCode: 401, code: 'invalid_api_key', expected: 'auth' },
        { statusCode: 403, expected: 'auth' },
        { statusCode: 400, code: 'context_length_exceeded', expected: null }
    ])('sorts a $statusCode $code into $expected', ({ statusCode, code, expected }) => {
        expect(modelErrorCategory(apiCallError({ statusCode, ...(code ? { code } : {}) }))).toBe(expected);
    });

    it('spots spent credit when only the type says so', () => {
        expect(modelErrorCategory(apiCallError({ statusCode: 429, code: 'billing_not_active', type: 'insufficient_quota' }))).toBe('quota');
    });

    it('sorts a conflict into outage', () => {
        expect(modelErrorCategory(apiCallError({ statusCode: 409 }))).toBe('outage');
    });

    it('leaves a status-less error the SDK will not retry alone', () => {
        expect(modelErrorCategory(apiCallError({ isRetryable: false }))).toBeNull();
    });

    it('treats a request that never reached OpenAI as an outage', () => {
        expect(modelErrorCategory(apiCallError({}))).toBe('outage');
    });

    it('reads the last attempt of a retried request', () => {
        const error = new RetryError({
            message: 'Failed after 3 attempts',
            reason: 'maxRetriesExceeded',
            errors: [apiCallError({ statusCode: 503 }), apiCallError({ statusCode: 429, code: 'insufficient_quota' })]
        });

        expect(modelErrorCategory(error)).toBe('quota');
    });

    it('sorts a missing key into missing_key', () => {
        expect(modelErrorCategory(new ModelKeyMissingError())).toBe('missing_key');
    });

    it('leaves errors that did not come from the provider alone', () => {
        expect(modelErrorCategory(new Error('The MCP server closed'))).toBeNull();
        expect(modelErrorCategory('boom')).toBeNull();
    });

    it('sorts an error OpenAI throws before the reply starts', async () => {
        const model = new MockLanguageModelV4({
            doStream: () => Promise.reject(apiCallError({ statusCode: 429, code: 'insufficient_quota' }))
        });

        expect(await streamedErrorCategory(model)).toBe('quota');
    });

    it('sorts an error OpenAI sends after the reply started', async () => {
        const model = new MockLanguageModelV4({
            doStream: () =>
                Promise.resolve({
                    stream: convertArrayToReadableStream([
                        { type: 'text-start', id: '1' },
                        { type: 'text-delta', id: '1', delta: 'Hel' },
                        { type: 'error', error: { message: 'Server overloaded', type: 'server_error', statusCode: 503, isRetryable: true } }
                    ])
                })
        });

        expect(await streamedErrorCategory(model)).toBe('outage');
    });
});

describe('modelUnavailableError', () => {
    it('offers a retry only when waiting can fix it', () => {
        expect(modelUnavailableError('outage').error.retryable).toBe(true);
        expect(modelUnavailableError('rate_limit').error.retryable).toBe(true);
        expect(modelUnavailableError('quota').error.retryable).toBe(false);
        expect(modelUnavailableError('auth').error.retryable).toBe(false);
        expect(modelUnavailableError('missing_key').error.retryable).toBe(false);
    });
});
