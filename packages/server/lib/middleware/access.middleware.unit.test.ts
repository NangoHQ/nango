import { generateKeyPairSync } from 'node:crypto';

import tracer from 'dd-trace';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { INTERNAL_SERVICE_ISSUER_JOBS, mint, TASK_CAPABILITY_SCOPES, taskSubject } from '@nangohq/internal-auth';
import { accountService } from '@nangohq/shared';
import { metrics } from '@nangohq/utils';

import { envs } from '../env.js';
import accessMiddleware from './access.middleware.js';

import type { RequestLocals } from '../utils/express.js';
import type { ApiKeyContext, DBAPISecret, DBEnvironment, DBTeam } from '@nangohq/types';
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

    it('records timing when secret-key authentication is called directly', async () => {
        vi.spyOn(accountService, 'getAccountContextByApiKey').mockResolvedValue(context);
        const duration = vi.spyOn(metrics, 'duration');
        const startSpan = vi.spyOn(tracer, 'startSpan');
        const req = {
            get: (name: string) => (name.toLowerCase() === 'authorization' ? `Bearer ${secretKey}` : undefined)
        } as unknown as Request;
        const res = { locals: {} as Partial<RequestLocals> } as Response<unknown, Partial<RequestLocals>>;

        const result = await accessMiddleware.authenticateSecretKey(req, res);

        expect(result.isOk()).toBe(true);
        expect(startSpan).toHaveBeenCalledWith('secretKeyAuth', expect.any(Object));
        expect(duration).toHaveBeenCalledWith(metrics.Types.AUTH_GET_ENV_BY_SECRET_KEY, expect.any(Number), { accountId: context.account.id });
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

function ed25519Material(): { pem: string; raw: string } {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
    const raw = Buffer.from(publicKey.export({ format: 'der', type: 'spki' }))
        .subarray(12)
        .toString('base64url');
    return { pem, raw };
}

const capabilitySigner = ed25519Material();

async function capabilityToken(scopes: readonly string[]) {
    return mint(
        { iss: INTERNAL_SERVICE_ISSUER_JOBS, kid: 'jobs-2026-09', privateKey: capabilitySigner.pem },
        {
            sub: taskSubject('task-1'),
            aud: ['jobs', 'persist', 'server'],
            ttlSecs: 60,
            res: { environmentId: 10, connectionId: 3 },
            scopes
        }
    );
}

function runCapabilityAuth(authorization: string, scope?: RequestLocals['taskCapability']) {
    const req = {
        get: (name: string) => (name.toLowerCase() === 'authorization' ? authorization : undefined)
    } as unknown as Request;
    const res = {
        locals: (scope ? { taskCapability: scope } : {}) as Partial<RequestLocals>,
        status: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis()
    };
    const next = vi.fn();
    return accessMiddleware.secretKeyAuth(req, res as unknown as Response<any, Partial<RequestLocals>>, next as unknown as NextFunction).then(() => {
        const sent = res.send.mock.lastCall?.[0] as { error: { code: string } } | undefined;
        return { next, status: res.status, code: sent?.error.code, locals: res.locals };
    });
}

describe('task capability token', () => {
    const previousKeys = envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS;

    afterEach(() => {
        vi.restoreAllMocks();
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = previousKeys;
    });

    it('authenticates as the token environment when the route declares that capability', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: capabilitySigner.raw }];
        const lookup = vi.spyOn(accountService, 'getAccountContext').mockResolvedValue({
            account: { id: 1 } as DBTeam,
            environment: { id: 10 } as DBEnvironment,
            plan: null,
            secret: {} as DBAPISecret
        });
        const token = await capabilityToken([TASK_CAPABILITY_SCOPES.apiConnectionRead, TASK_CAPABILITY_SCOPES.apiProxy]);

        const { next, locals } = await runCapabilityAuth(`Bearer ${token}`, TASK_CAPABILITY_SCOPES.apiConnectionRead);

        expect(next).toHaveBeenCalled();
        expect(lookup).toHaveBeenCalledWith({ environmentId: 10 });
        expect(locals.authType).toBe('secretKey');
        expect(locals.apiKeyPrincipal).toMatchObject({
            source: 'api_secret',
            environmentIds: [10],
            scopes: ['environment:connections:read', 'environment:connections:read_credentials']
        });
    });

    it('grants the action scope when the route declares api:action:trigger', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: capabilitySigner.raw }];
        vi.spyOn(accountService, 'getAccountContext').mockResolvedValue({
            account: { id: 1 } as DBTeam,
            environment: { id: 10 } as DBEnvironment,
            plan: null,
            secret: {} as DBAPISecret
        });
        const token = await capabilityToken([TASK_CAPABILITY_SCOPES.apiActionTrigger]);

        const { next, locals } = await runCapabilityAuth(`Bearer ${token}`, TASK_CAPABILITY_SCOPES.apiActionTrigger);

        expect(next).toHaveBeenCalled();
        expect(locals.apiKeyPrincipal).toMatchObject({ scopes: ['environment:actions:execute'] });
    });

    it('rejects a task token when the route did not declare a task capability', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: capabilitySigner.raw }];
        const lookup = vi.spyOn(accountService, 'getAccountContext');
        const token = await capabilityToken([TASK_CAPABILITY_SCOPES.apiProxy, TASK_CAPABILITY_SCOPES.apiConnectionRead]);

        const { next, status, code } = await runCapabilityAuth(`Bearer ${token}`);

        expect(status).toHaveBeenCalledWith(401);
        expect(code).toBe('unknown_account');
        expect(lookup).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects a task token that lacks the capability the route declared', async () => {
        envs.NANGO_INTERNAL_AUTH_JOBS_PUBLIC_KEYS = [{ kid: 'jobs-2026-09', publicKey: capabilitySigner.raw }];
        const lookup = vi.spyOn(accountService, 'getAccountContext');
        const token = await capabilityToken([TASK_CAPABILITY_SCOPES.apiProxy]);

        const { next, status, code } = await runCapabilityAuth(`Bearer ${token}`, TASK_CAPABILITY_SCOPES.apiConnectionRead);

        expect(status).toHaveBeenCalledWith(401);
        expect(code).toBe('unknown_account');
        expect(lookup).not.toHaveBeenCalled();
        expect(next).not.toHaveBeenCalled();
    });
});
