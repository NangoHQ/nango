import { beforeEach, describe, expect, it, vi } from 'vitest';

import { metrics } from '@nangohq/utils';

import { getManagementOAuthProtectedResourceMetadata, managementMcpAuth } from './managementOAuth.js';

import type { RequestLocals } from '../../utils/express.js';
import type * as Utils from '@nangohq/utils';
import type { NextFunction, Request, Response } from 'express';

const {
    accessTokenFindMock,
    accountGetMock,
    apiKeyAuthenticateMock,
    clientFindMock,
    getPlanMock,
    grantFindMock,
    metricsIncrementMock,
    tagTraceUserMock,
    userGetMock
} = vi.hoisted(() => ({
    accessTokenFindMock: vi.fn(),
    accountGetMock: vi.fn(),
    apiKeyAuthenticateMock: vi.fn(),
    clientFindMock: vi.fn(),
    getPlanMock: vi.fn(),
    grantFindMock: vi.fn(),
    metricsIncrementMock: vi.fn(),
    tagTraceUserMock: vi.fn(),
    userGetMock: vi.fn()
}));

vi.mock('@nangohq/database', () => ({ default: { knex: vi.fn() } }));
vi.mock('@nangohq/shared', () => ({
    accountService: { getAccountById: accountGetMock },
    getPlan: getPlanMock,
    userService: { getUserById: userGetMock }
}));
vi.mock('@nangohq/utils', async (importOriginal) => {
    const actual = await importOriginal<typeof Utils>();
    return { ...actual, flagHasPlan: true, metrics: { ...actual.metrics, increment: metricsIncrementMock }, tagTraceUser: tagTraceUserMock };
});
vi.mock('../../middleware/access.middleware.js', () => ({
    default: {
        authenticateSecretKey: apiKeyAuthenticateMock,
        secretKeyAuth: vi.fn()
    }
}));
vi.mock('../../oauth/server.js', () => ({
    oauthServerConfig: {
        config: { baseUrl: 'https://login.nango.dev', encryptionKey: 'test-encryption-key' },
        resource: { resource: 'https://mcp.nango.dev/mcp', scopes: ['environment:*'] }
    },
    oauthServer: {
        AccessToken: { find: accessTokenFindMock },
        Grant: { find: grantFindMock },
        Client: { find: clientFindMock }
    }
}));

const user = { id: 7, account_id: 42, email: 'user@example.com', suspended: false };
const account = { id: 42, uuid: 'account-uuid', name: 'Test account' };
const plan = { id: 3, account_id: 42, has_rbac: true };
const validAccessToken = {
    aud: 'https://mcp.nango.dev/mcp',
    accountId: '7',
    clientId: 'https://client.example.com/metadata.json',
    grantId: 'grant-id',
    scopes: new Set(['environment:*'])
};

function validGrant(overrides: Record<string, unknown> = {}) {
    return {
        accountId: '7',
        clientId: 'https://client.example.com/metadata.json',
        getResourceScope: vi.fn(() => 'environment:*'),
        ...overrides
    };
}

