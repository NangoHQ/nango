import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    canonicalizeHostnameForDenylist,
    DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
    isBaseUrlOverrideDenied,
    mergeProxyBaseUrlOverrideDenylist,
    normalizeDenylist,
    normalizeDenylistHost,
    resolveProxyBaseUrlOverrideDenylist
} from './baseUrlOverrideDenylist.js';

describe('runner-sdk baseUrlOverrideDenylist', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.unstubAllEnvs();
    });

    afterEach(() => {
        vi.unstubAllEnvs();
    });

    it('matches utils canonicalizeHostnameForDenylist behavior', () => {
        expect(canonicalizeHostnameForDenylist('localhost.')).toBe('localhost');
        expect(canonicalizeHostnameForDenylist('[::1]')).toBe('::1');
    });

    it('matches utils normalizeDenylistHost behavior', () => {
        expect(normalizeDenylistHost('LOCALHOST')).toBe('localhost');
        expect(normalizeDenylistHost('http://169.254.169.254/path')).toBe('169.254.169.254');
    });

    it('matches utils isBaseUrlOverrideDenied behavior', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/', new Set())).toBe(false);
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/foo', new Set(['169.254.169.254']))).toBe(true);
    });

    it('blocks IPv4-mapped IPv6 loopback with default denylist', () => {
        const list = normalizeDenylist([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(isBaseUrlOverrideDenied('http://[::ffff:127.0.0.1]/', list)).toBe(true);
    });

    it('resolveProxyBaseUrlOverrideDenylist returns defaults when unset', () => {
        expect(resolveProxyBaseUrlOverrideDenylist(undefined)).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
    });

    it('resolveProxyBaseUrlOverrideDenylist applies secure defaults for empty env (runner does not inherit server opt-out)', () => {
        expect(resolveProxyBaseUrlOverrideDenylist('[]')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(resolveProxyBaseUrlOverrideDenylist('[ ]')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(resolveProxyBaseUrlOverrideDenylist('[\n]')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(resolveProxyBaseUrlOverrideDenylist('')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
    });

    it('resolveProxyBaseUrlOverrideDenylist falls back to secure defaults on malformed JSON', () => {
        expect(resolveProxyBaseUrlOverrideDenylist('not-json')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(resolveProxyBaseUrlOverrideDenylist('null')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
        expect(resolveProxyBaseUrlOverrideDenylist('{}')).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
    });

    it('mergeProxyBaseUrlOverrideDenylist merges custom entries with defaults', () => {
        expect(mergeProxyBaseUrlOverrideDenylist(['denylisted-proxy-test.invalid'])).toEqual([
            ...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
            'denylisted-proxy-test.invalid'
        ]);
    });

    it('getBaseUrlOverrideDenylistFromEnv applies defaults when env is unset', async () => {
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.has('localhost')).toBe(true);
        expect(denylist.has('169.254.169.254')).toBe(true);
    });

    it('getBaseUrlOverrideDenylistFromEnv applies secure defaults when denylist env is empty', async () => {
        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', '[]');
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.has('localhost')).toBe(true);
        expect(denylist.has('169.254.169.254')).toBe(true);
    });

    it('getBaseUrlOverrideDenylistFromEnv enforces secure defaults when override feature is disabled', async () => {
        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_ENABLED', 'false');
        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', '[]');
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.has('localhost')).toBe(true);
        expect(denylist.has('169.254.169.254')).toBe(true);
    });

    it('getBaseUrlOverrideDenylistFromEnv auto-denies AWS Lambda runtime API host', async () => {
        vi.stubEnv('NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST', '[]');
        vi.stubEnv('AWS_LAMBDA_RUNTIME_API', '127.0.0.1:9001');
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.has('127.0.0.1')).toBe(true);
    });
});
