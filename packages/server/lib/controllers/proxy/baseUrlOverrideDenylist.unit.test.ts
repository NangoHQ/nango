import { describe, expect, it } from 'vitest';

import { isBaseUrlOverrideDenied, normalizeDenylist, normalizeDenylistHost } from './baseUrlOverrideDenylist.js';

describe('normalizeDenylistHost', () => {
    it('lowercases bare hostname', () => {
        expect(normalizeDenylistHost('LOCALHOST')).toBe('localhost');
    });

    it('extracts hostname from URL', () => {
        expect(normalizeDenylistHost('http://169.254.169.254/path')).toBe('169.254.169.254');
    });

    it('returns empty for whitespace-only', () => {
        expect(normalizeDenylistHost('  ')).toBe('');
    });
});

describe('normalizeDenylist', () => {
    it('dedupes', () => {
        expect(normalizeDenylist(['localhost', 'LOCALHOST', 'http://localhost/'])).toEqual(['localhost']);
    });
});

describe('isBaseUrlOverrideDenied', () => {
    it('returns false when denylist empty', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/', [])).toBe(false);
    });

    it('returns true on exact hostname match', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/foo', ['169.254.169.254'])).toBe(true);
    });

    it('matches URL-form deny entry', () => {
        expect(isBaseUrlOverrideDenied('http://169.254.169.254/', ['http://169.254.169.254'])).toBe(true);
    });

    it('returns false when host not listed', () => {
        expect(isBaseUrlOverrideDenied('https://api.github.com', ['169.254.169.254'])).toBe(false);
    });

    it('is case-insensitive', () => {
        expect(isBaseUrlOverrideDenied('http://LOCALHOST:8080/', ['localhost'])).toBe(true);
    });
});
