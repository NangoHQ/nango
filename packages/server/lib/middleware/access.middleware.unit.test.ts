import { afterEach, describe, expect, it, vi } from 'vitest';

import { accountService } from '@nangohq/shared';

import accessMiddleware from './access.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyContext, DBEnvironment, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const secretKey = '00000000-0000-4000-8000-000000000000';

const context: ApiKeyContext = {
    account: { id: 1 } as DBTeam,
    environment: { id: 10 } as DBEnvironment,
    plan: null,
    principal: { type: 'api_key', source: 'customer_key', accountId: 1, scopes: ['environment:*'], environmentIds: [10] },
    auth: { source: 'customer_key' }
};

async function runSecretKeyAuth(authorization: string | undefined) {
    const req = { get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined) } as unknown as Request;
    const res = {
        locals: {} as Partial<RequestLocals>,
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
    };
    const next = vi.fn();

    await accessMiddleware.secretKeyAuth(req, res as unknown as Response<any, Partial<RequestLocals>>, next as unknown as NextFunction);

    const sent = res.send.mock.lastCall?.[0] as { error: { code: string } } | undefined;

    return { next, status: res.status, code: sent?.error.code, locals: res.locals };
}

describe('secretKeyAuth', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('responds 500 when the account lookup throws', async () => {
        const lookup = vi
            .spyOn(accountService, 'getAccountContextByApiKey')
            .mockRejectedValue(new Error('KnexTimeoutError: Knex: Timeout acquiring a connection'));

        const { next, status, code } = await runSecretKeyAuth(`Bearer ${secretKey}`);

        expect(lookup).toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(500);
        expect(code).toBe('server_error');
        expect(next).not.toHaveBeenCalled();
    });

    it('authenticates a known key', async () => {
        vi.spyOn(accountService, 'getAccountContextByApiKey').mockResolvedValue(context);

        const { next, status, locals } = await runSecretKeyAuth(`Bearer ${secretKey}`);

        expect(next).toHaveBeenCalled();
        expect(status).not.toHaveBeenCalled();
        expect(locals.authType).toBe('secretKey');
        expect(locals.account).toStrictEqual(context.account);
        expect(locals.environment).toStrictEqual(context.environment);
        expect(locals.apiKeyPrincipal).toStrictEqual(context.principal);
    });

    it('responds 401 when the key matches no account', async () => {
        vi.spyOn(accountService, 'getAccountContextByApiKey').mockResolvedValue(null);

        const { next, status, code } = await runSecretKeyAuth(`Bearer ${secretKey}`);

        expect(status).toHaveBeenCalledWith(401);
        expect(code).toBe('unknown_account');
        expect(next).not.toHaveBeenCalled();
    });

    it.each([
        { header: undefined, expected: 'missing_auth_header' },
        { header: 'Bearer ', expected: 'malformed_auth_header' },
        { header: 'Bearer not-a-uuid', expected: 'invalid_secret_key_format' }
    ])('responds 401 $expected without looking up the key', async ({ header, expected }) => {
        const lookup = vi.spyOn(accountService, 'getAccountContextByApiKey');

        const { next, status, code } = await runSecretKeyAuth(header);

        expect(status).toHaveBeenCalledWith(401);
        expect(code).toBe(expected);
        expect(lookup).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
