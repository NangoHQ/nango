import { describe, expect, it } from 'vitest';

import { OutboundUrlError } from '@nangohq/egress';

import {
    assertSafeOAuthUrl,
    getOAuthAxiosRequestConfig,
    getOAuthOutboundUrlPolicy,
    getOAuthSafeHttpAgents,
    getOAuthSafeUndiciDispatcher
} from './outbound-policy.js';

describe('OAuth outbound url policy', () => {
    it('allows RFC1918 by default so self-hosted token endpoints keep working', () => {
        expect(getOAuthOutboundUrlPolicy().blockPrivateIps).toBe(false);
    });

    it('allows a private IP-literal token URL by default', async () => {
        await expect(assertSafeOAuthUrl('http://10.0.0.5/oauth/token')).resolves.toBeInstanceOf(URL);
    });

    it('blocks loopback and cloud-metadata token URLs (fail closed)', async () => {
        await expect(assertSafeOAuthUrl('http://127.0.0.1/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
        await expect(assertSafeOAuthUrl('http://169.254.169.254/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
        await expect(assertSafeOAuthUrl('http://localhost/oauth/token')).rejects.toBeInstanceOf(OutboundUrlError);
    });

    it('exposes pinned node agents and an undici dispatcher for OAuth requests', () => {
        const agents = getOAuthSafeHttpAgents();
        expect(agents.httpAgent).toBeDefined();
        expect(agents.httpsAgent).toBeDefined();
        expect(getOAuthSafeUndiciDispatcher()).toBeDefined();
    });

    describe('getOAuthAxiosRequestConfig', () => {
        it('attaches pinned agents and caps redirects from the OAuth policy', () => {
            const policy = getOAuthOutboundUrlPolicy();
            const cfg = getOAuthAxiosRequestConfig();
            expect(cfg.httpAgent).toBeDefined();
            expect(cfg.httpsAgent).toBeDefined();
            expect(cfg.maxRedirects).toBe(policy.maxRedirects);
            expect(typeof cfg.beforeRedirect).toBe('function');
        });

        it('blocks redirect hops to blocked IP-literal targets', () => {
            const cfg = getOAuthAxiosRequestConfig();
            expect(() => cfg.beforeRedirect!({ href: 'http://169.254.169.254/latest/meta-data/' } as any, {} as any, {} as any)).toThrow(OutboundUrlError);
            expect(() => cfg.beforeRedirect!({ href: 'http://127.0.0.1/oauth/token' } as any, {} as any, {} as any)).toThrow(OutboundUrlError);
        });

        it('allows redirect hops to public hosts (DNS rebinding is caught later by the agent)', () => {
            const cfg = getOAuthAxiosRequestConfig();
            expect(() => cfg.beforeRedirect!({ href: 'https://api.example.com/next' } as any, {} as any, {} as any)).not.toThrow();
        });
    });
});
