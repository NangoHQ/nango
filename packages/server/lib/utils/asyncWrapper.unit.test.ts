import { describe, expect, it, vi } from 'vitest';

import { asyncWrapperWithEnvironment, requireEnvironment } from './asyncWrapper.js';

import type { RequestLocals } from './express.js';
import type { DBEnvironment, Endpoint } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

type AnyEndpoint = Endpoint<{ Method: 'GET'; Path: '/test'; Success: { ok: true } }>;

function mockReqRes(locals: Partial<RequestLocals>) {
    const res = {
        locals,
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
    };
    const req = { route: { path: '/test' }, originalUrl: '/test', header: () => undefined };
    return { req: req as unknown as Request, res: res as unknown as Response<any, RequestLocals>, spies: res };
}

describe('asyncWrapperWithEnvironment', () => {
    it('runs the handler when an environment is present', async () => {
        const environment = { id: 42 } as DBEnvironment;
        const { req, res, spies } = mockReqRes({ environment });
        const handler = vi.fn();

        await asyncWrapperWithEnvironment<AnyEndpoint>(handler)(req, res, (() => undefined) as NextFunction);

        expect(handler).toHaveBeenCalledOnce();
        expect(handler.mock.calls[0]?.[1].locals.environment).toBe(environment);
        expect(spies.status).not.toHaveBeenCalled();
    });

    it('does NOT run the handler and returns 500 when the environment is missing', async () => {
        const { req, res, spies } = mockReqRes({});
        const handler = vi.fn();

        await asyncWrapperWithEnvironment<AnyEndpoint>(handler)(req, res, (() => undefined) as NextFunction);

        expect(handler).not.toHaveBeenCalled();
        expect(spies.status).toHaveBeenCalledWith(500);
        expect(spies.send).toHaveBeenCalledWith({ error: { code: 'server_error' } });
    });

    it('routes a rejecting handler to next() rather than an unhandled rejection', async () => {
        const { req, res } = mockReqRes({ environment: { id: 1 } as DBEnvironment });
        const boom = new Error('boom');
        const next = vi.fn();

        await asyncWrapperWithEnvironment<AnyEndpoint>(() => Promise.reject(boom))(req, res, next as unknown as NextFunction);
        await vi.waitFor(() => expect(next).toHaveBeenCalledWith(boom));
    });
});

describe('requireEnvironment', () => {
    it('returns the environment when present', () => {
        const environment = { id: 7 } as DBEnvironment;
        const { req, res, spies } = mockReqRes({ environment });

        expect(requireEnvironment(req, res)).toBe(environment);
        expect(spies.status).not.toHaveBeenCalled();
    });

    it('responds 500 and returns null when absent', () => {
        const { req, res, spies } = mockReqRes({});

        expect(requireEnvironment(req, res)).toBeNull();
        expect(spies.status).toHaveBeenCalledWith(500);
        expect(spies.send).toHaveBeenCalledWith({ error: { code: 'server_error' } });
    });
});
