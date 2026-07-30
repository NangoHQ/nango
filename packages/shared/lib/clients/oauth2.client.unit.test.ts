import http from 'node:http';

import { AuthorizationCode } from 'simple-oauth2';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { logContextGetter } from '@nangohq/logs';

import { assertSafeOAuthUrl, getOAuthSafeHttpAgents } from '../services/proxy/outbound-policy.js';
import { getFreshOAuth2Credentials, getSimpleOAuth2ClientConfig } from './oauth2.client.js';

import type { Config as ProviderConfig } from '../models/index.js';
import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { DBConnectionDecrypted, ProviderOAuth2 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// OAuth2 token calls run through simple-oauth2 wired with the OAuth-safe agents and gated by
// `assertSafeOAuthUrl`. Neutralise the egress policy so a loopback test server is reachable (loopback is
// always blocked by the real policy) while keeping the getOAuthSafeHttpAgents() wiring intact and asserting
// the URL guard runs. The mock returns the SAME agent instances on every call so identity checks hold.
vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    const nodeHttp = await import('node:http');
    const nodeHttps = await import('node:https');
    const httpAgent = new nodeHttp.Agent();
    const httpsAgent = new nodeHttps.Agent();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        getOAuthSafeHttpAgents: vi.fn(() => ({ httpAgent, httpsAgent }))
    };
});

async function withServer(handler: http.RequestListener, fn: (baseUrl: string) => Promise<void>): Promise<void> {
    const server = http.createServer(handler);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    try {
        await fn(`http://127.0.0.1:${port}`);
    } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
    }
}

function makeConfig(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
    return {
        id: 1,
        unique_key: 'test',
        provider: 'test',
        oauth_client_id: 'client-id',
        oauth_client_secret: 'client-secret',
        oauth_scopes: '',
        environment_id: 1,
        created_at: new Date(),
        updated_at: new Date(),
        missing_fields: [],
        ...overrides
    } as ProviderConfig;
}

function makeProvider(overrides: Partial<ProviderOAuth2> = {}): ProviderOAuth2 {
    return {
        display_name: 'OAuth2 Provider',
        docs: 'https://docs.example.com',
        auth_mode: 'OAUTH2',
        ...overrides
    } as ProviderOAuth2;
}

/** Minimal token endpoint that echoes the grant type so tests can assert generation vs refresh. */
function tokenServer(tokenByGrant: Record<string, Record<string, unknown>>): http.RequestListener {
    return (req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const grantType = new URLSearchParams(body).get('grant_type') ?? 'unknown';
            const token = tokenByGrant[grantType];
            if (!token) {
                res.writeHead(400, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ error: 'unsupported_grant_type', grant_type: grantType }));
                return;
            }
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify(token));
        });
    };
}

describe('getSimpleOAuth2ClientConfig', () => {
    it('wires the OAuth-safe agents into the simple-oauth2 http config', () => {
        const provider = makeProvider({ token_url: 'https://api.example.com/token', authorization_url: 'https://api.example.com/authorize' });
        const cfg = getSimpleOAuth2ClientConfig(makeConfig(), provider, {});

        // The http.agents come straight from getOAuthSafeHttpAgents(), so token egress is pinned by policy.
        const agents = (cfg.http as { agents: { http: unknown; https: unknown } }).agents;
        expect(agents.http).toBe(getOAuthSafeHttpAgents().httpAgent);
        expect(agents.https).toBe(getOAuthSafeHttpAgents().httpsAgent);
    });
});

describe('OAuth2 token generation and refresh', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('getToken succeeds end-to-end through the safe-agent wiring', async () => {
        await withServer(
            tokenServer({
                authorization_code: { access_token: 'generated-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'generated-refresh-token' }
            }),
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/token`, authorization_url: `${baseUrl}/authorize` });
                const cfg = getSimpleOAuth2ClientConfig(makeConfig(), provider, {});
                const client = new AuthorizationCode(cfg);

                const token = await client.getToken({ code: 'auth-code', redirect_uri: 'https://app.example.com/callback' });

                expect(token.token['access_token']).toBe('generated-access-token');
            }
        );
    });

    it('getFreshOAuth2Credentials refreshes end-to-end and validates the token URL', async () => {
        await withServer(
            tokenServer({
                refresh_token: { access_token: 'refreshed-access-token', token_type: 'bearer', expires_in: 3600, refresh_token: 'rotated-refresh-token' }
            }),
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/token` });
                const config = makeConfig();
                const connection = {
                    id: 1,
                    environment_id: 1,
                    connection_config: {},
                    credentials: {
                        type: 'OAUTH2',
                        access_token: 'stale-access-token',
                        refresh_token: 'the-refresh-token',
                        expires_at: new Date(Date.now() - 60_000)
                    }
                } as unknown as DBConnectionDecrypted;

                const buffer = logContextGetter.getBuffer({ accountId: 1 });
                const result = await getFreshOAuth2Credentials({ connection, config, provider, logCtx: buffer });

                expect(result.success).toBe(true);
                expect(result.response?.access_token).toBe('refreshed-access-token');
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/token`);
            }
        );
    });

    it('getFreshOAuth2Credentials fails without issuing the refresh when the token URL is blocked by policy', async () => {
        vi.mocked(assertSafeOAuthUrl).mockRejectedValueOnce(new Error('URL resolves to a blocked address'));
        let serverHit = false;
        await withServer(
            (_req, res) => {
                serverHit = true;
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ access_token: 'should-not-happen' }));
            },
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/token` });
                const connection = {
                    id: 1,
                    environment_id: 1,
                    connection_config: {},
                    credentials: {
                        type: 'OAUTH2',
                        access_token: 'stale-access-token',
                        refresh_token: 'the-refresh-token',
                        expires_at: new Date(Date.now() - 60_000)
                    }
                } as unknown as DBConnectionDecrypted;

                const buffer = logContextGetter.getBuffer({ accountId: 1 });
                const result = await getFreshOAuth2Credentials({ connection, config: makeConfig(), provider, logCtx: buffer });

                expect(result.success).toBe(false);
                expect(result.error?.type).toBe('refresh_token_external_error');
                expect(serverHit).toBe(false);
            }
        );
    });
});
