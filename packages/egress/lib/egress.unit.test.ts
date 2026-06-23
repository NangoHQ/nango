import dns from 'node:dns/promises';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearPinnedAddressCacheForTests, createSafeHttpAgents } from './agent.js';
import {
    canonicalizeHostnameForDenylist,
    DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
    isBaseUrlOverrideDenied,
    normalizeDenylist,
    resolveProxyBaseUrlOverrideDenylist,
    resolveProxyBaseUrlOverrideDenylistForRunner
} from './denylist.js';
import { OutboundUrlError } from './errors.js';
import { classifyBlockedIp } from './ip.js';
import { resetRunnerPolicyCacheForTests, resolvePolicyForRunnerSync, resolvePolicyForServer } from './policy.js';
import { absoluteUrlFromRedirectRequestOptions, createRedirectValidator } from './redirect.js';
import { isBaseUrlOverrideDeniedByPolicy, validateOutboundUrlAsync, validateOutboundUrlSync } from './validate.js';

describe('egress denylist', () => {
    it('canonicalizes hostnames', () => {
        expect(canonicalizeHostnameForDenylist('localhost.')).toBe('localhost');
        expect(canonicalizeHostnameForDenylist('[::1]')).toBe('::1');
    });

    it('blocks denylisted hosts', () => {
        const list = normalizeDenylist([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/foo', list)).toBe(true);
    });

    it('runner denylist ignores server opt-out', () => {
        expect(resolveProxyBaseUrlOverrideDenylist('[]')).toEqual([]);
        expect(resolveProxyBaseUrlOverrideDenylistForRunner('[]')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
    });
});

describe('egress IP classification', () => {
    it('blocks loopback and RFC1918', () => {
        expect(classifyBlockedIp('127.0.0.1')).toBe('loopback');
        expect(classifyBlockedIp('10.0.0.1')).toBe('private');
        expect(classifyBlockedIp('192.168.1.1')).toBe('private');
        expect(classifyBlockedIp('169.254.169.254')).toBe('link_local');
    });

    it('allows public IPs', () => {
        expect(classifyBlockedIp('8.8.8.8')).toBeNull();
    });

    it('blocks alternative IPv6 loopback and mapped forms', () => {
        expect(classifyBlockedIp('::1')).toBe('loopback');
        expect(classifyBlockedIp('0000:0000:0000:0000:0000:0000:0000:0001')).toBe('loopback');
        expect(classifyBlockedIp('::127.0.0.1')).toBe('loopback');
        expect(classifyBlockedIp('::ffff:127.0.0.1')).toBe('loopback');
        expect(classifyBlockedIp('::ffff:7f00:1')).toBe('loopback');
    });

    it('blocks full fe80::/10 link-local prefix range', () => {
        expect(classifyBlockedIp('fe80::1')).toBe('link_local');
        expect(classifyBlockedIp('fe90::1')).toBe('link_local');
        expect(classifyBlockedIp('fea0::1')).toBe('link_local');
        expect(classifyBlockedIp('feb0::1')).toBe('link_local');
    });
});

describe('egress validateOutboundUrl', () => {
    const policy = resolvePolicyForServer({
        proxyBaseUrlOverrideDenylist: [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]
    });

    it('blocks denylisted hostname sync', () => {
        const result = validateOutboundUrlSync('http://localhost/path', policy);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('denied_hostname');
        }
    });

    it('blocks IP literals sync', () => {
        const result = validateOutboundUrlSync('http://127.0.0.1/path', policy);
        expect(result.ok).toBe(false);
    });

    it('allows public hostname sync', () => {
        const result = validateOutboundUrlSync('https://api.example.com/v1', policy);
        expect(result.ok).toBe(true);
    });

    it('blocks DNS rebinding to private IP', async () => {
        vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
        const result = await validateOutboundUrlAsync('https://allowed.example.com/path', policy);
        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe('denied_dns');
        }
    });
});

describe('egress allowlist mode', () => {
    it('allows only matching hostnames', () => {
        const policy = resolvePolicyForServer({
            proxyBaseUrlOverrideDenylist: [],
            outboundUrlPolicyRaw: JSON.stringify({
                mode: 'allowlist',
                allowlist: ['.example.com', 'api.hubspot.com'],
                blockPrivateIps: false,
                resolveDns: false
            })
        });
        expect(validateOutboundUrlSync('https://api.example.com/x', policy).ok).toBe(true);
        expect(validateOutboundUrlSync('https://evil.com/x', policy).ok).toBe(false);
    });
});

describe('egress permissive mode', () => {
    it('still blocks loopback IP literals when hostname denylist is off', () => {
        const policy = resolvePolicyForServer({ proxyBaseUrlOverrideDenylist: [] });
        expect(policy.mode).toBe('permissive');
        expect(validateOutboundUrlSync('http://127.0.0.1:8080/', policy).ok).toBe(false);
        expect(isBaseUrlOverrideDeniedByPolicy('http://127.0.0.1:8080/', policy)).toBe(true);
    });
});

describe('egress runner policy', () => {
    afterEach(() => {
        resetRunnerPolicyCacheForTests();
        clearPinnedAddressCacheForTests();
    });

    it('always applies secure defaults when denylist env is empty', () => {
        const policy = resolvePolicyForRunnerSync({ proxyBaseUrlOverrideDenylistRaw: '[]' });
        expect(policy.denylist.has('localhost')).toBe(true);
    });
});

describe('egress redirect validator', () => {
    const policy = resolvePolicyForServer({
        proxyBaseUrlOverrideDenylist: [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]
    });

    it('throws on redirect to denylisted host', () => {
        const validator = createRedirectValidator(policy);
        expect(() => validator('http://169.254.169.254/')).toThrow(OutboundUrlError);
    });

    it('allows redirect to public host', () => {
        const validator = createRedirectValidator(policy);
        expect(() => validator('https://api.example.com/next')).not.toThrow();
    });
});

describe('absoluteUrlFromRedirectRequestOptions', () => {
    it('returns href when present', () => {
        expect(absoluteUrlFromRedirectRequestOptions({ href: 'https://a.example/path' })).toBe('https://a.example/path');
    });

    it('composes from protocol, host, and path when href is missing', () => {
        expect(
            absoluteUrlFromRedirectRequestOptions({
                protocol: 'https:',
                host: 'api.example.com',
                path: '/p?q=1'
            })
        ).toBe('https://api.example.com/p?q=1');
    });

    it('includes numeric and string ports when building from hostname', () => {
        expect(
            absoluteUrlFromRedirectRequestOptions({
                protocol: 'http:',
                hostname: 'api.example.com',
                port: 8080,
                path: '/x'
            })
        ).toBe('http://api.example.com:8080/x');
        expect(
            absoluteUrlFromRedirectRequestOptions({
                protocol: 'http:',
                hostname: 'api.example.com',
                port: '8080',
                path: '/x'
            })
        ).toBe('http://api.example.com:8080/x');
    });
});

describe('egress safe lookup pinning', () => {
    const policy = resolvePolicyForServer({
        proxyBaseUrlOverrideDenylist: [...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]
    });

    afterEach(() => {
        clearPinnedAddressCacheForTests();
        vi.restoreAllMocks();
    });

    it('rejects lookup when DNS returns a blocked address', async () => {
        vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '127.0.0.1', family: 4 }] as never);
        const lookupFn = createSafeHttpAgents(policy).httpsAgent.options.lookup!;
        await expect(
            new Promise<string>((resolve, reject) => {
                lookupFn('rebind.example', {}, (err, address) => {
                    if (err) reject(err);
                    else resolve(address as string);
                });
            })
        ).rejects.toThrow(OutboundUrlError);
    });

    it('uses a single DNS lookup for pinning (no TOCTOU second lookup)', async () => {
        const lookupSpy = vi.spyOn(dns, 'lookup').mockResolvedValue([{ address: '8.8.8.8', family: 4 }] as never);
        const lookupFn = createSafeHttpAgents(policy).httpsAgent.options.lookup!;
        const address = await new Promise<string>((resolve, reject) => {
            lookupFn('api.example.com', {}, (err, addr) => {
                if (err) reject(err);
                else resolve(addr as string);
            });
        });
        expect(address).toBe('8.8.8.8');
        expect(lookupSpy).toHaveBeenCalledTimes(1);
    });
});
