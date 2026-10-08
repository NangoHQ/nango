import assert from 'node:assert';
import http from 'node:http';
import https from 'node:https';

import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_OUTBOUND_URL_POLICY, OutboundUrlError } from '@nangohq/egress';
import * as egress from '@nangohq/egress';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { ProxyRequest } from './request.js';
import { enforceProxyOutboundUrlPolicy, getAxiosConfiguration } from './utils.js';
import { getDefaultProxy, permissiveTestOutboundPolicy } from './utils.test.js';

import type { OutboundUrlPolicy } from '@nangohq/egress';
import type { AddressInfo } from 'node:net';

const policy: OutboundUrlPolicy = DEFAULT_OUTBOUND_URL_POLICY;
const connection = getTestConnection();

function buildConfig({ baseUrl, endpoint = '/', outboundPolicy }: { baseUrl: string; endpoint?: string; outboundPolicy?: OutboundUrlPolicy }) {
    return getAxiosConfiguration({
        proxyConfig: getDefaultProxy({ provider: { proxy: { base_url: baseUrl } }, endpoint }),
        connection,
        ...(outboundPolicy ? { outboundPolicy } : {})
    });
}

describe('proxy outbound policy wiring', () => {
    it.each(['${nope}||ATTACKER_URL', '%24%7Bnope%7D%7C%7CATTACKER_URL', '${apiKey}'])(
        'prevents credential leakage to the attacker for caller query %s',
        async (payload) => {
            // Loopback is always blocked by egress. Permit the in-process transport while retaining
            // the proxy's configured-origin and base URL override checks.
            const validateSpy = vi.spyOn(egress, 'assertSafeOutboundUrlSync').mockImplementation((url) => new URL(url));
            const agents = { httpAgent: new http.Agent(), httpsAgent: new https.Agent() };
            const agentsSpy = vi.spyOn(egress, 'getSafeHttpAgents').mockReturnValue(agents);
            const providerRequest = vi.fn((_req: http.IncomingMessage, res: http.ServerResponse) => {
                res.end('provider');
            });
            const attackerRequest = vi.fn((_req: http.IncomingMessage, res: http.ServerResponse) => {
                res.end('attacker');
            });
            const provider = http.createServer(providerRequest);
            const attacker = http.createServer(attackerRequest);
            await new Promise<void>((resolve) => provider.listen(0, '127.0.0.1', resolve));
            await new Promise<void>((resolve) => attacker.listen(0, '127.0.0.1', resolve));

            try {
                const providerBase = `http://127.0.0.1:${(provider.address() as AddressInfo).port}`;
                const attackerUrl = `http://127.0.0.1:${(attacker.address() as AddressInfo).port}/collect`;
                const query = payload.replace('ATTACKER_URL', attackerUrl);
                const proxy = new ProxyRequest({
                    proxyConfig: getDefaultProxy({
                        provider: { proxy: { base_url: `${providerBase}/api`, headers: { 'x-api-key': '${apiKey}' } } },
                        endpoint: `/v1/me?x=${query}`,
                        validateProxyRequestUrl: ({ absoluteUrl, proxyConfig, connection }) => {
                            enforceProxyOutboundUrlPolicy({ absoluteUrl, proxyConfig, connection, overrideEnabled: false, denylist: new Set() });
                        }
                    }),
                    getConnection: () => getTestConnection({ credentials: { type: 'API_KEY', apiKey: 'stored-secret' } }),
                    getIntegrationConfig: () => ({ oauth_client_id: null, oauth_client_secret: null }),
                    outboundPolicy: permissiveTestOutboundPolicy,
                    maxWaitMs: Infinity,
                    logger: vi.fn()
                });

                const result = await proxy.request();
                if (query.includes('${')) {
                    expect(result.isErr()).toBe(true);
                    if (result.isErr()) {
                        expect(result.error).toMatchObject({ code: 'invalid_proxy_url' });
                    }
                    expect(providerRequest).not.toHaveBeenCalled();
                    expect(attackerRequest).not.toHaveBeenCalled();
                    return;
                }

                expect(result.unwrap().data).toBe('provider');
                expect(providerRequest).toHaveBeenCalledOnce();
                expect(attackerRequest).not.toHaveBeenCalled();
                const request = providerRequest.mock.calls[0]?.[0];
                assert(request?.url);
                expect(request.headers['x-api-key']).toBe('stored-secret');
                expect(request.url).not.toContain('stored-secret');
                const url = new URL(request.url, providerBase);
                expect(url.pathname).toBe('/api/v1/me');
                expect(url.searchParams.get('x')).toBe(decodeURIComponent(query));
            } finally {
                validateSpy.mockRestore();
                agentsSpy.mockRestore();
                agents.httpAgent.destroy();
                agents.httpsAgent.destroy();
                await Promise.all([
                    new Promise<void>((resolve) => provider.close(() => resolve())),
                    new Promise<void>((resolve) => attacker.close(() => resolve()))
                ]);
            }
        }
    );

    it('attaches DNS-pinning agents and caps redirects when a policy is present', () => {
        const cfg = buildConfig({ baseUrl: 'https://api.example.com', outboundPolicy: policy });
        expect(cfg.httpAgent).toBeDefined();
        expect(cfg.httpsAgent).toBeDefined();
        expect(cfg.maxRedirects).toBe(policy.maxRedirects);
    });

    it('reuses the same agents across requests for the same policy (connection pooling)', () => {
        const a = buildConfig({ baseUrl: 'https://api.example.com', outboundPolicy: policy });
        const b = buildConfig({ baseUrl: 'https://other.example.com', outboundPolicy: policy });
        expect(a.httpsAgent).toBe(b.httpsAgent);
        expect(a.httpAgent).toBe(b.httpAgent);
    });

    it('does not attach agents or cap redirects when no policy is present (back-compat)', () => {
        const cfg = buildConfig({ baseUrl: 'https://api.example.com' });
        expect(cfg.httpAgent).toBeUndefined();
        expect(cfg.httpsAgent).toBeUndefined();
        expect(cfg.maxRedirects).toBeUndefined();
    });

    it.each([
        ['loopback', 'http://127.0.0.1'],
        ['ipv6 loopback', 'http://[::1]'],
        ['private RFC1918', 'http://10.0.0.1'],
        ['link-local cloud metadata', 'http://169.254.169.254']
    ])('blocks %s IP-literal targets synchronously', (_label, baseUrl) => {
        expect(() => buildConfig({ baseUrl, outboundPolicy: policy })).toThrow(OutboundUrlError);
    });

    it('does not block blocked IP literals when no policy is configured (back-compat)', () => {
        expect(() => buildConfig({ baseUrl: 'http://10.0.0.1' })).not.toThrow();
    });

    it('blocks redirect hops to blocked IP-literal targets', () => {
        const cfg = buildConfig({ baseUrl: 'https://api.example.com', outboundPolicy: policy });
        expect(typeof cfg.beforeRedirect).toBe('function');
        expect(() => cfg.beforeRedirect!({ href: 'http://169.254.169.254/latest/meta-data/' } as any, {} as any, {} as any)).toThrow(OutboundUrlError);
    });

    it('allows redirect hops to public hosts (DNS rebinding is caught later by the agent)', () => {
        const cfg = buildConfig({ baseUrl: 'https://api.example.com', outboundPolicy: policy });
        expect(() => cfg.beforeRedirect!({ href: 'https://api.example.com/next' } as any, {} as any, {} as any)).not.toThrow();
    });
});
