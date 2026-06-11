import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
    DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST,
    canonicalizeHostnameForDenylist,
    isBaseUrlOverrideDenied,
    mergeProxyBaseUrlOverrideDenylist,
    normalizeDenylistHost,
    resolveProxyBaseUrlOverrideDenylist
} from './baseUrlOverrideDenylist.js';

describe('runner-sdk baseUrlOverrideDenylist', () => {
    beforeEach(() => {
        vi.resetModules();
        delete process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'];
        delete process.env['AWS_LAMBDA_RUNTIME_API'];
    });

    afterEach(() => {
        delete process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'];
        delete process.env['AWS_LAMBDA_RUNTIME_API'];
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

    it('resolveProxyBaseUrlOverrideDenylist returns defaults when unset', () => {
        expect(resolveProxyBaseUrlOverrideDenylist(undefined)).toEqual([...DEFAULT_NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST]);
    });

    it('resolveProxyBaseUrlOverrideDenylist allows explicit opt-out', () => {
        expect(resolveProxyBaseUrlOverrideDenylist('[]')).toEqual([]);
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

    it('getBaseUrlOverrideDenylistFromEnv honors explicit opt-out', async () => {
        process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'] = '[]';
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.size).toBe(0);
    });

    it('getBaseUrlOverrideDenylistFromEnv auto-denies AWS Lambda runtime API host', async () => {
        process.env['NANGO_PROXY_BASE_URL_OVERRIDE_DENYLIST'] = '[]';
        process.env['AWS_LAMBDA_RUNTIME_API'] = '127.0.0.1:9001';
        const { getBaseUrlOverrideDenylistFromEnv: getDenylist } = await import('./baseUrlOverrideDenylist.js');
        const denylist = getDenylist();
        expect(denylist.has('127.0.0.1')).toBe(true);
    });
});
