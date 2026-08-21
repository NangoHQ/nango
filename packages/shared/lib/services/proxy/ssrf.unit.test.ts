import { describe, expect, it } from 'vitest';

import { DEFAULT_OUTBOUND_URL_POLICY, OutboundUrlError } from '@nangohq/egress';

import { getTestConnection } from '../../seeders/connection.seeder.js';
import { getAxiosConfiguration } from './utils.js';
import { getDefaultProxy } from './utils.test.js';

import type { OutboundUrlPolicy } from '@nangohq/egress';

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
