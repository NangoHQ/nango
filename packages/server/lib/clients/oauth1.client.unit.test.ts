import http from 'node:http';
import https from 'node:https';

import oAuth1 from 'oauth';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { assertSafeOAuthUrl, getOAuthRedirectPolicy, getOAuthSafeHttpAgents } from '@nangohq/shared';

import { extractQueryParams, OAuth1Client } from './oauth1.client.js';

import type * as NangoShared from '@nangohq/shared';
import type { IntegrationConfig, ProviderOAuth1 } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// OAuth1 token calls run through node-oauth, which we pin to the OAuth-safe agents and gate with
// `assertSafeOAuthUrl`. Neutralise the egress policy here so a loopback test server is reachable
// (loopback is always blocked by the real policy) while still exercising the guarded flow.
// The agents are stable singletons so the internal-wiring tests can assert the exact instances
// node-oauth was pinned to. `maxRedirects` is lowered so the redirect-cap test needs only a short chain.
const TEST_MAX_REDIRECTS = 2;

vi.mock('@nangohq/shared', async (importOriginal) => {
    const actual = await importOriginal<typeof NangoShared>();
    const nodeHttp = await import('node:http');
    const nodeHttps = await import('node:https');
    const httpAgent = new nodeHttp.Agent();
    const httpsAgent = new nodeHttps.Agent();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        getOAuthSafeHttpAgents: vi.fn(() => ({ httpAgent, httpsAgent })),
        getOAuthRedirectPolicy: vi.fn(() => ({ maxRedirects: 2, validate: () => Promise.resolve() }))
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

// The private node-oauth members OAuth1Client overrides to enforce egress. Declared here so the
// internal-wiring tests below have a typed handle on them and fail loudly if node-oauth changes them.
interface NodeOAuthInternals {
    _clientOptions: { followRedirects: boolean };
    _createClient: (port: number, hostname: string, method: string, path: string, headers: http.OutgoingHttpHeaders, sslEnabled: boolean) => http.ClientRequest;
    _performSecureRequest: (
        oauthToken: string | null,
        oauthTokenSecret: string | null,
        method: string,
        url: string,
        extraParams: Record<string, unknown> | null,
        postBody: string | Buffer | null,
        postContentType: string | undefined,
        callback?: (err: unknown, data?: unknown, res?: unknown) => void
    ) => http.ClientRequest | undefined;
}

function getNodeOAuthInternals(client: OAuth1Client): NodeOAuthInternals {
    return (client as unknown as { client: NodeOAuthInternals }).client;
}

/** Minimal ClientRequest stand-in so factory/streaming tests never open a real socket. */
function fakeClientRequest(): http.ClientRequest {
    const stub = { on: () => stub, write: () => true, end: () => undefined, destroy: () => undefined };
    return stub as unknown as http.ClientRequest;
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
    beforeEach(() => {
        // Reset to the permissive default; individual tests override with rejections for blocked hops.
        vi.mocked(assertSafeOAuthUrl).mockImplementation((url: string) => Promise.resolve(new URL(url)));
    });
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

    it('follows a 302 redirect on the request-token endpoint, validating each hop', async () => {
        await withServer(
            (req, res) => {
                if (req.url === '/request') {
                    // node-oauth follows 301/302 by re-requesting the absolute Location.
                    res.writeHead(302, { location: `http://${req.headers.host}/request-final` });
                    res.end();
                    return;
                }
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('oauth_token=redirected-token&oauth_token_secret=redirected-secret&oauth_callback_confirmed=true');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                const result = await client.getOAuthRequestToken();

                // The redirect was followed rather than surfaced as a token error.
                expect(result.request_token).toBe('redirected-token');
                // Both the original URL and the redirect target were validated.
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/request`);
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/request-final`);
            }
        );
    });

    it('rejects a redirect whose target is blocked by policy without following it', async () => {
        // Permit the initial endpoint, but block the redirect target (e.g. cloud metadata).
        vi.mocked(assertSafeOAuthUrl).mockImplementation((url: string) =>
            url.includes('169.254.169.254') ? Promise.reject(new Error('URL resolves to a blocked address')) : Promise.resolve(new URL(url))
        );
        await withServer(
            (_req, res) => {
                res.writeHead(302, { location: 'http://169.254.169.254/latest/meta-data/' });
                res.end();
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                await expect(client.getOAuthRequestToken()).rejects.toThrow();
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith('http://169.254.169.254/latest/meta-data/');
            }
        );
    });

    it('stops a redirect loop at the policy cap instead of issuing unbounded requests', async () => {
        let requestCount = 0;
        await withServer(
            (req, res) => {
                requestCount += 1;
                // A token endpoint that redirects to itself forever. node-oauth has no cap of its own, so
                // without the wrapper's budget this would recurse until the process gave out.
                res.writeHead(302, { location: `http://${req.headers.host}/loop` });
                res.end();
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/loop`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                await expect(client.getOAuthRequestToken()).rejects.toThrow(`Maximum number of redirects (${TEST_MAX_REDIRECTS}) exceeded`);
                // The initial request plus exactly `maxRedirects` hops, matching the undici OAuth path.
                expect(requestCount).toBe(TEST_MAX_REDIRECTS + 1);
            }
        );
    });

    it('caps redirects on the access-token flow too', async () => {
        let requestCount = 0;
        await withServer(
            (req, res) => {
                requestCount += 1;
                res.writeHead(302, { location: `http://${req.headers.host}/loop` });
                res.end();
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/loop` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                await expect(client.getOAuthAccessToken('req-token', 'req-secret', 'the-verifier')).rejects.toThrow(
                    `Maximum number of redirects (${TEST_MAX_REDIRECTS}) exceeded`
                );
                expect(requestCount).toBe(TEST_MAX_REDIRECTS + 1);
            }
        );
    });

    it('counts hops per token request, so a fresh call starts with a full redirect budget', async () => {
        let requestCount = 0;
        await withServer(
            (req, res) => {
                requestCount += 1;
                if (req.url === '/request') {
                    res.writeHead(302, { location: `http://${req.headers.host}/request-final` });
                    res.end();
                    return;
                }
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('oauth_token=req-token&oauth_token_secret=req-secret&oauth_callback_confirmed=true');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                // Reusing one client for several redirecting calls must not exhaust a shared budget.
                for (let i = 0; i < TEST_MAX_REDIRECTS + 2; i++) {
                    await expect(client.getOAuthRequestToken()).resolves.toMatchObject({ request_token: 'req-token' });
                }
                expect(requestCount).toBe((TEST_MAX_REDIRECTS + 2) * 2);
            }
        );
    });
});

