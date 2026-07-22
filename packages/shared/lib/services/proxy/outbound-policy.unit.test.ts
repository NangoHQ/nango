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
        const requestDetails = { url: 'https://sts.example.com/oauth/token', method: 'POST', headers: {} as Record<string, string> };
        const responseDetails = { headers: {} as Record<string, string>, statusCode: 302 };

        it('attaches pinned agents and caps redirects from the OAuth policy', () => {
            const policy = getOAuthOutboundUrlPolicy();
            const cfg = getOAuthAxiosRequestConfig();
            expect(cfg.httpAgent).toBeDefined();
            expect(cfg.httpsAgent).toBeDefined();
            expect(cfg.maxRedirects).toBe(policy.maxRedirects);
            expect(typeof cfg.beforeRedirect).toBe('function');
        });

        it('blocks redirect hops to blocked IP-literal targets (href shape from follow-redirects)', () => {
            const cfg = getOAuthAxiosRequestConfig();
            expect(() => cfg.beforeRedirect!({ href: 'http://169.254.169.254/latest/meta-data/' } as any, responseDetails, requestDetails)).toThrow(
                OutboundUrlError
            );
            expect(() => cfg.beforeRedirect!({ href: 'http://127.0.0.1/oauth/token' } as any, responseDetails, requestDetails)).toThrow(OutboundUrlError);
        });

        it('blocks redirect hops built from protocol/hostname/path (fallback when href is absent)', () => {
            const cfg = getOAuthAxiosRequestConfig();
            expect(() =>
                cfg.beforeRedirect!(
                    { protocol: 'http:', hostname: '169.254.169.254', path: '/latest/meta-data/', headers: {} } as any,
                    responseDetails,
                    requestDetails
                )
            ).toThrow(OutboundUrlError);
        });

        it('allows redirect hops to public hosts (DNS rebinding is caught later by the agent)', () => {
            const cfg = getOAuthAxiosRequestConfig();
            expect(() =>
                cfg.beforeRedirect!({ protocol: 'https:', host: 'api.example.com', path: '/next', headers: {} } as any, responseDetails, requestDetails)
            ).not.toThrow();
        });

        it('strips credential headers on cross-origin redirects', () => {
            const cfg = getOAuthAxiosRequestConfig();
            const headers: Record<string, string> = {
                authorization: 'Bearer secret-jwt',
                'x-api-key': 'sts-secret',
                'content-type': 'application/json',
                'user-agent': 'Nango'
            };
            cfg.beforeRedirect!({ href: 'https://evil.example/capture', headers } as any, responseDetails, requestDetails);
            expect(headers['authorization']).toBeUndefined();
            expect(headers['x-api-key']).toBeUndefined();
            expect(headers['content-type']).toBe('application/json');
            expect(headers['user-agent']).toBe('Nango');
        });

        it('keeps credential headers on same-origin redirects', () => {
            const cfg = getOAuthAxiosRequestConfig();
            const headers: Record<string, string> = {
                authorization: 'Bearer secret-jwt',
                'x-api-key': 'sts-secret'
            };
            cfg.beforeRedirect!({ href: 'https://sts.example.com/oauth/token?next=1', headers } as any, responseDetails, requestDetails);
            expect(headers['authorization']).toBe('Bearer secret-jwt');
            expect(headers['x-api-key']).toBe('sts-secret');
        });
    });
});
