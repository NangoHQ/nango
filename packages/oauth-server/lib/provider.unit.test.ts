import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createOAuthAdapter } from './adapter.js';
import { allowCimdFetch, secureCimdFetch } from './cimd.js';
import { createOAuthProvider } from './provider.js';

import type { Knex } from 'knex';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type Provider from 'oidc-provider';
import type { Adapter, AdapterPayload, Interaction } from 'oidc-provider';

vi.mock('./adapter.js', () => ({ createOAuthAdapter: vi.fn(), OAUTH_GRANT_TTL_SECONDS: 30 * 24 * 60 * 60 }));
vi.mock('./cimd.js', async (importOriginal) => {
    const actual = await importOriginal();
    if (!actual || typeof actual !== 'object') {
        throw new Error('Invalid CIMD module mock');
    }
    return { ...actual, allowCimdFetch: vi.fn(), secureCimdFetch: vi.fn() };
});

const artifacts = new Map<string, AdapterPayload>();
const adapter = (model: string): Adapter => ({
    upsert: (id, payload) => {
        artifacts.set(`${model}:${id}`, payload);
        return Promise.resolve();
    },
    find: (id) => Promise.resolve(artifacts.get(`${model}:${id}`)),
    findByUid: (uid) => Promise.resolve([...artifacts].find(([key, payload]) => key.startsWith(`${model}:`) && payload.uid === uid)?.[1]),
    findByUserCode: (userCode) => Promise.resolve([...artifacts].find(([key, payload]) => key.startsWith(`${model}:`) && payload.userCode === userCode)?.[1]),
    consume: (id) => {
        const value = artifacts.get(`${model}:${id}`);
        if (value) value.consumed = Math.floor(Date.now() / 1000);
        return Promise.resolve();
    },
    destroy: (id) => {
        artifacts.delete(`${model}:${id}`);
        return Promise.resolve();
    },
    revokeByGrantId: (grantId) => {
        for (const [key, payload] of artifacts) {
            if (payload.grantId === grantId) artifacts.delete(key);
        }
        return Promise.resolve();
    }
});

