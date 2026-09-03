import crypto from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import type { authenticateUser as authenticateUserType, runServer as runServerType } from '../../utils/tests.js';
import type database from '@nangohq/database';
import type { seeders as seedersType } from '@nangohq/shared';

type AuthenticateUser = typeof authenticateUserType;
type RunServer = typeof runServerType;

interface TokenResponse {
    access_token: string;
    refresh_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

const RESOURCE = 'http://localhost:3003/mcp';
const ISSUER = 'http://localhost:3003/oauth/management-mcp';
let api: Awaited<ReturnType<RunServer>>;
let db: typeof database;
let seeders: typeof seedersType;
let authenticateUser: AuthenticateUser;
let originalEnv: Record<string, string | undefined>;
let flags: { hasAuthRoles: boolean };
let originalHasAuthRoles: boolean;

describe('management MCP OAuth authorization server', () => {
    beforeAll(async () => {
        originalEnv = {
            NANGO_MANAGEMENT_MCP_SERVER_URL: process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'],
            NANGO_MANAGEMENT_MCP_OAUTH_ENABLED: process.env['NANGO_MANAGEMENT_MCP_OAUTH_ENABLED'],
            NANGO_MANAGEMENT_MCP_OAUTH_ISSUER: process.env['NANGO_MANAGEMENT_MCP_OAUTH_ISSUER'],
            NANGO_PUBLIC_SERVER_URL: process.env['NANGO_PUBLIC_SERVER_URL'],
            NANGO_SERVER_URL: process.env['NANGO_SERVER_URL']
        };
        process.env['NANGO_MANAGEMENT_MCP_SERVER_URL'] = 'http://localhost:3003';
        process.env['NANGO_MANAGEMENT_MCP_OAUTH_ENABLED'] = 'true';
        process.env['NANGO_MANAGEMENT_MCP_OAUTH_ISSUER'] = ISSUER;
        process.env['NANGO_PUBLIC_SERVER_URL'] = 'http://localhost:3000';
        process.env['NANGO_SERVER_URL'] = 'http://localhost:3003';

        vi.resetModules();
        db = (await import('@nangohq/database')).default;
        seeders = (await import('@nangohq/shared')).seeders;
        const tests = await import('../../utils/tests.js');
        flags = (await import('@nangohq/utils')).flags;
        originalHasAuthRoles = flags.hasAuthRoles;
        authenticateUser = tests.authenticateUser;
        api = await tests.runServer();
    }, 60_000);

    afterAll(() => {
        api?.server.close();
        flags.hasAuthRoles = originalHasAuthRoles;
        for (const [key, value] of Object.entries(originalEnv)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    });

    it('publishes OAuth and protected-resource metadata', async () => {
        const authorizationMetadata = await fetch(`${api.url}/.well-known/oauth-authorization-server/oauth/management-mcp`);
        expect(authorizationMetadata.status).toBe(200);
        await expect(authorizationMetadata.json()).resolves.toMatchObject({
            issuer: ISSUER,
            authorization_endpoint: `${ISSUER}/authorize`,
            token_endpoint: `${ISSUER}/token`,
            registration_endpoint: `${ISSUER}/register`,
            revocation_endpoint: `${ISSUER}/revoke`,
            code_challenge_methods_supported: ['S256'],
            client_id_metadata_document_supported: true
        });

        const openIdMetadata = await fetch(`${api.url}/oauth/management-mcp/.well-known/openid-configuration`);
        expect(openIdMetadata.status).toBe(200);
        await expect(openIdMetadata.json()).resolves.toMatchObject({ client_id_metadata_document_supported: true });

        const protectedResource = await fetch(`${api.url}/.well-known/oauth-protected-resource/mcp`, { headers: { Host: 'localhost:3003' } });
        expect(protectedResource.status).toBe(200);
        await expect(protectedResource.json()).resolves.toMatchObject({
            resource: RESOURCE,
            authorization_servers: [ISSUER],
            scopes_supported: ['environment:*']
        });
    });

    it('rejects unsafe dynamic client redirects', async () => {
        const response = await registerClient(['http://example.com/callback']);
        expect(response.status).toBe(400);
        await expect(response.json()).resolves.toMatchObject({ error: 'invalid_redirect_uri' });
    });

    it('resolves an unregistered client through CIMD', async () => {
        const clientId = 'https://1.1.1.1/nango-management-mcp-client.json';
        const redirectUri = 'http://127.0.0.1:49153/callback';
        const nativeFetch = globalThis.fetch;
        const metadataFetch = vi.fn((input: string | URL | Request) => {
            const requestUrl = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            if (requestUrl !== clientId) {
                throw new Error(`Unexpected CIMD fetch: ${requestUrl}`);
            }
            return new Response(
                JSON.stringify({
                    client_id: clientId,
                    client_name: 'CIMD integration test client',
                    application_type: 'native',
                    redirect_uris: [redirectUri],
                    token_endpoint_auth_method: 'none',
                    grant_types: ['authorization_code', 'refresh_token'],
                    response_types: ['code']
                }),
                { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' } }
            );
        });
        vi.stubGlobal('fetch', metadataFetch);

        try {
            const { getManagementMcpOAuthProvider } = await import('./oauth/provider.js');
            const provider = getManagementMcpOAuthProvider();
            if (!provider) {
                throw new Error('OAuth provider was not initialized');
            }

            const client = await provider.Client.find(clientId);
            expect(client?.metadata()).toMatchObject({
                client_id: clientId,
                client_name: 'CIMD integration test client',
                redirect_uris: [redirectUri]
            });
            await expect(provider.Client.find(clientId)).resolves.toBeTruthy();
            expect(metadataFetch).toHaveBeenCalledOnce();
        } finally {
            vi.stubGlobal('fetch', nativeFetch);
        }
    });

    it('completes code, refresh, MCP, and revocation flows without storing raw credentials', async () => {
        const { user, account, env: devEnvironment } = await seeders.seedAccountEnvAndUser();
        const prodEnvironment = await seeders.createEnvironmentSeed(account.id, 'prod');
        const excludedEnvironment = await seeders.createEnvironmentSeed(account.id, 'excluded');
        const redirectUri = 'http://127.0.0.1:49152/callback';
        const registration = await registerClient([redirectUri]);
        const registrationBody = (await registration.json()) as { client_id: string; error?: string; error_description?: string };
        expect(registration.status, JSON.stringify(registrationBody)).toBe(201);
        const client = registrationBody;

        const verifier = crypto.randomBytes(32).toString('base64url');
        const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
        const authorizeUrl = new URL('/oauth/management-mcp/authorize', api.url);
        const authorizeParams = new URLSearchParams({
            response_type: 'code',
            client_id: client.client_id,
            redirect_uri: redirectUri,
            state: 'test-state',
            scope: 'environment:*',
            code_challenge: challenge,
            code_challenge_method: 'S256'
        });
        authorizeParams.append('resource', RESOURCE);
        authorizeParams.append('resource', RESOURCE);
        authorizeUrl.search = authorizeParams.toString();

        const jar = new CookieJar();
        const authorization = await fetch(authorizeUrl, { redirect: 'manual' });
        jar.add(authorization.headers);
        expect(authorization.status).toBe(303);
        const interactionLocation = authorization.headers.get('location');
        expect(interactionLocation).toContain('/oauth/authorize?interaction=');
        if (!interactionLocation) {
            throw new Error('Authorization did not return an interaction location');
        }
        const interactionId = new URL(interactionLocation).searchParams.get('interaction');
        if (!interactionId) {
            throw new Error('Authorization did not return an interaction ID');
        }

        jar.addCookie(await authenticateUser(api, user));
        const detailsResponse = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}`, {
            headers: { Cookie: jar.header() }
        });
        expect(detailsResponse.status).toBe(200);
        const details = (await detailsResponse.json()) as {
            csrfToken: string;
            scope: string;
            environments: { id: number; name: string; isProduction: boolean }[];
        };
        expect(details.scope).toBe('environment:*');
        expect(details.environments.map(({ id, name }) => ({ id, name }))).toEqual([
            { id: devEnvironment.id, name: 'dev' },
            { id: excludedEnvironment.id, name: 'excluded' },
            { id: prodEnvironment.id, name: 'prod' }
        ]);

        const preflight = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}/approve`, {
            method: 'OPTIONS',
            headers: { Origin: 'http://localhost:3000', 'Access-Control-Request-Method': 'POST' }
        });
        expect(preflight.status).toBe(204);
        expect(preflight.headers.get('access-control-allow-origin')).toBe('http://localhost:3000');

        const invalidOrigin = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}/approve`, {
            method: 'POST',
            headers: { Cookie: jar.header(), Origin: 'http://attacker.example', 'Content-Type': 'application/json' },
            body: JSON.stringify({ csrfToken: details.csrfToken })
        });
        expect(invalidOrigin.status).toBe(403);

        const invalidCsrf = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}/approve`, {
            method: 'POST',
            headers: { Cookie: jar.header(), Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
            body: JSON.stringify({ csrfToken: 'invalid', environmentIds: [devEnvironment.id, prodEnvironment.id] })
        });
        expect(invalidCsrf.status).toBe(403);

        const invalidEnvironments = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}/approve`, {
            method: 'POST',
            headers: { Cookie: jar.header(), Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
            body: JSON.stringify({ csrfToken: details.csrfToken, environmentIds: [devEnvironment.id, 2_147_483_647] })
        });
        expect(invalidEnvironments.status).toBe(403);
        await expect(invalidEnvironments.json()).resolves.toMatchObject({ error: { code: 'invalid_environments' } });

        const approval = await fetch(`${api.url}/oauth/management-mcp/interaction/${interactionId}/approve`, {
            method: 'POST',
            headers: { Cookie: jar.header(), Origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
            body: JSON.stringify({ csrfToken: details.csrfToken, environmentIds: [devEnvironment.id, prodEnvironment.id] })
        });
        jar.add(approval.headers);
        expect(approval.status).toBe(200);
        const { redirectTo } = (await approval.json()) as { redirectTo: string };

        const resumed = await fetch(remapToTestServer(redirectTo), { headers: { Cookie: jar.header() }, redirect: 'manual' });
        jar.add(resumed.headers);
        expect(resumed.status).toBe(303);
        const callbackLocation = resumed.headers.get('location');
        if (!callbackLocation) {
            throw new Error('Authorization did not return a client callback');
        }
        const callback = new URL(callbackLocation);
        const latestInteraction = await db
            .knex('_nango_mcp_oauth_provider_artifacts')
            .select('payload')
            .where({ model: 'Interaction' })
            .orderBy('created_at', 'desc')
            .first();
        expect(callback.origin + callback.pathname, JSON.stringify(latestInteraction?.payload?.prompt)).toBe(redirectUri);
        expect(callback.searchParams.get('state')).toBe('test-state');
        const code = callback.searchParams.get('code');
        if (!code) {
            throw new Error('Authorization callback did not contain a code');
        }

        const tokens = await exchangeToken({
            grant_type: 'authorization_code',
            code,
            client_id: client.client_id,
            redirect_uri: redirectUri,
            code_verifier: verifier,
            resource: [RESOURCE, RESOURCE]
        });
        expect(tokens).toMatchObject({ token_type: 'Bearer', scope: 'environment:*' });
        expect(tokens.access_token).toBeTruthy();
        expect(tokens.refresh_token).toBeTruthy();

        const rows = await db.knex('_nango_mcp_oauth_provider_artifacts').select('payload', 'artifact_id_encrypted');
        expect(JSON.stringify(rows)).not.toContain(tokens.access_token);
        expect(JSON.stringify(rows)).not.toContain(tokens.refresh_token);
        expect(rows.every((row: { payload: Record<string, unknown> }) => !('jti' in row.payload))).toBe(true);

        const { getManagementMcpOAuthProvider } = await import('./oauth/provider.js');
        const { ManagementMcpOAuthAdapter } = await import('./oauth/adapter.js');
        const provider = getManagementMcpOAuthProvider();
        if (!provider) {
            throw new Error('OAuth provider was not initialized');
        }
        const adapterPayload = await new ManagementMcpOAuthAdapter('AccessToken', 'nango-management-mcp-oauth-development-storage-key').find(
            tokens.access_token
        );
        const foundAccessToken = await provider.AccessToken.find(tokens.access_token);
        expect(foundAccessToken, JSON.stringify(adapterPayload)).toBeTruthy();

        const tools = await mcpRequest(tokens.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
        const accessTokenRow = await db
            .knex('_nango_mcp_oauth_provider_artifacts')
            .select('payload')
            .where({ model: 'AccessToken' })
            .orderBy('created_at', 'desc')
            .first();
        const nangoGrant = await db.knex('_nango_mcp_oauth_grants').select('*').orderBy('created_at', 'desc').first();
        const grantEnvironments = await db
            .knex('_nango_mcp_oauth_grant_environments')
            .select('environment_id')
            .where({ grant_id: nangoGrant.grant_id })
            .orderBy('environment_id', 'asc');
        expect(
            tools.status,
            JSON.stringify({ body: tools.json, challenge: tools.headers.get('www-authenticate'), token: accessTokenRow?.payload, grant: nangoGrant })
        ).toBe(200);
        expect(grantEnvironments).toEqual(
            [devEnvironment.id, prodEnvironment.id].sort((left, right) => left - right).map((environmentId) => ({ environment_id: environmentId }))
        );
        const toolsBody = tools.json as { result: { tools: { name: string; inputSchema: { required?: string[] } }[] } };
        expect(toolsBody.result.tools.map((tool) => tool.name)).toEqual([
            'docs_search',
            'docs_query_filesystem',
            'providers_get',
            'environments_list',
            'connect_session_create',
            'integrations_list',
            'integrations_get',
            'integrations_create',
            'integrations_update',
            'integrations_delete',
            'connections_list',
            'connections_get',
            'syncs_set_state',
            'syncs_trigger',
            'actions_trigger',
            'proxy_request',
            'functions_list',
            'deploy_function',
            'deploy_template',
            'get_deployment_status',
            'logs_list_operations',
            'logs_get_operation'
        ]);
        expect(toolsBody.result.tools.find((tool) => tool.name === 'docs_search')?.inputSchema.required ?? []).not.toContain('environment');
        expect(toolsBody.result.tools.find((tool) => tool.name === 'environments_list')?.inputSchema.required ?? []).not.toContain('environment');
        expect(toolsBody.result.tools.find((tool) => tool.name === 'logs_list_operations')?.inputSchema.required).toContain('environment');

        const environmentsList = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 3,
            method: 'tools/call',
            params: { name: 'environments_list', arguments: {} }
        });
        expect(environmentsList.status).toBe(200);
        expect(environmentsList.json).toMatchObject({
            result: {
                structuredContent: {
                    environments: [
                        { name: 'dev', is_production: false },
                        { name: 'prod', is_production: true }
                    ]
                }
            }
        });

        flags.hasAuthRoles = true;
        await db.knex('plans').where({ account_id: account.id }).update({ has_rbac: true });
        await db.knex('_nango_users').where({ id: user.id }).update({ role: 'production_support' });

        const toolsForProductionSupport = await mcpRequest(tokens.access_token, { jsonrpc: '2.0', id: 31, method: 'tools/list' });
        expect((toolsForProductionSupport.json as { result: { tools: { name: string }[] } }).result.tools.map((tool) => tool.name)).toEqual(
            toolsBody.result.tools.map((tool) => tool.name)
        );

        const readableProductionTool = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 32,
            method: 'tools/call',
            params: { name: 'integrations_list', arguments: { environment: prodEnvironment.name } }
        });
        expect(readableProductionTool.json).not.toMatchObject({ result: { isError: true } });

        const forbiddenProductionTool = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 33,
            method: 'tools/call',
            params: { name: 'integrations_delete', arguments: { environment: prodEnvironment.name, integration_id: 'github' } }
        });
        expect(forbiddenProductionTool.json).toMatchObject({ result: { isError: true } });
        expect(JSON.stringify(forbiddenProductionTool.json)).toContain('do not have permission');

        await db.knex('_nango_users').where({ id: user.id }).update({ role: 'development_full_access' });
        const environmentsAfterRoleDowngrade = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 34,
            method: 'tools/call',
            params: { name: 'environments_list', arguments: {} }
        });
        expect(environmentsAfterRoleDowngrade.json).toMatchObject({
            result: { structuredContent: { environments: [{ name: 'dev' }] } }
        });

        await db.knex('_nango_users').where({ id: user.id }).update({ role: 'administrator' });
        flags.hasAuthRoles = originalHasAuthRoles;

        const authorizedCall = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 4,
            method: 'tools/call',
            params: { name: 'logs_list_operations', arguments: { environment: devEnvironment.name } }
        });
        expect(authorizedCall.status).toBe(200);
        expect(authorizedCall.json).not.toMatchObject({ result: { isError: true } });

        const excludedCall = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 5,
            method: 'tools/call',
            params: { name: 'logs_list_operations', arguments: { environment: excludedEnvironment.name } }
        });
        expect(excludedCall.status).toBe(200);
        expect(excludedCall.json).toMatchObject({ result: { isError: true } });
        expect(JSON.stringify(excludedCall.json)).toContain('not authorized for this OAuth session');

        const addedAfterConsent = await seeders.createEnvironmentSeed(account.id, 'added-after-consent');
        const futureEnvironmentCall = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 6,
            method: 'tools/call',
            params: { name: 'logs_list_operations', arguments: { environment: addedAfterConsent.name } }
        });
        expect(futureEnvironmentCall.status).toBe(200);
        expect(futureEnvironmentCall.json).toMatchObject({ result: { isError: true } });

        const queryCannotExpandGrant = await mcpRequest(tokens.access_token, { jsonrpc: '2.0', id: 7, method: 'tools/list' }, excludedEnvironment.name);
        expect(queryCannotExpandGrant.status).toBe(200);

        await db.knex('_nango_environments').where({ id: prodEnvironment.id }).update({ deleted: true, deleted_at: new Date() });
        const afterEnvironmentDeletion = await mcpRequest(tokens.access_token, {
            jsonrpc: '2.0',
            id: 8,
            method: 'tools/call',
            params: { name: 'environments_list', arguments: {} }
        });
        expect(afterEnvironmentDeletion.json).toMatchObject({
            result: { structuredContent: { environments: [{ name: 'dev' }] } }
        });

        await expectTokenError(
            {
                grant_type: 'refresh_token',
                refresh_token: tokens.refresh_token,
                client_id: client.client_id
            },
            'invalid_target'
        );

        const refreshed = await exchangeToken({
            grant_type: 'refresh_token',
            refresh_token: tokens.refresh_token,
            client_id: client.client_id,
            resource: [RESOURCE, RESOURCE]
        });
        expect(refreshed.access_token).not.toBe(tokens.access_token);
        expect(refreshed.refresh_token).not.toBe(tokens.refresh_token);

        const refreshedEnvironments = await mcpRequest(refreshed.access_token, {
            jsonrpc: '2.0',
            id: 9,
            method: 'tools/call',
            params: { name: 'environments_list', arguments: {} }
        });
        expect(refreshedEnvironments.json).toMatchObject({
            result: { structuredContent: { environments: [{ name: 'dev' }] } }
        });

        const revocation = await fetch(`${api.url}/oauth/management-mcp/revoke`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ token: refreshed.refresh_token, token_type_hint: 'refresh_token', client_id: client.client_id })
        });
        expect(revocation.status).toBe(200);

        const revoked = await mcpRequest(refreshed.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
        expect(revoked.status).toBe(401);
        expect(revoked.headers.get('www-authenticate')).toContain('error="invalid_token"');
    });

    it('revokes active grants by operator selector', async () => {
        const { user, account, env } = await seeders.seedAccountEnvAndUser();
        const grantId = crypto.randomBytes(32).toString('base64url');
        const accessToken = crypto.randomBytes(32).toString('base64url');
        const storageKey = 'nango-management-mcp-oauth-development-storage-key';
        const { ManagementMcpOAuthAdapter } = await import('./oauth/adapter.js');
        const { activateManagementMcpOAuthGrant, createPendingManagementMcpOAuthGrant, revokeManagementMcpOAuthGrants } = await import('./oauth/grant.js');

        await createPendingManagementMcpOAuthGrant({
            grantId,
            userId: user.id,
            accountId: account.id,
            clientId: 'operator-revocation-test-client',
            resource: RESOURCE,
            scopes: ['environment:*'],
            environmentIds: [env.id]
        });
        await activateManagementMcpOAuthGrant(grantId);
        const adapter = new ManagementMcpOAuthAdapter('AccessToken', storageKey);
        await adapter.upsert(accessToken, { grantId }, 3_600);

        await expect(revokeManagementMcpOAuthGrants({ accountId: account.id }, storageKey)).resolves.toBe(1);
        await expect(adapter.find(accessToken)).resolves.toBeUndefined();
        await expect(db.knex('_nango_mcp_oauth_grants').select('status').where({ grant_id: grantId }).first()).resolves.toMatchObject({ status: 'revoked' });
    });
});

async function registerClient(redirectUris: string[]): Promise<Response> {
    return await fetch(`${api.url}/oauth/management-mcp/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_name: 'Nango MCP integration test',
            redirect_uris: redirectUris,
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            response_types: ['code'],
            scope: 'environment:*'
        })
    });
}

