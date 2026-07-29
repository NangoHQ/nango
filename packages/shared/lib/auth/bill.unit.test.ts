import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { assertSafeOAuthUrl } from '../services/proxy/outbound-policy.js';
import { createCredentials } from './bill.js';

import type * as OutboundPolicyModule from '../services/proxy/outbound-policy.js';
import type { ProviderBill } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// The BILL login/session call goes through the OAuth egress policy. Neutralise the policy here so the
// flow can reach a loopback test server (loopback is always blocked by the real policy), while still
// asserting that the URL guard is invoked before the request is sent.
vi.mock('../services/proxy/outbound-policy.js', async (importOriginal) => {
    const actual = await importOriginal<typeof OutboundPolicyModule>();
    return {
        ...actual,
        assertSafeOAuthUrl: vi.fn((url: string) => Promise.resolve(new URL(url))),
        // `proxy: false` keeps axios off any ambient HTTP(S)_PROXY so the loopback test server is reached directly.
        getOAuthAxiosRequestConfig: vi.fn(() => ({ proxy: false }))
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

function makeProvider(overrides: Partial<ProviderBill> = {}): ProviderBill {
    return {
        display_name: 'Bill',
        docs: 'https://docs.example.com',
        auth_mode: 'BILL',
        ...overrides
    } as ProviderBill;
}

describe('bill createCredentials', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('generates a session end-to-end through the guarded egress path', async () => {
        await withServer(
            (req, res) => {
                let body = '';
                req.on('data', (chunk) => (body += chunk));
                req.on('end', () => {
                    res.writeHead(200, { 'content-type': 'application/json' });
                    res.end(JSON.stringify({ sessionId: 'sess-abc', organizationId: 'org-1', userId: 'user-9' }));
                });
            },
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/login` });
                const result = await createCredentials({ username: 'u', password: 'p', organizationId: 'org-1', devKey: 'dev-key', provider });

                expect(result.isOk()).toBe(true);
                if (result.isOk()) {
                    expect(result.value.type).toBe('BILL');
                    expect(result.value.session_id).toBe('sess-abc');
                    expect(result.value.organization_id).toBe('org-1');
                    expect(result.value.user_id).toBe('user-9');
                }
                // The token URL is validated before the request is issued.
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/login`);
            }
        );
    });

    it('refresh re-runs the same guarded login call and yields a fresh session', async () => {
        // BILL has no dedicated refresh endpoint: connection.service refreshes by calling createCredentials
        // again with the stored username/password. A second call must therefore succeed the same way.
        let calls = 0;
        await withServer(
            (_req, res) => {
                calls += 1;
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(JSON.stringify({ sessionId: `sess-${calls}`, organizationId: 'org-1', userId: 'user-9' }));
            },
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/login` });
                const first = await createCredentials({ username: 'u', password: 'p', organizationId: 'org-1', devKey: 'dev-key', provider });
                const refreshed = await createCredentials({ username: 'u', password: 'p', organizationId: 'org-1', devKey: 'dev-key', provider });

                expect(first.isOk() && first.value.session_id).toBe('sess-1');
                expect(refreshed.isOk() && refreshed.value.session_id).toBe('sess-2');
                expect(calls).toBe(2);
            }
        );
    });

    it('does not issue the login request when the token URL is blocked by policy', async () => {
        vi.mocked(assertSafeOAuthUrl).mockRejectedValueOnce(new Error('URL resolves to a blocked address'));
        let serverHit = false;
        await withServer(
            (_req, res) => {
                serverHit = true;
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end('{}');
            },
            async (baseUrl) => {
                const provider = makeProvider({ token_url: `${baseUrl}/login` });
                const result = await createCredentials({ username: 'u', password: 'p', organizationId: 'org-1', devKey: 'dev-key', provider });

                expect(result.isErr()).toBe(true);
                if (result.isErr()) {
                    expect(result.error.type).toBe('bill_tokens_fetch_error');
                }
                // The guard short-circuits before any HTTP request reaches the endpoint.
                expect(serverHit).toBe(false);
            }
        );
    });
});
