import http from 'node:http';
import https from 'node:https';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertSafeOAuthUrl } from '@nangohq/shared';

import { extractQueryParams, OAuth1Client } from './oauth1.client.js';

import type * as NangoShared from '@nangohq/shared';
import type { IntegrationConfig, ProviderOAuth1 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// OAuth1 token calls run through node-oauth, which we pin to the OAuth-safe agents and gate with
// `assertSafeOAuthUrl`. Neutralise the egress policy here so a loopback test server is reachable
// (loopback is always blocked by the real policy) while still exercising the guarded flow.
vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        getOAuthSafeHttpAgents: vi.fn(() => ({ httpAgent: new http.Agent(), httpsAgent: new https.Agent() }))
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

const config = { oauth_client_id: 'client-id', oauth_client_secret: 'client-secret' } as IntegrationConfig;

function makeProvider(overrides: Partial<ProviderOAuth1>): ProviderOAuth1 {
    return {
        display_name: 'OAuth1 Provider',
        docs: 'https://docs.example.com',
        auth_mode: 'OAUTH1',
        signature_method: 'HMAC-SHA1',
        request_url: 'https://example.com/request',
        token_url: 'https://example.com/access',
        ...overrides
    } as ProviderOAuth1;
}

describe('oauth1', () => {
    it('should extract query params', () => {
        const res = extractQueryParams('baz=bar&foo=bar');
        expect(res).toStrictEqual({ baz: 'bar', foo: 'bar' });
    });

    it('should extract undefined query params', () => {
        const res = extractQueryParams(undefined);
        expect(res).toStrictEqual({});
    });
});

describe('OAuth1Client egress', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('fetches a request token end-to-end through the guarded, pinned client', async () => {
        await withServer(
            (_req, res) => {
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('oauth_token=req-token&oauth_token_secret=req-secret&oauth_callback_confirmed=true');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                const result = await client.getOAuthRequestToken();

                expect(result.request_token).toBe('req-token');
                expect(result.request_token_secret).toBe('req-secret');
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/request`);
            }
        );
    });

    it('exchanges the verifier for an access token end-to-end', async () => {
        await withServer(
            (_req, res) => {
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('oauth_token=access-token&oauth_token_secret=access-secret');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                const result = (await client.getOAuthAccessToken('req-token', 'req-secret', 'the-verifier')) as Record<string, string>;

                expect(result['oauth_token']).toBe('access-token');
                expect(result['oauth_token_secret']).toBe('access-secret');
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/access`);
            }
        );
    });

    it('does not issue the request-token call when the request URL is blocked by policy', async () => {
        vi.mocked(assertSafeOAuthUrl).mockRejectedValueOnce(new Error('URL resolves to a blocked address'));
        let serverHit = false;
        await withServer(
            (_req, res) => {
                serverHit = true;
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('oauth_token=should-not-happen');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                await expect(client.getOAuthRequestToken()).rejects.toThrow();
                expect(serverHit).toBe(false);
            }
        );
    });
});
