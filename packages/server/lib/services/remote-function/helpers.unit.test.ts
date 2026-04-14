import { describe, expect, it, vi } from 'vitest';

import { RemoteFunctionError, sendStepError } from './helpers.js';

import type { Response } from 'express';

function mockResponse() {
    const status = vi.fn().mockReturnThis();
    const send = vi.fn();
    const res = { status, send } as unknown as Response;

    return { res, status, send };
}

describe('remote function helpers', () => {
    it('sends structured remote function errors with their status and code', () => {
        const { res, status, send } = mockResponse();

        sendStepError({
            res,
            error: new RemoteFunctionError({ code: 'deployment_error', message: 'Deploy failed', status: 400 })
        });

        expect(status).toHaveBeenCalledWith(400);
        expect(send).toHaveBeenCalledWith({ error: { code: 'deployment_error', message: 'Deploy failed' } });
    });

    it('does not expose arbitrary error codes as function API codes', () => {
        const { res, status, send } = mockResponse();

        sendStepError({
            res,
            error: Object.assign(new Error('Docker is unavailable'), { code: 'ENOENT' })
        });

        expect(status).toHaveBeenCalledWith(500);
        expect(send).toHaveBeenCalledWith({ error: { code: 'server_error', message: 'Docker is unavailable' } });
    });

    it('removes url origins while preserving route context', () => {
        const { res, send } = mockResponse();

        sendStepError({
            res,
            error: new Error('Fetch failed http://localhost:3003/sync/deploy?env=dev')
        });

        expect(send).toHaveBeenCalledWith({ error: { code: 'server_error', message: 'Fetch failed /sync/deploy?env=dev' } });
    });

    it('keeps sandbox project paths relative and redacts other absolute paths', () => {
        const { res, send } = mockResponse();

        sendStepError({
            res,
            error: new Error('Failed at /home/user/nango-integrations/github/syncs/foo.ts:12:3 while reading /tmp/nango-dryrun-input.json')
        });

        expect(send).toHaveBeenCalledWith({
            error: { code: 'server_error', message: 'Failed at github/syncs/foo.ts:12:3 while reading <path>' }
        });
    });
});