describe('OAuth provider', () => {
    let origin: string;
    let server: ReturnType<typeof createServer>;
    let provider: Provider;
    let clientId: string;
    let cimdFetches = 0;

    beforeAll(async () => {
        vi.mocked(createOAuthAdapter).mockReturnValue(adapter);
        vi.mocked(allowCimdFetch).mockImplementation((candidate) => Promise.resolve(candidate.startsWith('https://client.example.com/oauth/')));
        vi.mocked(secureCimdFetch).mockImplementation((input, init) => {
            cimdFetches++;
            const fetchedClientId = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
            expect(init?.redirect).toBe('manual');
            if (fetchedClientId.endsWith('/redirect.json')) {
                return Promise.resolve(new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } }));
            }
            if (fetchedClientId.endsWith('/mismatch.json')) {
                return Promise.resolve(
                    new Response(JSON.stringify({ client_id: 'https://attacker.example.com/metadata.json' }), {
                        status: 200,
                        headers: { 'content-type': 'application/json' }
                    })
                );
            }
            if (fetchedClientId.endsWith('/oversized.json')) {
                return Promise.resolve(new Response('x'.repeat(5 * 1024 + 1), { status: 200, headers: { 'content-type': 'application/json' } }));
            }
            return Promise.resolve(
                new Response(
                    JSON.stringify({
                        client_id: fetchedClientId,
                        client_name: 'Test MCP Client',
                        redirect_uris: ['https://client.example.com/callback'],
                        grant_types: ['authorization_code', 'refresh_token'],
                        response_types: ['code'],
                        token_endpoint_auth_method: 'none',
                        scope: 'environment:* agent-session:*'
                    }),
                    { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'max-age=3600' } }
                )
            );
        });

        const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
        clientId = 'https://client.example.com/oauth/metadata.json';
        provider = createOAuthProvider({
            knex: vi.fn() as unknown as Knex,
            config: {
                baseUrl: 'http://localhost',
                cookieKeys: ['a'.repeat(32), 'b'.repeat(32)],
                encryptionKey: Buffer.alloc(32, 's').toString('base64'),
                jwks: { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' }] }
            },
            resources: [
                {
                    resource: 'https://mcp.example.com/mcp',
                    scopes: ['environment:*']
                },
                {
                    resource: 'https://api.example.com/agent-sessions/session-1/mcp',
                    scopes: ['agent-session:*']
                }
            ]
        });
        const providerCallback = provider.callback();
        server = createServer((req, res) => {
            void handleProviderRequest(provider, providerCallback, req, res);
        });
        await new Promise<void>((resolve) => server.listen(0, resolve));
        const address = server.address() as AddressInfo;
        origin = `http://127.0.0.1:${address.port}`;
    });

    afterAll(async () => {
        await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    });

    it('advertises the CIMD-only authorization code server', async () => {
        const response = await fetch(`${origin}/.well-known/oauth-authorization-server`);
        const discovery = (await response.json()) as Record<string, unknown>;

        expect(response.status).toBe(200);
        expect(discovery).toMatchObject({
            issuer: 'http://localhost',
            authorization_endpoint: 'http://localhost/oauth/authorize',
            token_endpoint: 'http://localhost/oauth/token',
            revocation_endpoint: 'http://localhost/oauth/revoke',
            jwks_uri: 'http://localhost/oauth/jwks',
            client_id_metadata_document_supported: true,
            grant_types_supported: ['authorization_code', 'refresh_token'],
            response_types_supported: ['code'],
            code_challenge_methods_supported: ['S256']
        });
        expect(discovery).not.toHaveProperty('registration_endpoint');
        expect(discovery).not.toHaveProperty('userinfo_endpoint');
        expect(discovery['scopes_supported']).toContain('environment:*');
        expect(discovery['scopes_supported']).toContain('agent-session:*');
        expect(discovery['scopes_supported']).not.toContain('openid');
    });

    it('uses OAuth-specific cookie names that cannot shadow the Nango dashboard session', () => {
        expect(provider.cookieName('session')).toBe('nango_oauth_session');
        expect(provider.cookieName('interaction')).toBe('nango_oauth_interaction');
        expect(provider.cookieName('resume')).toBe('nango_oauth_resume');
    });

    it('does not expose dynamic client registration', async () => {
        const response = await fetch(`${origin}/oauth/register`, { method: 'POST' });
        expect(response.status).toBe(404);
    });

    it('rejects OpenID Connect scopes', async () => {
        const response = await fetch(`${origin}/oauth/authorize?scope=openid%20environment%3A*`);

        expect(response.status).toBe(400);
        expect(await response.json()).toStrictEqual({
            error: 'invalid_scope',
            error_description: 'OpenID Connect scopes are not supported'
        });
    });

    it('completes authorization code and rotating refresh token grants with a cached CIMD client', async () => {
        const first = await authorize(provider, origin, clientId);
        const tokens = await exchangeCode(origin, clientId, first.code, first.verifier);

        expect(tokens).toMatchObject({
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'environment:*'
        });
        expect(typeof tokens['access_token']).toBe('string');
        expect(typeof tokens['refresh_token']).toBe('string');

        const refreshed = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(tokens['refresh_token']),
            resource: 'https://mcp.example.com/mcp'
        });
        expect(refreshed.response.status).toBe(200);
        expect(typeof refreshed.body['access_token']).toBe('string');
        expect(typeof refreshed.body['refresh_token']).toBe('string');
        expect(refreshed.body['refresh_token']).not.toBe(tokens['refresh_token']);

        const replay = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(tokens['refresh_token']),
            resource: 'https://mcp.example.com/mcp'
        });
        expect(replay.response.status).toBe(400);
        expect(replay.body['error']).toBe('invalid_grant');
        expect(cimdFetches).toBe(1);
    });

    it('grants several resources in one authorization flow and issues a resource-specific token for each', async () => {
        const managementResource = 'https://mcp.example.com/mcp';
        const agentSessionResource = 'https://api.example.com/agent-sessions/session-1/mcp';
        const authorization = await authorize(provider, origin, clientId, [managementResource, agentSessionResource], 'environment:* agent-session:*');
        const managementTokens = await exchangeCode(origin, clientId, authorization.code, authorization.verifier, managementResource);

        expect(managementTokens).toMatchObject({
            token_type: 'Bearer',
            expires_in: 3600,
            scope: 'environment:*'
        });
        expect(artifacts.get(`AccessToken:${stringValue(managementTokens['access_token'])}`)).toMatchObject({
            aud: managementResource,
            scope: 'environment:*'
        });

        const agentSessionTokens = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(managementTokens['refresh_token']),
            resource: agentSessionResource
        });
        expect(agentSessionTokens.response.status).toBe(200);
        expect(agentSessionTokens.body).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'agent-session:*' });
        expect(artifacts.get(`AccessToken:${stringValue(agentSessionTokens.body['access_token'])}`)).toMatchObject({
            aud: agentSessionResource,
            scope: 'agent-session:*'
        });
        expect(provider.issuer).toBe('http://localhost');
    });

    it('requires the exact resource at authorization and token boundaries', async () => {
        const authorization = await authorize(provider, origin, clientId);
        const missingAtToken = await postToken(origin, {
            grant_type: 'authorization_code',
            client_id: clientId,
            code: authorization.code,
            redirect_uri: 'https://client.example.com/callback',
            code_verifier: authorization.verifier
        });

        expect(missingAtToken.response.status).toBe(400);
        expect(missingAtToken.body['error']).toBe('invalid_target');

        const verifier = randomBytes(32).toString('base64url');
        const invalidAuthorization = new URL(`${origin}/oauth/authorize`);
        invalidAuthorization.search = authorizationParams(clientId, verifier, 'https://mcp.example.com/not-mcp').toString();
        const response = await fetch(invalidAuthorization, { redirect: 'manual' });

        expect(response.status).toBe(303);
        const location = response.headers.get('location');
        if (!location) throw new Error('Missing authorization error redirect');
        expect(new URL(location).searchParams.get('error')).toBe('invalid_target');

        const refreshAuthorization = await authorize(provider, origin, clientId);
        const tokens = await exchangeCode(origin, clientId, refreshAuthorization.code, refreshAuthorization.verifier);
        const missingAtRefresh = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(tokens['refresh_token'])
        });
        expect(missingAtRefresh.response.status).toBe(400);
        expect(missingAtRefresh.body['error']).toBe('invalid_target');

        const retryAfterMissing = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(tokens['refresh_token']),
            resource: 'https://mcp.example.com/mcp'
        });
        expect(retryAfterMissing.response.status).toBe(200);

        const wrongResourceAuthorization = await authorize(provider, origin, clientId);
        const wrongResourceTokens = await exchangeCode(origin, clientId, wrongResourceAuthorization.code, wrongResourceAuthorization.verifier);
        const notGrantedAtRefresh = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(wrongResourceTokens['refresh_token']),
            resource: 'https://api.example.com/agent-sessions/session-1/mcp'
        });
        expect(notGrantedAtRefresh.response.status).toBe(400);
        expect(notGrantedAtRefresh.body['error']).toBe('invalid_target');

        const retryAfterNotGranted = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: stringValue(wrongResourceTokens['refresh_token']),
            resource: 'https://mcp.example.com/mcp'
        });
        expect(retryAfterNotGranted.response.status).toBe(200);
    });

    it('revokes a refresh-token grant', async () => {
        const authorization = await authorize(provider, origin, clientId);
        const tokens = await exchangeCode(origin, clientId, authorization.code, authorization.verifier);
        const refreshToken = stringValue(tokens['refresh_token']);
        const revocation = await fetch(`${origin}/oauth/revoke`, {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ client_id: clientId, token: refreshToken, token_type_hint: 'refresh_token' })
        });

        expect(revocation.status).toBe(200);
        const refreshed = await postToken(origin, {
            grant_type: 'refresh_token',
            client_id: clientId,
            refresh_token: refreshToken,
            resource: 'https://mcp.example.com/mcp'
        });
        expect(refreshed.response.status).toBe(400);
        expect(refreshed.body['error']).toBe('invalid_grant');
    });

    it('does not follow redirects or cache invalid and oversized CIMD responses', async () => {
        const before = cimdFetches;

        await expect(provider.Client.find('https://client.example.com/oauth/redirect.json')).rejects.toThrow();
        await expect(provider.Client.find('https://client.example.com/oauth/mismatch.json')).rejects.toThrow();
        await expect(provider.Client.find('https://client.example.com/oauth/mismatch.json')).rejects.toThrow();
        await expect(provider.Client.find('https://client.example.com/oauth/oversized.json')).rejects.toThrow();

        expect(cimdFetches).toBe(before + 4);
    });

    it('coalesces concurrent CIMD fetches for one client ID', async () => {
        const before = cimdFetches;
        const candidate = 'https://client.example.com/oauth/concurrent.json';

        await Promise.all(Array.from({ length: 10 }, async () => await provider.Client.find(candidate)));

        expect(cimdFetches).toBe(before + 1);
    });

    it('bounds the valid CIMD document cache', async () => {
        const before = cimdFetches;
        // oidc-provider's max-size 100 LRU uses recent and stale generations. Two full
        // generations must pass before a frequently used entry is guaranteed evicted.
        for (let index = 0; index < 200; index++) {
            const candidate = `https://client.example.com/oauth/client-${index}.json`;
            const verifier = randomBytes(32).toString('base64url');
            const authorization = new URL(`${origin}/oauth/authorize`);
            authorization.search = authorizationParams(candidate, verifier, 'https://mcp.example.com/mcp').toString();
            const response = await fetch(authorization, { redirect: 'manual' });
            expect(response.status).toBe(303);
        }
        expect(cimdFetches).toBe(before + 200);

        const verifier = randomBytes(32).toString('base64url');
        const authorization = new URL(`${origin}/oauth/authorize`);
        authorization.search = authorizationParams(clientId, verifier, 'https://mcp.example.com/mcp').toString();
        await fetch(authorization, { redirect: 'manual' });
        expect(cimdFetches).toBe(before + 201);
    });
});

