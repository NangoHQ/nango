import http from 'node:http';

import { afterEach, describe, expect, it, vi } from 'vitest';

import connectionService from './connection.service.js';
import { assertSafeOAuthUrl } from './proxy/outbound-policy.js';

import type * as OutboundPolicyModule from './proxy/outbound-policy.js';
import type { ProviderTwoStep } from '@nangohq/types';
import type { AddressInfo } from 'node:net';

// TWO_STEP token exchange runs axios through the OAuth egress policy and gates every hop with
// `assertSafeOAuthUrl`. Neutralise the policy so loopback test servers are reachable (loopback is always
// blocked by the real policy) while still exercising the multi-step flow and the URL guard.
vi.mock('./proxy/outbound-policy.js', async (importOriginal) => {
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

describe('getTwoStepCredentials', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    it('completes a multi-step token exchange, threading the first response into the second call', async () => {
        const seen: Record<string, string> = {};
        await withServer(
            (req, res) => {
                let body = '';
                req.on('data', (chunk) => (body += chunk));
                req.on('end', () => {
                    seen[req.url ?? ''] = body;
                    res.writeHead(200, { 'content-type': 'application/json' });
                    if (req.url === '/step1') {
                        res.end(JSON.stringify({ code: 'code-abc' }));
                    } else {
                        res.end(JSON.stringify({ access_token: 'final-two-step-token' }));
                    }
                });
            },
            async (baseUrl) => {
                const provider: ProviderTwoStep = {
                    display_name: 'Two Step',
                    docs: 'https://docs.example.com',
                    auth_mode: 'TWO_STEP',
                    token_url: `${baseUrl}/step1`,
                    token_params: { grant: 'first' },
                    token_response: { token: 'access_token' },
                    additional_steps: [{ token_url: `${baseUrl}/step2`, token_params: { code: '${step1.code}' } }]
                };

                const result = await connectionService.getTwoStepCredentials('test-two-step', provider, {}, {}, false);

                expect(result.success).toBe(true);
                expect(result.response?.token).toBe('final-two-step-token');
                // Step 2 received the value produced by step 1.
                expect(JSON.parse(seen['/step2'] ?? '{}')).toStrictEqual({ code: 'code-abc' });
                // Both hops were validated through the egress policy.
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/step1`);
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/step2`);
            }
        );
    });

    it('refreshes against the refresh_url when a refresh token is present', async () => {
        await withServer(
            (req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                if (req.url === '/refresh') {
                    res.end(JSON.stringify({ access_token: 'refreshed-two-step-token', refresh_token: 'rotated-rt' }));
                } else {
                    res.end(JSON.stringify({ access_token: 'should-not-be-used' }));
                }
            },
            async (baseUrl) => {
                const provider: ProviderTwoStep = {
                    display_name: 'Two Step',
                    docs: 'https://docs.example.com',
                    auth_mode: 'TWO_STEP',
                    token_url: `${baseUrl}/token`,
                    refresh_url: `${baseUrl}/refresh`,
                    refresh_token_params: { grant_type: 'refresh_token', token: '${refresh_token}' },
                    token_response: { token: 'access_token', refresh_token: 'refresh_token' }
                };

                const result = await connectionService.getTwoStepCredentials('test-two-step', provider, { refresh_token: 'existing-rt' }, {}, true);

                expect(result.success).toBe(true);
                expect(result.response?.token).toBe('refreshed-two-step-token');
                // Refresh must hit the dedicated refresh URL, which is validated by the egress policy.
                expect(assertSafeOAuthUrl).toHaveBeenCalledWith(`${baseUrl}/refresh`);
            }
        );
    });
});