async function exchangeToken(params: Record<string, string | string[]>): Promise<TokenResponse> {
    const response = await fetch(`${api.url}/oauth/management-mcp/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormParams(params)
    });
    const body = (await response.json()) as TokenResponse & { error?: string; error_description?: string };
    expect(response.status, JSON.stringify(body)).toBe(200);
    return body;
}

async function expectTokenError(params: Record<string, string | string[]>, error: string): Promise<void> {
    const response = await fetch(`${api.url}/oauth/management-mcp/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: toFormParams(params)
    });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error });
}

function toFormParams(params: Record<string, string | string[]>): URLSearchParams {
    const body = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        for (const item of Array.isArray(value) ? value : [value]) {
            body.append(key, item);
        }
    }
    return body;
}

async function mcpRequest(
    token: string,
    body: Record<string, unknown>,
    environmentFilter?: string
): Promise<{ status: number; headers: Headers; json: unknown }> {
    const url = new URL('/mcp', api.url);
    if (environmentFilter !== undefined) {
        url.searchParams.set('environment', environmentFilter);
    }
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            Host: 'localhost:3003',
            Authorization: `Bearer ${token}`,
            Accept: 'application/json, text/event-stream',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    const text = await response.text();
    const dataLine = text
        .split(/\r?\n/)
        .find((line) => line.startsWith('data:'))
        ?.slice('data:'.length)
        .trim();
    return { status: response.status, headers: response.headers, json: JSON.parse(dataLine ?? text) };
}

function remapToTestServer(value: string): URL {
    const source = new URL(value);
    return new URL(`${source.pathname}${source.search}`, api.url);
}

class CookieJar {
    private readonly cookies = new Map<string, string>();

    add(headers: Headers): void {
        for (const cookie of headers.getSetCookie()) {
            const value = cookie.split(';')[0];
            if (value) {
                this.addCookie(value);
            }
        }
    }

    addCookie(cookie: string): void {
        const separator = cookie.indexOf('=');
        this.cookies.set(cookie.slice(0, separator), cookie.slice(separator + 1));
    }

    header(): string {
        return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    }
}
