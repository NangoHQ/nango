import tracer from 'dd-trace';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logger } from '../utils.js';
import { sendError } from './errors.js';

import type { ApiError } from '@nangohq/types';
import type { Response } from 'express';

function send(error: Parameters<typeof sendError<string>>[1]) {
    const setTag = vi.fn();
    vi.spyOn(tracer, 'scope').mockReturnValue({ active: () => ({ setTag }) } as unknown as ReturnType<typeof tracer.scope>);
    const logError = vi.spyOn(logger, 'error').mockReturnValue(undefined as never);
    const logWarning = vi.spyOn(logger, 'warning').mockReturnValue(undefined as never);
    const json = vi.fn();
    const status = vi.fn(() => ({ json }));

    sendError({ status } as unknown as Response<ApiError<string>>, error);

    return { setTag, logError, logWarning, status, json };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('sendError', () => {
    it('answers, logs an error and marks the span with what failed on our side', () => {
        const cause = new Error('connection reset');

        const { setTag, logError, logWarning, status, json } = send({
            status: 500,
            code: 'insert_failed',
            message: 'the upload could not be stored',
            context: { installationId: 'i-1' },
            cause
        });

        expect(status).toHaveBeenCalledExactlyOnceWith(500);
        expect(json).toHaveBeenCalledExactlyOnceWith({ error: { code: 'insert_failed', message: 'the upload could not be stored' } });
        expect(setTag).toHaveBeenCalledExactlyOnceWith('error', cause);
        expect(logError).toHaveBeenCalledExactlyOnceWith('insert_failed: the upload could not be stored', { installationId: 'i-1' }, cause);
        expect(logWarning).not.toHaveBeenCalled();
    });

    it('marks the span with the code and the message when nothing was thrown, and only warns on a client error', () => {
        const { setTag, logError, logWarning, status } = send({
            status: 401,
            code: 'clock_skew',
            message: 'the token was minted 20 minutes ago',
            context: { kid: 'k-1' }
        });

        expect(status).toHaveBeenCalledExactlyOnceWith(401);
        expect(setTag).toHaveBeenCalledExactlyOnceWith('error', new Error('clock_skew: the token was minted 20 minutes ago'));
        expect(logWarning).toHaveBeenCalledExactlyOnceWith('clock_skew: the token was minted 20 minutes ago', { kid: 'k-1' }, undefined);
        expect(logError).not.toHaveBeenCalled();
    });
});
