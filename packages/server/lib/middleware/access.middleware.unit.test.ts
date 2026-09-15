import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { createInternalServiceToken, INTERNAL_SERVICE_AUDIENCE_SERVER, TASK_CAPABILITY_ACTIONS } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';

import { envs } from '../env.js';
import accessMiddleware from './access.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyContext, DBEnvironment, DBTeam } from '@nangohq/types';
import type { NextFunction, Request, Response } from 'express';

const secretKey = '00000000-0000-4000-8000-000000000000';
const signingKey = 'sign';
const previousSigningKey = envs.NANGO_INTERNAL_AUTH_SIGNING_KEY;
envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = signingKey;

const context: ApiKeyContext = {
    account: { id: 1 } as DBTeam,
    environment: { id: 10 } as DBEnvironment,
    plan: null,
    principal: { type: 'api_key', source: 'customer_key', accountId: 1, scopes: ['environment:*'], environmentIds: [10] },
    auth: { source: 'customer_key' }
};

async function runSecretKeyAuth(authorization: string | undefined, extras?: { isScript?: boolean; method?: string; path?: string }) {
    const req = {
        method: extras?.method ?? 'GET',
        path: extras?.path ?? '/connections/abc',
        get: (name: string) => {
            if (name.toLowerCase() === 'authorization') {
                return authorization;
            }
            if (name === 'Nango-Is-Script') {
                return extras?.isScript ? 'true' : undefined;
            }
            return undefined;
        }
    } as unknown as Request;
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
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = signingKey;
    });

    afterAll(() => {
        envs.NANGO_INTERNAL_AUTH_SIGNING_KEY = previousSigningKey;
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

    it('authenticates a script capability token for a script-allowed route', async () => {
        vi.spyOn(accountService, 'getAccountContext').mockResolvedValue({
            account: context.account,
            environment: context.environment!,
            secret: { secret: 'unused' } as never,
            plan: null
        });
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_SERVER,
                environmentId: 10,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.apiConnectionRead],
                expiresInSecs: 120
            },
            signingKey
        );

        const { next, locals } = await runSecretKeyAuth(`Bearer ${token}`, { isScript: true, method: 'GET', path: '/connections/other' });

        expect(next).toHaveBeenCalled();
        expect(locals.account).toStrictEqual(context.account);
        expect(locals.environment).toStrictEqual(context.environment);
        expect(accountService.getAccountContext).toHaveBeenCalledWith({ environmentId: 10 });
    });

    it('rejects a script capability token on a non-script route', async () => {
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_SERVER,
                environmentId: 10,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.apiConnectionRead],
                expiresInSecs: 120
            },
            signingKey
        );
        const lookup = vi.spyOn(accountService, 'getAccountContext');

        const { next, status } = await runSecretKeyAuth(`Bearer ${token}`, { isScript: true, method: 'GET', path: '/api/v1/account/api-keys' });

        expect(status).toHaveBeenCalledWith(401);
        expect(lookup).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a script capability token minted for a different environment', async () => {
        vi.spyOn(accountService, 'getAccountContext').mockResolvedValue(null);
        const token = createInternalServiceToken(
            {
                taskId: 'task-1',
                audience: INTERNAL_SERVICE_AUDIENCE_SERVER,
                environmentId: 99,
                connectionId: 42,
                actions: [TASK_CAPABILITY_ACTIONS.apiConnectionRead],
                expiresInSecs: 120
            },
            signingKey
        );

        const { next, status } = await runSecretKeyAuth(`Bearer ${token}`, { isScript: true, method: 'GET', path: '/connections/abc' });

        expect(status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
