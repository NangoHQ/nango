import { describe, expect, it } from 'vitest';

import { canonicalizeHostnameForDenylist, isBaseUrlOverrideDenied, normalizeDenylist, normalizeDenylistHost } from './baseUrlOverrideDenylist.js';

describe('canonicalizeHostnameForDenylist', () => {
    it('strips trailing FQDN dot', () => {
        expect(canonicalizeHostnameForDenylist('localhost.')).toBe('localhost');
    });

    it('strips bracketed IPv6', () => {
        expect(canonicalizeHostnameForDenylist('[::1]')).toBe('::1');
    });
});

describe('normalizeDenylistHost', () => {
    it('lowercases bare hostname', () => {
        expect(normalizeDenylistHost('LOCALHOST')).toBe('localhost');
    });

    it('extracts hostname from URL', () => {
        expect(normalizeDenylistHost('http://169.254.169.254/path')).toBe('169.254.169.254');
    });

    it('canonicalizes trailing dot in URL hostname', () => {
        expect(normalizeDenylistHost('http://localhost./path')).toBe('localhost');
    });

    it('normalizes bracketed IPv6 denylist entry to match URL hostname', () => {
        expect(normalizeDenylistHost('[::1]')).toBe('::1');
    });

    it('returns empty for whitespace-only', () => {
        expect(normalizeDenylistHost('  ')).toBe('');
    });

    it('normalizes bare IPv4 alternate spellings like URL (integer, octal, hex)', () => {
        expect(normalizeDenylistHost('2852039166')).toBe('169.254.169.254');
        expect(normalizeDenylistHost('0177.0.0.1')).toBe('127.0.0.1');
        expect(normalizeDenylistHost('0x7f.0.0.1')).toBe('127.0.0.1');
    });
});

describe('normalizeDenylist', () => {
    it('dedupes', () => {
        expect(normalizeDenylist(['localhost', 'LOCALHOST', 'http://localhost/'])).toEqual(new Set(['localhost']));
    });

    it('returns empty set when input is undefined or empty', () => {
        expect(normalizeDenylist(undefined)).toEqual(new Set());
        expect(normalizeDenylist([])).toEqual(new Set());
    });
});

describe('isBaseUrlOverrideDenied', () => {
    it('returns false when denylist empty', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/', new Set())).toBe(false);
    });

    it('returns true on exact hostname match', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/foo', new Set(['169.254.169.254']))).toBe(true);
    });

    it('matches when denylist uses bare IPv4 integer and override uses dotted decimal', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/', normalizeDenylist(['2852039166']))).toBe(true);
    });

    it('returns false when host not listed', () => {
        expect(isBaseUrlOverrideDenied('https://api.github.com', new Set(['169.254.169.254']))).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(isBaseUrlOverrideDenied('http://LOCALHOST:8080/', new Set(['localhost']))).toBe(true);
    });

    it('matches when override uses trailing-dot hostname and denylist lists bare host', () => {
        expect(isBaseUrlOverrideDenied('http://localhost./', normalizeDenylist(['localhost']))).toBe(true);
    });

    it('matches IPv6 when denylist uses bracketed literal', () => {
        const list = normalizeDenylist(['[::1]']);
        expect(isBaseUrlOverrideDenied('http://[::1]/', list)).toBe(true);
    });

    it('matches URL-form deny entry with bracketed IPv6', () => {
        const list = normalizeDenylist(['http://[::1]/']);
        expect(isBaseUrlOverrideDenied('http://[::1]/path', list)).toBe(true);
    });

    it('fails closed when URL cannot be parsed and denylist is non-empty', () => {
        expect(isBaseUrlOverrideDenied('http://', new Set(['localhost']))).toBe(true);
    });
});
