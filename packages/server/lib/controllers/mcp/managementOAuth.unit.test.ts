import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getManagementOAuthProtectedResourceMetadata, managementMcpAuth } from './managementOAuth.js';

import type { RequestLocals } from '../../utils/express.js';
import type * as Utils from '@nangohq/utils';
import type { NextFunction, Request, Response } from 'express';

const {
    accessTokenFindMock,
    accountGetMock,
    apiKeyAuthenticateMock,
    clientFindMock,
    environmentAccessMock,
    getPlanMock,
    grantFindMock,
    tagTraceUserMock,
    userGetMock
} = vi.hoisted(() => ({
    accessTokenFindMock: vi.fn(),
    accountGetMock: vi.fn(),
    apiKeyAuthenticateMock: vi.fn(),
    clientFindMock: vi.fn(),
    environmentAccessMock: vi.fn(),
    getPlanMock: vi.fn(),
    grantFindMock: vi.fn(),
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
    return { ...actual, flagHasPlan: true, tagTraceUser: tagTraceUserMock };
});
vi.mock('../../middleware/access.middleware.js', () => ({
    default: {
        authenticateSecretKey: apiKeyAuthenticateMock,
        secretKeyAuth: vi.fn()
    }
}));
vi.mock('./environments/list.js', () => ({ getManagementMcpEnvironments: environmentAccessMock }));
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
const environments = [{ id: 9, name: 'dev', is_production: false }];
const validAccessToken = {
    aud: 'https://mcp.nango.dev/mcp',
    accountId: '7',
    clientId: 'https://client.example.com/metadata.json',
    grantId: 'grant-id',
    scopes: new Set(['environment:*'])
};

describe('Management MCP OAuth authentication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        accessTokenFindMock.mockResolvedValue(validAccessToken);
        grantFindMock.mockResolvedValue({
            accountId: '7',
            clientId: 'https://client.example.com/metadata.json',
            getResourceScope: vi.fn(() => 'environment:*')
        });
        clientFindMock.mockResolvedValue({ clientId: 'https://client.example.com/metadata.json' });
        userGetMock.mockResolvedValue(user);
        accountGetMock.mockResolvedValue(account);
        getPlanMock.mockResolvedValue({ isErr: () => false, value: plan });
        environmentAccessMock.mockResolvedValue(environments);
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
        expect(environmentAccessMock).toHaveBeenCalledWith({ account });
        expect(res.locals).toMatchObject({
            authType: 'mcpOAuth',
            user,
            account,
            plan,
            mcpOAuthEnvironments: environments
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
    });

    it('returns insufficient_scope without API-key fallback', async () => {
        accessTokenFindMock.mockResolvedValue({ ...validAccessToken, scopes: new Set(['environment:read']) });
        const req = request('oauth-access-token');
        const { res, status, headers } = response();

        await managementMcpAuth(req, res, vi.fn());

        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(403);
        expect(headers.get('WWW-Authenticate')).toContain('error="insufficient_scope"');
    });

    it('rejects a token whose audience is not exactly the Management MCP resource', async () => {
        accessTokenFindMock.mockResolvedValue({ ...validAccessToken, aud: ['https://mcp.nango.dev/mcp', 'https://other.example.com'] });
        const req = request('oauth-access-token');
        const { res, status } = response();

        await managementMcpAuth(req, res, vi.fn());

        expect(apiKeyAuthenticateMock).not.toHaveBeenCalled();
        expect(status).toHaveBeenCalledWith(401);
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
