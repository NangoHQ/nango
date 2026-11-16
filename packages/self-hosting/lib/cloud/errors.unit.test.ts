import tracer from 'dd-trace';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../utils.js';
import { sendError } from './errors.js';

import type { ApiError } from '@nangohq/types';
import type { Response } from 'express';

function send(error: Parameters<typeof sendError<string>>[1]) {
    const setTag = vi.fn();
    const addTags = vi.fn();
    vi.spyOn(tracer, 'scope').mockReturnValue({ active: () => ({ setTag, addTags }) } as unknown as ReturnType<typeof tracer.scope>);
    const logError = vi.spyOn(logger, 'error').mockReturnValue(undefined as never);
    const logWarning = vi.spyOn(logger, 'warning').mockReturnValue(undefined as never);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    sendError({ status } as unknown as Response<ApiError<string>>, error);

    return { setTag, addTags, logError, logWarning, status, json };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('sendError', () => {
    it('answers, logs an error and marks the span as failed with the cause, for a failure of ours', () => {
        const cause = new Error('connection reset');

        const { setTag, addTags, logError, logWarning, status, json } = send({
            status: 500,
            code: 'insert_failed',
            message: 'the upload could not be stored',
            context: { installationId: 'i-1' },
            cause
        });

        expect(status).toHaveBeenCalledExactlyOnceWith(500);
        expect(json).toHaveBeenCalledExactlyOnceWith({ error: { code: 'insert_failed', message: 'the upload could not be stored' } });
        expect(addTags).toHaveBeenCalledExactlyOnceWith({ 'nango.errorCode': 'insert_failed', 'nango.errorMessage': 'the upload could not be stored' });
        expect(setTag).toHaveBeenCalledExactlyOnceWith('error', cause);
        expect(logError).toHaveBeenCalledExactlyOnceWith('insert_failed: the upload could not be stored', { installationId: 'i-1' }, cause);
        expect(logWarning).not.toHaveBeenCalled();
    });

    it('tags the span with the reason but does not mark it as failed, and only warns, for a client error', () => {
        const { setTag, addTags, logError, logWarning, status } = send({
            status: 401,
            code: 'clock_skew',
            message: 'the token was minted 20 minutes ago',
            context: { kid: 'k-1' }
        });

        expect(status).toHaveBeenCalledExactlyOnceWith(401);
        expect(addTags).toHaveBeenCalledExactlyOnceWith({ 'nango.errorCode': 'clock_skew', 'nango.errorMessage': 'the token was minted 20 minutes ago' });
        expect(setTag).not.toHaveBeenCalled();
        expect(logWarning).toHaveBeenCalledExactlyOnceWith('clock_skew: the token was minted 20 minutes ago', { kid: 'k-1' }, undefined);
        expect(logError).not.toHaveBeenCalled();
    });

    it('marks the span as failed with the code and the message when a failure of ours has no cause', () => {
        const { setTag } = send({ status: 500, code: 'server_error', message: 'something broke' });

        expect(setTag).toHaveBeenCalledExactlyOnceWith('error', new Error('server_error: something broke'));
    });
});