describe('Management MCP OAuth authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        accessTokenFindMock.mockResolvedValue(validAccessToken);
        grantFindMock.mockResolvedValue(validGrant());
        clientFindMock.mockResolvedValue({ clientId: 'https://client.example.com/metadata.json' });
        userGetMock.mockResolvedValue(user);
        accountGetMock.mockResolvedValue(account);
        getPlanMock.mockResolvedValue({ isErr: () => false, value: plan });
        apiKeyAuthenticateMock.mockResolvedValue({ isOk: () => false });
    });

    it('publishes the protected-resource metadata for the exact MCP resource', () => {
        const { res, status, json } = response();

        void getManagementOAuthProtectedResourceMetadata({} as Request, res, vi.fn());

        expect(status).toHaveBeenCalledWith(200);
        expect(json).toHaveBeenCalledWith({
            resource: 'https://mcp.nango.dev/mcp',
            authorization_servers: ['https://login.nango.dev'],
            scopes_supported: ['environment:*'],
            bearer_methods_supported: ['header'],
            resource_name: 'Nango Management MCP server'
        });
    });

    it('authenticates a valid OAuth access token and resolves live user access', async () => {
        const req = request('oauth-access-token');
        const { res } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(req, res, next);

        expect(next).toHaveBeenCalledOnce();
        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(res.locals).toMatchObject({
            authType: 'mcpOAuth',
            user,
            account,
            plan
        });
        expect(tagTraceUserMock).toHaveBeenCalledWith({ account, plan });
    });

    it.each(['bearer', 'BEARER'])('accepts the %s authorization scheme case-insensitively', async (scheme) => {
        const req = request('oauth-access-token', scheme);
        const { res } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(req, res, next);

        expect(accessTokenFindMock).toHaveBeenCalledWith('oauth-access-token');
        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(next).toHaveBeenCalledOnce();
    });

    it('falls back to API-key authentication when no active OAuth token is found', async () => {
        accessTokenFindMock.mockResolvedValue(undefined);
        apiKeyAuthenticateMock.mockResolvedValue({ isOk: () => true });
        const req = request('api-key');
        const { res } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(req, res, next);

        expect(apiKeyAuthenticateMock).toHaveBeenCalledOnce();
        expect(next).toHaveBeenCalledOnce();
    });

    it('returns a generic challenge when a token matches neither an active OAuth token nor an API key', async () => {
        accessTokenFindMock.mockResolvedValue(undefined);
        const req = request('inactive-or-unknown-token');
        const { res, status, json, headers } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(req, res, next);

        expect(apiKeyAuthenticateMock).toHaveBeenCalledOnce();
        expect(next).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
        expect(headers.get('WWW-Authenticate')).toBe(
            'Bearer resource_metadata="https://mcp.nango.dev/.well-known/oauth-protected-resource/mcp", scope="environment:*"'
        );
        expect(metricsIncrementMock).toHaveBeenCalledWith(metrics.Types.MCP_AUTH_FAILURE, 1, {
            mcp_type: 'management',
            reason: 'unauthorized'
        });
    });

    it('returns insufficient_scope without API-key fallback', async () => {
        accessTokenFindMock.mockResolvedValue({ ...validAccessToken, scopes: new Set(['environment:read']) });
        const req = request('oauth-access-token');
        const { res, status, headers } = response();

        await managementMcpAuth(req, res, vi.fn());

        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(headers.get('WWW-Authenticate')).toContain('error="insufficient_scope"');
        expect(metricsIncrementMock).toHaveBeenCalledWith(metrics.Types.MCP_AUTH_FAILURE, 1, {
            mcp_type: 'management',
            reason: 'insufficient_scope'
        });
    });

    it('rejects a token whose audience is not exactly the Management MCP resource', async () => {
        accessTokenFindMock.mockResolvedValue({ ...validAccessToken, aud: ['https://mcp.nango.dev/mcp', 'https://other.example.com'] });
        const req = request('oauth-access-token');
        const { res, status } = response();

        await managementMcpAuth(req, res, vi.fn());

        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(401);
        expect(metricsIncrementMock).toHaveBeenCalledWith(metrics.Types.MCP_AUTH_FAILURE, 1, {
            mcp_type: 'management',
            reason: 'invalid_token'
        });
    });

    it.each(['grantId', 'clientId', 'accountId'] as const)('rejects a token missing %s', async (field) => {
        accessTokenFindMock.mockResolvedValue({ ...validAccessToken, [field]: undefined });

        await expectInvalidOAuthTokenChallenge();

        expect(grantFindMock).not.toHaveBeenCalled();
        expect(clientFindMock).not.toHaveBeenCalled();
    });

    it.each([
        {
            name: 'missing grant',
            arrange: () => grantFindMock.mockResolvedValue(undefined)
        },
        {
            name: 'missing client',
            arrange: () => clientFindMock.mockResolvedValue(undefined)
        },
        {
            name: 'grant client mismatch',
            arrange: () => grantFindMock.mockResolvedValue(validGrant({ clientId: 'https://other.example.com/metadata.json' }))
        },
        {
            name: 'resolved client mismatch',
            arrange: () => clientFindMock.mockResolvedValue({ clientId: 'https://other.example.com/metadata.json' })
        },
        {
            name: 'grant account mismatch',
            arrange: () => grantFindMock.mockResolvedValue(validGrant({ accountId: '8' }))
        },
        {
            name: 'missing granted scope',
            arrange: () => grantFindMock.mockResolvedValue(validGrant({ getResourceScope: vi.fn(() => 'environment:settings:read') }))
        }
    ])('rejects persisted authorization with $name', async ({ arrange }) => {
        arrange();

        await expectInvalidOAuthTokenChallenge();
    });

    it.each([
        { name: 'unknown user', arrange: () => userGetMock.mockResolvedValue(null) },
        { name: 'unknown account', arrange: () => accountGetMock.mockResolvedValue(null) }
    ])('rejects a token for an $name', async ({ arrange }) => {
        arrange();

        await expectInvalidOAuthTokenChallenge();
    });

    it('propagates grant storage failures instead of challenging a valid token', async () => {
        const grantError = new Error('Failed to decrypt grant');
        grantFindMock.mockRejectedValue(grantError);
        const { res, status } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(request('oauth-access-token'), res, next);

        expect(next).toHaveBeenCalledWith(grantError);
        expect(status).not.toHaveBeenCalled();
        expect(clientFindMock).not.toHaveBeenCalled();
        expect(metricsIncrementMock).not.toHaveBeenCalled();
    });

    it('rejects a token when its CIMD client can no longer be resolved', async () => {
        clientFindMock.mockRejectedValue(new Error('Client metadata unavailable'));

        await expectInvalidOAuthTokenChallenge();
    });

    it('propagates plan lookup failures instead of challenging a valid token', async () => {
        const planError = new Error('Failed to load plan');
        getPlanMock.mockResolvedValue({ isErr: () => true, error: planError });
        const { res, status } = response();
        const next = vi.fn() as NextFunction;

        await managementMcpAuth(request('oauth-access-token'), res, next);

        expect(next).toHaveBeenCalledWith(planError);
        expect(status).not.toHaveBeenCalled();
        expect(metricsIncrementMock).not.toHaveBeenCalled();
    });

    it('challenges requests without an accepted credential', async () => {
        const { res, status, json, headers } = response();

        await managementMcpAuth(request(), res, vi.fn());

        expect(status).toHaveBeenCalledWith(401);
        expect(json).toHaveBeenCalledWith({ error: 'unauthorized' });
        expect(headers.get('WWW-Authenticate')).toBe(
            'Bearer resource_metadata="https://mcp.nango.dev/.well-known/oauth-protected-resource/mcp", scope="environment:*"'
        );
    });
});

function request(token?: string, scheme = 'Bearer'): Request {
    return {
        get: vi.fn((name: string) => (name.toLowerCase() === 'authorization' && token ? `${scheme} ${token}` : undefined))
    } as unknown as Request;
}

async function expectInvalidOAuthTokenChallenge(): Promise<void> {
    const { res, status, headers } = response();
    const next = vi.fn() as NextFunction;

    await managementMcpAuth(request('oauth-access-token'), res, next);

    expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(401);
    expect(headers.get('WWW-Authenticate')).toContain('error="invalid_token"');
    expect(metricsIncrementMock).toHaveBeenCalledWith(metrics.Types.MCP_AUTH_FAILURE, 1, {
        mcp_type: 'management',
        reason: 'invalid_token'
    });
}

function response(): {
    res: Response<unknown, Partial<RequestLocals>>;
    headers: Map<string, string>;
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
} {
    const headers = new Map<string, string>();
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    const res = {
        locals: {},
        setHeader: vi.fn((name: string, value: string) => headers.set(name, value)),
        status,
        json
    } as unknown as Response<unknown, Partial<RequestLocals>>;
    return { res, headers, status, json };
}