async function handleProviderRequest(
    provider: Provider,
    providerCallback: ReturnType<Provider['callback']>,
    req: IncomingMessage,
    res: ServerResponse
): Promise<void> {
    try {
        if (req.url?.startsWith('/oauth/interaction/')) {
            await finishTestInteraction(provider, req, res);
            return;
        }
        await providerCallback(req, res);
    } catch (err) {
        res.statusCode = 500;
        res.end(err instanceof Error ? err.message : 'Unknown test error');
    }
}

async function finishTestInteraction(provider: Provider, req: IncomingMessage, res: ServerResponse): Promise<void> {
    const interaction = await provider.interactionDetails(req, res);
    res.setHeader('x-test-prompt', `${interaction.prompt.name}:${interaction.prompt.reasons.join(',')}:${JSON.stringify(interaction.prompt.details)}`);
    if (interaction.prompt.name === 'login') {
        await provider.interactionFinished(req, res, { login: { accountId: 'test-account', amr: ['test'], remember: false } });
        return;
    }
    if (interaction.prompt.name !== 'consent') {
        throw new Error(`Unexpected test interaction prompt: ${interaction.prompt.name}`);
    }

    const clientId = interactionParam(interaction, 'client_id');
    const grant = interaction.grantId ? await provider.Grant.find(interaction.grantId) : new provider.Grant({ accountId: 'test-account', clientId });
    if (!grant) throw new Error('Test grant disappeared');
    let addedScopes = false;
    const missingOidcScopes: unknown = interaction.prompt.details['missingOIDCScope'];
    if (isStringArray(missingOidcScopes)) {
        grant.addOIDCScope(missingOidcScopes.join(' '));
        addedScopes = true;
    }
    const missingResourceScopes: unknown = interaction.prompt.details['missingResourceScopes'];
    if (missingResourceScopes && typeof missingResourceScopes === 'object' && !Array.isArray(missingResourceScopes)) {
        for (const [resource, scopes] of Object.entries(missingResourceScopes)) {
            if (!isStringArray(scopes)) throw new Error(`Invalid test resource scopes for ${resource}`);
            grant.addResourceScope(resource, scopes.join(' '));
            addedScopes = true;
        }
    }
    if (!addedScopes) {
        throw new Error(`Test interaction did not request scopes: ${JSON.stringify(interaction.prompt.details)}`);
    }
    const grantId = await grant.save();
    await provider.interactionFinished(req, res, { consent: { grantId } });
}

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string');
}

