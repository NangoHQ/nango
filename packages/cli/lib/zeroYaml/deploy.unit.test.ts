import { describe, expect, it } from 'vitest';

import { getFetchError } from './deploy.js';

describe('zero yaml deploy', () => {
    it('surfaces fetch error cause codes', () => {
        const cause = Object.assign(new Error('getaddrinfo ENOTFOUND nango-server'), { code: 'ENOTFOUND' });
        const err = new TypeError('fetch failed', { cause });

        expect(getFetchError(err)).toBe('ENOTFOUND: getaddrinfo ENOTFOUND nango-server');
    });

    it('surfaces aggregate fetch error causes', () => {
        const cause = new AggregateError([Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })], 'All promises failed');
        const err = new TypeError('fetch failed', { cause });

        expect(getFetchError(err)).toBe('ECONNREFUSED: connect ECONNREFUSED');
    });
});
