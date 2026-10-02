import { describe, expect, it } from 'vitest';

import { addQueryParams, getUserAgent } from './utils.js';

const regex = 'nango-node-client/[0-9.]+ .[a-z0-9]+/[0-9a-zA-Z.-]+; node.js/[0-9.]+.';
describe('getUserAgent', () => {
    it('should output default user agent', () => {
        expect(getUserAgent()).toMatch(new RegExp(regex));
    });
    it('should output additional user agent ', () => {
        expect(getUserAgent('cli')).toMatch(new RegExp(`${regex}; cli`));
    });
});

describe('addQueryParams', () => {
    it('should be a no-op when no queries are passed', () => {
        const url = new URL('https://api.nango.dev/providers');
        addQueryParams(url);
        expect(url.search).toBe('');
    });

    it('should set a scalar value', () => {
        const url = new URL('https://api.nango.dev/providers');
        addQueryParams(url, { search: 'github' });
        expect(url.search).toBe('?search=github');
    });

    it('should keep every element of an array', () => {
        const url = new URL('https://api.nango.dev/providers');
        addQueryParams(url, { ids: ['a', 'b', 'c'] });
        expect(url.search).toBe('?ids=a&ids=b&ids=c');
        expect(url.searchParams.getAll('ids')).toEqual(['a', 'b', 'c']);
    });

    it('should replace values already present for an array key rather than appending to them', () => {
        const url = new URL('https://api.nango.dev/providers?ids=stale');
        addQueryParams(url, { ids: ['a', 'b'] });
        expect(url.searchParams.getAll('ids')).toEqual(['a', 'b']);
    });

    it('should remove the param when the array is empty', () => {
        const url = new URL('https://api.nango.dev/providers?ids=stale');
        addQueryParams(url, { ids: [] });
        expect(url.searchParams.has('ids')).toBe(false);
    });

    it('should replace values already present for a scalar key', () => {
        const url = new URL('https://api.nango.dev/providers?search=stale');
        addQueryParams(url, { search: 'github' });
        expect(url.searchParams.getAll('search')).toEqual(['github']);
    });

    it('should skip null and undefined values', () => {
        const url = new URL('https://api.nango.dev/providers');
        addQueryParams(url, { a: null, b: undefined, c: 'kept' });
        expect(url.search).toBe('?c=kept');
    });

    it('should handle arrays and scalars in the same object', () => {
        const url = new URL('https://api.nango.dev/integrations/github');
        addQueryParams(url, { include: ['webhook', 'credentials'], limit: 10 });
        expect(url.searchParams.getAll('include')).toEqual(['webhook', 'credentials']);
        expect(url.searchParams.get('limit')).toBe('10');
    });
});