async function authorize(
    provider: Provider,
    origin: string,
    clientId: string,
    resource: string | readonly string[] = 'https://mcp.example.com/mcp',
    scope = 'environment:*'
): Promise<{ code: string; verifier: string }> {
    const verifier = randomBytes(32).toString('base64url');
    const authorization = new URL(`${origin}/oauth/authorize`);
    authorization.search = authorizationParams(clientId, verifier, resource, scope).toString();
    let nextUrl = authorization.href;
    const cookies = new Map<string, string>();
    const visited: string[] = [];

    for (let redirects = 0; redirects < 10; redirects++) {
        const headers = new Headers();
        if (cookies.size) {
            headers.set('cookie', [...cookies].map(([name, value]) => `${name}=${value}`).join('; '));
        }
        const response = await fetch(nextUrl, {
            headers,
            redirect: 'manual'
        });
        rememberCookies(response, cookies);
        const location = response.headers.get('location');
        visited.push(`${response.status} ${nextUrl} -> ${location ?? '(none)'} [${response.headers.get('x-test-prompt') ?? ''}]`);
        if (!location) throw new Error(`OAuth test flow stopped with ${response.status}: ${await response.text()}`);
        const resolved = new URL(location, nextUrl);
        if (resolved.origin === 'https://client.example.com') {
            expect(resolved.searchParams.get('state')).toBe('test-state');
            const code = resolved.searchParams.get('code');
            if (!code) throw new Error(`OAuth test flow failed: ${resolved.searchParams.get('error') ?? 'missing code'}`);
            return { code, verifier };
        }
        nextUrl = resolved.href.replace(provider.issuer, origin);
    }
    throw new Error(`OAuth test flow exceeded the redirect limit:\n${visited.join('\n')}`);
}