// These tests deliberately reach into node-oauth's private `_createClient` / `_performSecureRequest`
// members because that is exactly the surface our egress hardening overrides. They document and lock in
// the internal contract we depend on, so a node-oauth upgrade that renames, removes, or reshapes those
// members (which would silently bypass DNS pinning / per-hop URL validation) fails here instead.
describe('OAuth1Client node-oauth internal wiring', () => {
    beforeEach(() => {
        vi.mocked(assertSafeOAuthUrl).mockImplementation((url: string) => Promise.resolve(new URL(url)));
    });
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('depends on node-oauth private members that still exist on the prototype', () => {
        const proto = oAuth1.OAuth.prototype as unknown as Partial<NodeOAuthInternals>;
        expect(typeof proto._createClient).toBe('function');
        expect(typeof proto._performSecureRequest).toBe('function');
    });

    it('leaves redirect following on and takes its hop budget from the OAuth policy', () => {
        const provider = makeProvider({ request_url: 'https://example.com/request', token_url: 'https://example.com/access' });
        const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

        // Redirects are followed, so the cap in the `_performSecureRequest` wrapper is the only thing bounding
        // node-oauth's uncapped redirect recursion; it must come from the policy rather than a local constant.
        expect(getNodeOAuthInternals(client)._clientOptions.followRedirects).toBe(true);
        expect(getOAuthRedirectPolicy).toHaveBeenCalled();
    });

    it('replaces _createClient and _performSecureRequest on the constructed instance', () => {
        const provider = makeProvider({ request_url: 'https://example.com/request', token_url: 'https://example.com/access' });
        const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

        const proto = oAuth1.OAuth.prototype as unknown as NodeOAuthInternals;
        const internals = getNodeOAuthInternals(client);

        expect(typeof internals._createClient).toBe('function');
        expect(typeof internals._performSecureRequest).toBe('function');
        // The instance members must be our overrides, not node-oauth's originals.
        expect(internals._createClient).not.toBe(proto._createClient);
        expect(internals._performSecureRequest).not.toBe(proto._performSecureRequest);
    });

    it('_createClient pins every request (http + https) to the injected OAuth-safe agents', () => {
        const provider = makeProvider({ request_url: 'https://example.com/request', token_url: 'https://example.com/access' });
        const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');
        const internals = getNodeOAuthInternals(client);
        const { httpAgent, httpsAgent } = getOAuthSafeHttpAgents();

        const httpsSpy = vi.spyOn(https, 'request').mockReturnValue(fakeClientRequest());
        const httpSpy = vi.spyOn(http, 'request').mockReturnValue(fakeClientRequest());

        try {
            internals._createClient(443, 'example.com', 'POST', '/access', { 'x-test': '1' }, true);
            internals._createClient(80, 'example.com', 'GET', '/request', {}, false);

            expect(httpsSpy).toHaveBeenCalledWith(
                expect.objectContaining({ host: 'example.com', port: 443, path: '/access', method: 'POST', agent: httpsAgent })
            );
            expect(httpSpy).toHaveBeenCalledWith(expect.objectContaining({ host: 'example.com', port: 80, path: '/request', method: 'GET', agent: httpAgent }));
        } finally {
            httpsSpy.mockRestore();
            httpSpy.mockRestore();
        }
    });

    it('the _performSecureRequest wrapper validates the hop, then delegates to node-oauth (callback path)', async () => {
        await withServer(
            (_req, res) => {
                res.writeHead(200, { 'content-type': 'application/x-www-form-urlencoded' });
                res.end('delegated=yes');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');
                const url = `${baseUrl}/secure`;

                const data = await new Promise<string>((resolve, reject) => {
                    getNodeOAuthInternals(client)._performSecureRequest(null, null, 'GET', url, null, '', undefined, (err, body) =>
                        err ? reject(err as Error) : resolve(body as string)
                    );
                });

                // The wrapper ran the policy check and the original node-oauth implementation issued the request.
                expect(data).toBe('delegated=yes');
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(url);
            }
        );
    });

    it('the _performSecureRequest wrapper surfaces a blocked hop via the callback without issuing a request', async () => {
        vi.mocked(assertSafeOAuthUrl).mockRejectedValueOnce(new Error('URL resolves to a blocked address'));
        let serverHit = false;
        await withServer(
            (_req, res) => {
                serverHit = true;
                res.end('should-not-happen');
            },
            async (baseUrl) => {
                const provider = makeProvider({ request_url: `${baseUrl}/request`, token_url: `${baseUrl}/access` });
                const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

                const error = await new Promise<unknown>((resolve) => {
                    getNodeOAuthInternals(client)._performSecureRequest(null, null, 'GET', `${baseUrl}/blocked`, null, '', undefined, (err) => resolve(err));
                });

                expect(error).toBeInstanceOf(Error);
                // The guard short-circuits before node-oauth issues the request.
                expect(serverHit).toBe(false);
            }
        );
    });

    it('the _performSecureRequest wrapper delegates streaming (no-callback) requests untouched, skipping validation', () => {
        const provider = makeProvider({ request_url: 'https://example.com/request', token_url: 'https://example.com/access' });
        const client = new OAuth1Client(config, provider, 'https://app.example.com/callback');

        const fakeRequest = fakeClientRequest();
        const httpSpy = vi.spyOn(http, 'request').mockReturnValue(fakeRequest);

        try {
            const returned = getNodeOAuthInternals(client)._performSecureRequest(
                null,
                null,
                'GET',
                'http://example.com/stream',
                null,
                '',
                undefined,
                undefined
            );

            // No callback => the wrapper must not run the async policy check; it simply hands off to node-oauth.
            expect(assertSafeOAuthUrl).not.toHaveBeenCalled();
            expect(httpSpy).toHaveBeenCalledOnce();
            expect(returned).toBe(fakeRequest);
        } finally {
            httpSpy.mockRestore();
        }
    });
});