function authorizationParams(clientId: string, verifier: string, resource: string | readonly string[], scope = 'environment:*'): URLSearchParams {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: 'https://client.example.com/callback',
        response_type: 'code',
        scope,
        state: 'test-state',
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256'
    });
    for (const value of typeof resource === 'string' ? [resource] : resource) {
        params.append('resource', value);
    }
    return params;
}

async function exchangeCode(
    origin: string,
    clientId: string,
    code: string,
    verifier: string,
    resource = 'https://mcp.example.com/mcp'
): Promise<Record<string, unknown>> {
    const result = await postToken(origin, {
        grant_type: 'authorization_code',
        client_id: clientId,
        code,
        redirect_uri: 'https://client.example.com/callback',
        code_verifier: verifier,
        resource
    });
    expect(result.response.status).toBe(200);
    return result.body;
}

async function postToken(origin: string, input: Record<string, string>): Promise<{ response: Response; body: Record<string, unknown> }> {
    const response = await fetch(`${origin}/oauth/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(input)
    });
    return { response, body: (await response.json()) as Record<string, unknown> };
}

function rememberCookies(response: Response, cookies: Map<string, string>): void {
    for (const cookie of response.headers.getSetCookie()) {
        const [pair] = cookie.split(';');
        if (!pair) continue;
        const separator = pair.indexOf('=');
        if (separator < 1) continue;
        cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
}

function interactionParam(interaction: Interaction, name: string): string {
    const value = interaction.params[name];
    if (typeof value !== 'string') throw new Error(`Missing ${name} in test interaction`);
    return value;
}

function stringValue(value: unknown): string {
    if (typeof value !== 'string') throw new Error('Expected a string token');
    return value;
}
